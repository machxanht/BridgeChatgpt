import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Brain,
  CheckCircle,
  CheckCircle2,
  Clock,
  Code2,
  Cpu,
  Edit2,
  ExternalLink,
  Flame,
  GitBranch,
  ListTodo,
  Play,
  Plus,
  RotateCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  User,
  Zap,
} from 'lucide-react';
import {
  Activity,
  AgentOperationalStatus,
  Finding,
  ProjectConfig,
  Task,
  WorkspaceState,
} from '../types.js';
import { AgentCard } from './AgentCard.js';
import { CommandBar } from './CommandBar.js';

interface WorkspaceViewProps {
  state: WorkspaceState;
  onUpdateGoal: (newGoal: string) => Promise<void>;
  onSetAgentStatus: (agent: 'chatgpt' | 'gemini' | 'human', status: AgentOperationalStatus) => void;
  onOpenTaskModal: (task?: Task) => void;
  onOpenFindingModal: (finding?: Finding) => void;
  onSelectTask: (task: Task) => void;
  onSelectFinding: (finding: Finding) => void;
  onSendCommand: (command: string, targetAgent: any) => Promise<void>;
  onTriggerAutoReviewCycle: () => Promise<void>;
  isAutoReviewing: boolean;
  onSeedSampleScenario: () => Promise<void>;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  state,
  onUpdateGoal,
  onSetAgentStatus,
  onOpenTaskModal,
  onOpenFindingModal,
  onSelectTask,
  onSelectFinding,
  onSendCommand,
  onTriggerAutoReviewCycle,
  isAutoReviewing,
  onSeedSampleScenario,
}) => {
  const { project, agents, tasks, findings, recent_activity } = state;
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [goalText, setGoalText] = useState(project?.current_goal || '');

  const handleSaveGoal = async () => {
    if (!goalText.trim()) return;
    await onUpdateGoal(goalText.trim());
    setIsEditingGoal(false);
  };

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case 'urgent':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-rose-950 text-rose-300 border border-rose-800">URGENT</span>;
      case 'high':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-orange-950 text-orange-300 border border-orange-800">HIGH</span>;
      case 'medium':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-950 text-amber-300 border border-amber-800">MED</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400">LOW</span>;
    }
  };

  const getSeverityBadge = (s: string) => {
    switch (s) {
      case 'critical':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-700">CRITICAL</span>;
      case 'high':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-orange-950 text-orange-300 border border-orange-700">HIGH</span>;
      case 'medium':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-950 text-amber-300 border border-amber-800">MED</span>;
      case 'low':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-blue-300 border border-blue-800">LOW</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">INFO</span>;
    }
  };

  const getTaskStatusPill = (status: string) => {
    switch (status) {
      case 'working':
        return <span className="text-[11px] font-mono text-amber-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>Working</span>;
      case 'review':
        return <span className="text-[11px] font-mono text-sky-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse"></span>In Review</span>;
      case 'completed':
        return <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" />Completed</span>;
      case 'blocked':
        return <span className="text-[11px] font-mono text-rose-400">Blocked</span>;
      default:
        return <span className="text-[11px] font-mono text-slate-400">Assigned</span>;
    }
  };

  const activeTasks = tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
  const openFindings = findings.filter((f) => f.status !== 'verified' && f.status !== 'rejected');

  return (
    <div className="space-y-6">
      {/* Project & Current Goal Banner */}
      <div className="glass-card rounded-xl p-5 border border-white/10 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-mono text-cyan-300 uppercase tracking-wider font-semibold">Active Goal:</span>
              <span className="text-xs font-mono text-cyan-300 font-semibold px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
                {project?.project_name || 'Bridge'}
              </span>
              <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
                <GitBranch className="w-3 h-3 text-cyan-400" /> {project?.default_branch || 'main'}
              </span>
            </div>

            {isEditingGoal ? (
              <div className="flex items-center gap-2 mt-2">
                <input
                  id="edit-goal-input"
                  type="text"
                  value={goalText}
                  onChange={(e) => setGoalText(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-black/40 border border-white/15 text-slate-100 text-sm focus:outline-none focus:border-cyan-500 font-medium"
                />
                <button
                  id="save-goal-btn"
                  onClick={handleSaveGoal}
                  className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold shadow-md shadow-cyan-500/20"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>
                <button
                  id="cancel-goal-btn"
                  onClick={() => setIsEditingGoal(false)}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs border border-white/10"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <h1 className="text-slate-100 font-semibold text-sm sm:text-base tracking-tight">
                  {project?.current_goal || 'Coordinate architectural reviews and coding tasks'}
                </h1>
                <button
                  id="edit-goal-btn"
                  onClick={() => {
                    setGoalText(project?.current_goal || '');
                    setIsEditingGoal(true);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-cyan-400 hover:text-cyan-300 transition-opacity"
                  title="Edit Goal"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Quick Seed Action if workspace has no items */}
          {tasks.length === 0 && (
            <button
              id="seed-scenario-btn"
              onClick={onSeedSampleScenario}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25 text-xs font-semibold font-mono transition-all shadow-md shadow-cyan-950/40"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Seed Auth Review Scenario</span>
            </button>
          )}
        </div>
      </div>

      {/* Agents Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AgentCard
          agentKey="chatgpt"
          data={agents.chatgpt}
          onSetStatus={onSetAgentStatus}
        />
        <AgentCard
          agentKey="gemini"
          data={agents.gemini}
          onSetStatus={onSetAgentStatus}
        />
      </div>

      {/* Auto Review State Machine Visual Loop */}
      <div className="glass-card rounded-xl p-4 border border-white/10 shadow-lg backdrop-blur-md">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 text-xs font-mono font-medium text-slate-200">
            <Zap className={`w-3.5 h-3.5 ${project?.auto_review ? 'text-amber-400 fill-amber-400' : 'text-slate-500'}`} />
            <span>Auto Review Workflow Pipeline</span>
          </div>
          <span className="text-[11px] font-mono text-cyan-400">
            Status: {project?.auto_review ? 'Active (Automated Handshake)' : 'Manual Step Mode'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center text-xs font-mono">
          <div className={`p-2.5 rounded-lg border transition-all ${
            tasks.some(t => t.status === 'assigned')
              ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-200 shadow-md shadow-indigo-950/40'
              : 'bg-black/30 border-white/5 text-slate-400'
          }`}>
            <span className="block font-semibold">1. Task Created</span>
            <span className="text-[10px] text-slate-500">ChatGPT / User</span>
          </div>

          <div className={`p-2.5 rounded-lg border transition-all ${
            agents.gemini.status === 'working' || tasks.some(t => t.status === 'working')
              ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200 shadow-md shadow-cyan-950/40'
              : 'bg-black/30 border-white/5 text-slate-400'
          }`}>
            <span className="block font-semibold">2. Gemini Working</span>
            <span className="text-[10px] text-slate-500">Edit Code & Run Tests</span>
          </div>

          <div className={`p-2.5 rounded-lg border transition-all ${
            tasks.some(t => t.status === 'review')
              ? 'bg-amber-500/20 border-amber-500/50 text-amber-200 shadow-md shadow-amber-950/40'
              : 'bg-black/30 border-white/5 text-slate-400'
          }`}>
            <span className="block font-semibold">3. Work Completed</span>
            <span className="text-[10px] text-slate-500">Report Results</span>
          </div>

          <div className={`p-2.5 rounded-lg border transition-all ${
            agents.chatgpt.status === 'reviewing'
              ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-200 shadow-md shadow-indigo-950/40'
              : 'bg-black/30 border-white/5 text-slate-400'
          }`}>
            <span className="block font-semibold">4. ChatGPT Review</span>
            <span className="text-[10px] text-slate-500">Inspect Diff & Tests</span>
          </div>

          <div className={`p-2.5 rounded-lg border transition-all ${
            findings.some(f => f.status === 'verified') || tasks.some(t => t.status === 'completed')
              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200 shadow-md shadow-emerald-950/40'
              : 'bg-black/30 border-white/5 text-slate-400'
          }`}>
            <span className="block font-semibold">5. Verified / Done</span>
            <span className="text-[10px] text-slate-500">Pass → Done | Fail → Follow-up</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Tasks & Findings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current Tasks */}
        <div className="glass-card rounded-xl p-5 border border-white/10 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
              <div className="flex items-center gap-2">
                <ListTodo className="w-4 h-4 text-cyan-400" />
                <h3 className="font-semibold text-slate-100 text-sm">Active Tasks ({activeTasks.length})</h3>
              </div>
              <button
                id="create-task-quick-btn"
                onClick={() => onOpenTaskModal()}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-xs font-mono transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Task</span>
              </button>
            </div>

            {activeTasks.length === 0 ? (
              <div className="bg-black/30 border border-dashed border-white/10 rounded-lg p-6 text-center text-slate-400 text-xs">
                No active tasks. ChatGPT or Human can dispatch a new task.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                {activeTasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => onSelectTask(task)}
                    className="bg-black/30 border border-white/5 hover:border-cyan-500/30 rounded-lg p-3 cursor-pointer transition-all hover:bg-white/5 group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-cyan-300">{task.id}</span>
                        {getPriorityBadge(task.priority)}
                      </div>
                      <div>{getTaskStatusPill(task.status)}</div>
                    </div>
                    <p className="text-xs font-medium text-slate-200 group-hover:text-white line-clamp-1 mb-1">
                      {task.title}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <span>Assignee: <strong className="text-slate-300">{task.assignee}</strong></span>
                      {task.related_finding && (
                        <span className="text-rose-400 font-medium">Ref: {task.related_finding}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Findings */}
        <div className="glass-card rounded-xl p-5 border border-white/10 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <h3 className="font-semibold text-slate-100 text-sm">Findings & Defects ({openFindings.length})</h3>
              </div>
              <button
                id="create-finding-quick-btn"
                onClick={() => onOpenFindingModal()}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-mono transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Log Finding</span>
              </button>
            </div>

            {openFindings.length === 0 ? (
              <div className="bg-black/30 border border-dashed border-white/10 rounded-lg p-6 text-center text-slate-400 text-xs">
                No open findings. ChatGPT can review code and log findings via MCP.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                {openFindings.map((finding) => (
                  <div
                    key={finding.id}
                    onClick={() => onSelectFinding(finding)}
                    className="bg-black/30 border border-white/5 hover:border-rose-500/30 rounded-lg p-3 cursor-pointer transition-all hover:bg-white/5 group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-rose-300">{finding.id}</span>
                        {getSeverityBadge(finding.severity)}
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 uppercase">{finding.status}</span>
                    </div>
                    <p className="text-xs font-medium text-slate-200 group-hover:text-white line-clamp-1 mb-1">
                      {finding.title}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <span className="truncate max-w-[220px]">
                        {finding.file}:{finding.line}
                      </span>
                      <span>By: <strong className="text-slate-300">{finding.created_by}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Activity Feed */}
      <div className="glass-card rounded-xl p-5 border border-white/10 shadow-lg">
        <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            <h3 className="font-semibold text-slate-100 text-sm">Live Collaboration Activity Feed</h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">Real-time audit log</span>
        </div>

        <div className="bg-black/30 border border-white/5 rounded-lg p-3 max-h-[220px] overflow-y-auto divide-y divide-white/5 font-mono text-xs">
          {recent_activity.length === 0 ? (
            <div className="text-center py-4 text-slate-500">No activity yet.</div>
          ) : (
            recent_activity.map((act) => (
              <div key={act.id} className="py-2 first:pt-0 last:pb-0 flex items-start gap-2.5">
                <span className="text-[10px] text-slate-500 shrink-0">
                  {new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold shrink-0 ${
                  act.agent === 'gemini'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : act.agent === 'chatgpt'
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : 'bg-white/10 text-slate-300'
                }`}>
                  {act.agent.toUpperCase()}
                </span>
                <div className="flex-1 truncate">
                  <span className="text-slate-200 font-medium">{act.action}</span>
                  {act.details && (
                    <span className="text-slate-400 ml-1.5 font-normal truncate">({act.details})</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Command / Instruction Box */}
      <CommandBar
        onSendCommand={onSendCommand}
        onTriggerAutoReviewCycle={onTriggerAutoReviewCycle}
        isAutoReviewing={isAutoReviewing}
      />
    </div>
  );
};
