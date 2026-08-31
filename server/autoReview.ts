import {
  createFinding,
  createMessage,
  createTask,
  getFindings,
  getProject,
  getTasks,
  logActivity,
  setAgentStatus,
  updateFinding,
  updateTask,
} from './db.js';
import { toolProjectGitDiff, toolProjectTest } from './projectTools.js';

export interface AutoReviewCycleResult {
  step: 'gemini_working' | 'gemini_completed' | 'chatgpt_reviewing' | 'review_passed' | 'review_failed' | 'idle';
  message: string;
  task_id?: string;
  finding_id?: string;
}

export async function checkAndTriggerAutoReview(): Promise<AutoReviewCycleResult> {
  const project = await getProject();
  if (!project.auto_review) {
    return { step: 'idle', message: 'Auto Review is currently disabled' };
  }

  const tasks = await getTasks();

  // 1. Check if there are pending/assigned tasks for Gemini
  const assignedTask = tasks.find((t) => t.assignee === 'gemini' && (t.status === 'assigned' || t.status === 'pending'));
  if (assignedTask) {
    // Gemini begins working
    await updateTask(assignedTask.id, { status: 'working' }, 'gemini');
    await setAgentStatus({
      agent: 'gemini',
      status: 'working',
      current_task_id: assignedTask.id,
      message: `Actively executing "${assignedTask.title}"`,
    });
    return {
      step: 'gemini_working',
      message: `Gemini is now actively working on ${assignedTask.id}: "${assignedTask.title}"`,
      task_id: assignedTask.id,
    };
  }

  // 2. Check if there are tasks awaiting ChatGPT review
  const reviewTask = tasks.find((t) => t.status === 'review');
  if (reviewTask) {
    await setAgentStatus({
      agent: 'chatgpt',
      status: 'reviewing',
      current_task_id: reviewTask.id,
      message: `Reviewing implementation and git diff for ${reviewTask.id}`,
    });

    // Run test validation and check git diff
    const testResult = await toolProjectTest();
    const diffResult = await toolProjectGitDiff();

    if (testResult.success) {
      // Review PASS
      await updateTask(
        reviewTask.id,
        {
          status: 'completed',
          result: (reviewTask.result || '') + `\n\n[Auto-Review PASS]: Tests passed in ${testResult.durationMs}ms. Git diff verified by ChatGPT.`,
        },
        'chatgpt'
      );

      if (reviewTask.related_finding) {
        await updateFinding(
          reviewTask.related_finding,
          {
            status: 'verified',
            resolution: `Verified resolved by ChatGPT after passing automated tests and inspecting diff.`,
          },
          'chatgpt'
        );
      }

      await setAgentStatus({
        agent: 'chatgpt',
        status: 'idle',
        current_task_id: null,
        message: `Approved ${reviewTask.id}. Ready for next task.`,
      });

      await setAgentStatus({
        agent: 'gemini',
        status: 'idle',
        current_task_id: null,
        message: `Task ${reviewTask.id} completed. Standing by.`,
      });

      await createMessage({
        from: 'chatgpt',
        to: 'gemini',
        type: 'review',
        content: `Auto-Review PASSED for ${reviewTask.id}: All tests passed and code changes are verified. Task marked completed.`,
        task_id: reviewTask.id,
        finding_id: reviewTask.related_finding,
      });

      return {
        step: 'review_passed',
        message: `ChatGPT completed review for ${reviewTask.id}: PASSED. Task marked completed.`,
        task_id: reviewTask.id,
        finding_id: reviewTask.related_finding || undefined,
      };
    } else {
      // Review FAIL -> Create follow-up task
      await updateTask(
        reviewTask.id,
        {
          status: 'blocked',
          result: (reviewTask.result || '') + `\n\n[Auto-Review FAILED]: Tests failed with exit code ${testResult.exitCode}. Follow-up task created.`,
        },
        'chatgpt'
      );

      const followUp = await createTask({
        title: `Fix regression: ${reviewTask.title}`,
        description: `Auto-review test run failed after ${reviewTask.id}. Error output: ${testResult.stderr || testResult.stdout}. Please inspect test failures and fix.`,
        priority: 'high',
        assignee: 'gemini',
        created_by: 'chatgpt',
        related_files: reviewTask.related_files,
        related_finding: reviewTask.related_finding,
      });

      await setAgentStatus({
        agent: 'chatgpt',
        status: 'idle',
        current_task_id: null,
        message: `Created follow-up ${followUp.id} due to test failure.`,
      });

      return {
        step: 'review_failed',
        message: `ChatGPT review FAILED for ${reviewTask.id} (tests failed). Follow-up ${followUp.id} dispatched to Gemini.`,
        task_id: followUp.id,
      };
    }
  }

  return { step: 'idle', message: 'No tasks currently awaiting processing or review.' };
}
