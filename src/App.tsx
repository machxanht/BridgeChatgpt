/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  AgentOperationalStatus,
  Finding,
  FindingStatus,
  ProjectConfig,
  TargetAgentType,
  Task,
  TaskStatus,
  WorkspaceState,
} from './types.js';
import { Header } from './components/Header.js';
import { WorkspaceView } from './components/WorkspaceView.js';
import { TasksView } from './components/TasksView.js';
import { FindingsView } from './components/FindingsView.js';
import { MessagesView } from './components/MessagesView.js';
import { GitCodeView } from './components/GitCodeView.js';
import { SettingsView } from './components/SettingsView.js';
import { TaskModal } from './components/TaskModal.js';
import { FindingModal } from './components/FindingModal.js';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('workspace');
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [isAutoReviewing, setIsAutoReviewing] = useState<boolean>(false);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isFindingModalOpen, setIsFindingModalOpen] = useState(false);
  const [editingFinding, setEditingFinding] = useState<Finding | null>(null);

  const fetchWorkspace = useCallback(async () => {
    try {
      setIsPolling(true);
      const res = await fetch('/api/workspace');
      if (res.ok) setWorkspaceState(await res.json());
    } catch (err) {
      console.error('Failed to fetch workspace state:', err);
    } finally {
      setIsPolling(false);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkspace();
    const interval = setInterval(fetchWorkspace, 3000);
    return () => clearInterval(interval);
  }, [fetchWorkspace]);

  const handleUpdateGoal = async (newGoal: string) => {
    try {
      const res = await fetch('/api/project', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_goal: newGoal }),
      });
      if (res.ok) fetchWorkspace();
    } catch (err) {
      console.error('Error updating goal:', err);
    }
  };

  const handleUpdateProject = async (config: Partial<ProjectConfig>) => {
    try {
      const res = await fetch('/api/project', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) fetchWorkspace();
    } catch (err) {
      console.error('Error updating project:', err);
    }
  };

  const handleToggleAutoReview = async () => {
    if (!workspaceState?.project) return;
    const newAutoReview = !workspaceState.project.auto_review;
    try {
      await fetch('/api/project', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_review: newAutoReview }),
      });
      fetchWorkspace();
    } catch (err) {
      console.error('Error toggling auto review:', err);
    }
  };

  const handleSetAgentStatus = async (
    agent: 'chatgpt' | 'gemini' | 'human',
    status: AgentOperationalStatus
  ) => {
    try {
      await fetch(`/api/agents/${agent}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      fetchWorkspace();
    } catch (err) {
      console.error('Error updating agent status:', err);
    }
  };

  const handleSaveTask = async (taskData: any) => {
    try {
      if (editingTask) {
        await fetch(`/api/tasks/${editingTask.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(taskData),
        });
      } else {
        await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(taskData),
        });
      }
      fetchWorkspace();
    } catch (err) {
      console.error('Error saving task:', err);
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, status: TaskStatus) => {
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      fetchWorkspace();
    } catch (err) {
      console.error('Error updating task status:', err);
    }
  };

  const handleClaimNextTask = async (agent: any = 'gemini') => {
    try {
      const res = await fetch('/api/tasks/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent }),
      });
      const data = await res.json();
      fetchWorkspace();
      return data;
    } catch (err) {
      console.error('Error claiming next task:', err);
    }
  };

  const handleReviewTask = async (payload: any) => {
    try {
      const res = await fetch(`/api/tasks/${payload.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      fetchWorkspace();
      return data;
    } catch (err) {
      console.error('Error reviewing task:', err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      fetchWorkspace();
    } catch (err) {
      console.error('Error deleting task:', err);
    }
  };

  const handleSaveFinding = async (findingData: any) => {
    try {
      if (editingFinding) {
        await fetch(`/api/findings/${editingFinding.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(findingData),
        });
      } else {
        await fetch('/api/findings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(findingData),
        });
      }
      fetchWorkspace();
    } catch (err) {
      console.error('Error saving finding:', err);
    }
  };

  const handleUpdateFindingStatus = async (
    findingId: string,
    status: FindingStatus,
    resolution?: string
  ) => {
    try {
      await fetch(`/api/findings/${findingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, resolution }),
      });
      fetchWorkspace();
    } catch (err) {
      console.error('Error updating finding status:', err);
    }
  };

  const handleCreateTaskFromFinding = (finding: Finding) => {
    setEditingTask({
      id: '',
      title: `Fix: ${finding.title}`,
      description: `Resolve finding ${finding.id} reported in ${finding.file}:${finding.line}.\n\nDetails: ${finding.description}`,
      priority: finding.severity === 'critical' ? 'urgent' : finding.severity === 'high' ? 'high' : 'medium',
      status: 'assigned',
      assignee: 'gemini',
      created_by: 'chatgpt',
      related_files: [finding.file],
      related_finding: finding.id,
      created_at: '',
      updated_at: '',
    });
    setIsTaskModalOpen(true);
  };

  const handleSendMessage = async (msgData: any) => {
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msgData),
      });
      fetchWorkspace();
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  const handleSendCommand = async (command: string, targetAgent: TargetAgentType) => {
    try {
      await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, targetAgent }),
      });
      fetchWorkspace();
    } catch (err) {
      console.error('Error sending command:', err);
    }
  };

  const handleTriggerAutoReviewCycle = async () => {
    setIsAutoReviewing(true);
    try {
      await fetch('/api/auto-review/cycle', { method: 'POST' });
      await fetchWorkspace();
    } catch (err) {
      console.error('Error triggering auto review cycle:', err);
    } finally {
      setIsAutoReviewing(false);
    }
  };

  const handlePauseAll = async () => {
    try {
      await fetch('/api/orchestrator/pause-all', { method: 'POST' });
      fetchWorkspace();
    } catch (err) {
      console.error('Error pausing agents:', err);
    }
  };

  const handleResumeAll = async () => {
    try {
      await fetch('/api/orchestrator/resume', { method: 'POST' });
      fetchWorkspace();
    } catch (err) {
      console.error('Error resuming agents:', err);
    }
  };

  const handleStopAgent = async (agent: string) => {
    try {
      await fetch('/api/orchestrator/stop-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent }),
      });
      fetchWorkspace();
    } catch (err) {
      console.error('Error stopping agent:', err);
    }
  };

  const handleCancelTask = async (taskId?: string) => {
    try {
      await fetch('/api/orchestrator/cancel-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      fetchWorkspace();
    } catch (err) {
      console.error('Error cancelling task:', err);
    }
  };

  const handleSeedSampleScenario = async () => {
    try {
      await fetch('/api/seed-sample', { method: 'POST' });
      await fetchWorkspace();
    } catch (err) {
      console.error('Error seeding sample scenario:', err);
    }
  };

  if (isLoading || !workspaceState) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#020617] font-mono text-sm text-slate-300">
        <div className="mesh-gradient"></div>
        <div className="glass-card relative z-10 flex flex-col items-center gap-4 rounded-2xl border border-white/10 p-8 shadow-2xl">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/20">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent"></div>
          </div>
          <div className="flex flex-col items-center gap-1 text-center">
            <span className="font-semibold tracking-tight text-slate-100">BRIDGE</span>
            <span className="text-xs text-slate-400">Đang kết nối Bridge workspace…</span>
          </div>
        </div>
      </div>
    );
  }

  const workspaceMode = activeTab === 'workspace';

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-[#020617] font-sans text-slate-100 antialiased selection:bg-cyan-500 selection:text-slate-950">
      <div className="mesh-gradient"></div>

      {!workspaceMode && (
        <Header
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          project={workspaceState.project}
          autoReview={workspaceState.project.auto_review}
          onToggleAutoReview={handleToggleAutoReview}
          isPolling={isPolling}
          onRefresh={fetchWorkspace}
        />
      )}

      <main className={workspaceMode
        ? 'relative z-10 flex min-h-0 flex-1 w-full'
        : 'relative z-10 mx-auto w-full max-w-7xl flex-1 p-4 lg:p-6'}
      >
        {workspaceMode && (
          <WorkspaceView
            state={workspaceState}
            onUpdateGoal={handleUpdateGoal}
            onSetAgentStatus={handleSetAgentStatus}
            onOpenTaskModal={(task) => {
              setEditingTask(task || null);
              setIsTaskModalOpen(true);
            }}
            onOpenFindingModal={(finding) => {
              setEditingFinding(finding || null);
              setIsFindingModalOpen(true);
            }}
            onSelectTask={() => setActiveTab('tasks')}
            onSelectFinding={() => setActiveTab('findings')}
            onSendCommand={handleSendCommand}
            onTriggerAutoReviewCycle={handleTriggerAutoReviewCycle}
            isAutoReviewing={isAutoReviewing}
            onSeedSampleScenario={handleSeedSampleScenario}
            onPauseAll={handlePauseAll}
            onResumeAll={handleResumeAll}
            onStopAgent={handleStopAgent}
            onCancelTask={handleCancelTask}
            onOpenAdvancedTab={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === 'tasks' && (
          <TasksView
            tasks={workspaceState.tasks}
            findings={workspaceState.findings}
            onOpenTaskModal={(task) => {
              setEditingTask(task || null);
              setIsTaskModalOpen(true);
            }}
            onUpdateTaskStatus={handleUpdateTaskStatus}
            onDeleteTask={handleDeleteTask}
            onClaimNextTask={handleClaimNextTask}
            onReviewTask={handleReviewTask}
          />
        )}

        {activeTab === 'findings' && (
          <FindingsView
            findings={workspaceState.findings}
            onOpenFindingModal={(finding) => {
              setEditingFinding(finding || null);
              setIsFindingModalOpen(true);
            }}
            onUpdateFindingStatus={handleUpdateFindingStatus}
            onCreateTaskFromFinding={handleCreateTaskFromFinding}
          />
        )}

        {activeTab === 'messages' && (
          <MessagesView messages={workspaceState.messages} onSendMessage={handleSendMessage} />
        )}

        {activeTab === 'git' && <GitCodeView />}

        {activeTab === 'settings' && (
          <SettingsView
            state={workspaceState}
            onUpdateProject={handleUpdateProject}
            onSeedSampleScenario={handleSeedSampleScenario}
          />
        )}
      </main>

      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setEditingTask(null);
        }}
        onSave={handleSaveTask}
        initialTask={editingTask}
        findings={workspaceState.findings}
      />

      <FindingModal
        isOpen={isFindingModalOpen}
        onClose={() => {
          setIsFindingModalOpen(false);
          setEditingFinding(null);
        }}
        onSave={handleSaveFinding}
        initialFinding={editingFinding}
      />
    </div>
  );
}
