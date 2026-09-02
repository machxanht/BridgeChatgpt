import {
  createMessage,
  getFindings,
  getProject,
  getTasks,
  logActivity,
  updateTask,
} from './db.js';
import { toolProjectGitDiff, toolProjectTest } from './projectTools.js';

export interface AutoReviewCycleResult {
  step: 'ci_passed' | 'ci_failed' | 'awaiting_chatgpt_review' | 'gemini_working' | 'idle';
  message: string;
  task_id?: string;
  finding_id?: string;
  test_output?: string;
}

/**
 * CI / Verification Coordinator
 * Runs automated project test checks on tasks in 'review' status to provide verified CI data
 * for ChatGPT or human reviewers, but NEVER fabricates artificial approval.
 */
export async function checkAndTriggerAutoReview(): Promise<AutoReviewCycleResult> {
  const project = await getProject();
  if (!project.auto_review) {
    return { step: 'idle', message: 'Automated CI verification is currently disabled' };
  }

  const tasks = await getTasks();

  // Check if there are tasks awaiting ChatGPT review that need automated CI verification
  const reviewTasks = tasks.filter((t) => t.status === 'review');
  const unverifiedReviewTask = reviewTasks.find((t) => !t.result || !t.result.includes('[Automated CI Check]'));

  if (unverifiedReviewTask) {
    // Run automated tests in background to assist the reviewer
    const testResult = await toolProjectTest({
      command: project.test_command || 'npm run lint',
      agent: 'system',
    });

    const diffResult = await toolProjectGitDiff();

    const timestamp = new Date().toISOString();
    let ciNote = '';

    if (testResult.success) {
      ciNote = `\n\n[Automated CI Check at ${timestamp}]: PASSED (exit code 0 in ${testResult.durationMs}ms).\nReady for explicit review decision via "task_review".`;

      await updateTask(
        unverifiedReviewTask.id,
        {
          result: (unverifiedReviewTask.result || '') + ciNote,
        },
        'system'
      );

      await logActivity({
        agent: 'system',
        action: `Automated CI Check Passed`,
        entity_type: 'task',
        entity_id: unverifiedReviewTask.id,
        details: `Tests PASSED in ${testResult.durationMs}ms. Awaiting ChatGPT review.`,
      });

      return {
        step: 'ci_passed',
        message: `Automated CI verification PASSED for ${unverifiedReviewTask.id}. Ready for ChatGPT to call "task_review".`,
        task_id: unverifiedReviewTask.id,
        finding_id: unverifiedReviewTask.related_finding || undefined,
        test_output: testResult.stdout,
      };
    } else {
      ciNote = `\n\n[Automated CI Check at ${timestamp}]: FAILED (exit code ${testResult.exitCode} in ${testResult.durationMs}ms).\nError: ${testResult.stderr || testResult.stdout}`;

      await updateTask(
        unverifiedReviewTask.id,
        {
          result: (unverifiedReviewTask.result || '') + ciNote,
        },
        'system'
      );

      await logActivity({
        agent: 'system',
        action: `Automated CI Check Failed`,
        entity_type: 'task',
        entity_id: unverifiedReviewTask.id,
        details: `Tests FAILED with exit code ${testResult.exitCode}.`,
      });

      return {
        step: 'ci_failed',
        message: `Automated CI verification FAILED for ${unverifiedReviewTask.id}. Reviewer should inspect failures or request changes.`,
        task_id: unverifiedReviewTask.id,
        finding_id: unverifiedReviewTask.related_finding || undefined,
        test_output: testResult.stderr || testResult.stdout,
      };
    }
  }

  if (reviewTasks.length > 0) {
    return {
      step: 'awaiting_chatgpt_review',
      message: `${reviewTasks.length} task(s) currently awaiting explicit ChatGPT review decision.`,
      task_id: reviewTasks[0].id,
    };
  }

  const workingTasks = tasks.filter((t) => t.status === 'working');
  if (workingTasks.length > 0) {
    return {
      step: 'gemini_working',
      message: `Gemini is actively executing ${workingTasks[0].id}: "${workingTasks[0].title}".`,
      task_id: workingTasks[0].id,
    };
  }

  return { step: 'idle', message: 'No tasks currently pending review or execution.' };
}

