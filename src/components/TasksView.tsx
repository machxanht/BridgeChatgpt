import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Code2,
  Filter,
  Flame,
  ListTodo,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  User,
  Zap,
} from 'lucide-react';
import { AgentType, Finding, Task, TaskPriority, TaskStatus } from '../types.js';

interface TasksViewProps {
  tasks: Task[];
  findings: Finding[];
  onOpenTaskModal: (task?: Task) => void;
  onUpdateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
}

export const TasksView: React.FC<TasksViewProps> = ({
  tasks,
  findings,
  onOpenTaskModal,
  onUpdateTaskStatus,
  onDeleteTask,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [selectedTask, setSelectedTask] = useState<Task | null>(tasks[0] || null);

  const filteredTasks = tasks.filter((task) => {
    if (statusFilter !== 'all' && task.status !== statusFilter) return false;
    if (assigneeFilter !== 'all' && task.assignee !== assigneeFilter) return false;
    if (
      searchQuery &&
      !task.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !task.id.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !task.description.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const getPriorityBadge = (p: TaskPriority) => {
    switch (p) {
      case 'urgent':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-800">URGENT</span>;
      case 'high':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-orange-950 text-orange-300 border border-orange-800">HIGH</span>;
      case 'medium':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950 text-amber-300 border border-amber-800">MEDIUM</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400">LOW</span>;
    }
  };

  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'working':
        return <span className="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-amber-950/80 border border-amber-600/40 text-amber-300">Working</span>;
      case 'review':
        return <span className="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-sky-950/80 border border-sky-600/40 text-sky-300">Review</span>;
      case 'completed':
        return <span className="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-emerald-950/80 border border-emerald-600/40 text-emerald-300">Completed</span>;
      case 'blocked':
        return <span className="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-rose-950/80 border border-rose-600/40 text-rose-300">Blocked</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-slate-800 text-slate-300">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 glass-card rounded-xl p-5 border border-white/10 shadow-xl backdrop-blur-md">
        <div>
          <h2 className="font-semibold text-slate-100 text-base">Collaboration Tasks</h2>
          <p className="text-xs text-slate-400 font-mono">
            Direct task assignments for Gemini 3.7 Flash and review feedback for ChatGPT.
          </p>
        </div>

        <button
          id="new-task-btn"
          onClick={() => onOpenTaskModal()}
          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold transition-all shadow-md shadow-cyan-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>Create Task</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2.5 glass-card rounded-xl p-3 border border-white/10">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="search-tasks-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks by ID, title, or criteria..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
          />
        </div>

        <select
          id="filter-task-status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-slate-300 text-xs font-mono focus:outline-none focus:border-cyan-500"
        >
          <option value="all" className="bg-slate-900 text-slate-100">All Statuses</option>
          <option value="pending" className="bg-slate-900 text-slate-100">Pending</option>
          <option value="assigned" className="bg-slate-900 text-slate-100">Assigned</option>
          <option value="working" className="bg-slate-900 text-slate-100">Working</option>
          <option value="review" className="bg-slate-900 text-slate-100">Review</option>
          <option value="completed" className="bg-slate-900 text-slate-100">Completed</option>
          <option value="blocked" className="bg-slate-900 text-slate-100">Blocked</option>
        </select>

        <select
          id="filter-task-assignee"
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-slate-300 text-xs font-mono focus:outline-none focus:border-cyan-500"
        >
          <option value="all" className="bg-slate-900 text-slate-100">All Assignees</option>
          <option value="gemini" className="bg-slate-900 text-slate-100">Gemini (Coder)</option>
          <option value="chatgpt" className="bg-slate-900 text-slate-100">ChatGPT (Reviewer)</option>
          <option value="human" className="bg-slate-900 text-slate-100">Human</option>
        </select>
      </div>

      {/* Main Split: Task List & Detail Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Task List */}
        <div className="lg:col-span-5 space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
          {filteredTasks.length === 0 ? (
            <div className="glass-card rounded-xl p-8 text-center text-slate-400 text-xs border border-white/10">
              No tasks matching filters.
            </div>
          ) : (
            filteredTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => setSelectedTask(task)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer backdrop-blur-md ${
                  selectedTask?.id === task.id
                    ? 'bg-cyan-500/10 border-cyan-500/50 shadow-md shadow-cyan-950/30'
                    : 'glass-card hover:border-white/20'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-cyan-300">{task.id}</span>
                    {getPriorityBadge(task.priority)}
                  </div>
                  <div>{getStatusBadge(task.status)}</div>
                </div>

                <h4 className="text-xs font-semibold text-slate-200 line-clamp-1 mb-1">{task.title}</h4>
                <p className="text-[11px] text-slate-400 line-clamp-2 mb-2 leading-relaxed">
                  {task.description}
                </p>

                <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono border-t border-white/5 pt-2">
                  <span>Assignee: <strong className="text-slate-300">{task.assignee}</strong></span>
                  <span>By: <strong className="text-slate-300">{task.created_by}</strong></span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Task Detail Inspector */}
        <div className="lg:col-span-7">
          {selectedTask ? (
            <div className="glass-card rounded-xl p-5 shadow-xl space-y-4 border border-white/10 backdrop-blur-md">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-bold text-cyan-300">{selectedTask.id}</span>
                    {getPriorityBadge(selectedTask.priority)}
                    {getStatusBadge(selectedTask.status)}
                  </div>
                  <h3 className="font-semibold text-slate-100 text-base">{selectedTask.title}</h3>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    id="edit-task-btn"
                    onClick={() => onOpenTaskModal(selectedTask)}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-medium transition-colors border border-white/10"
                  >
                    Edit
                  </button>
                  <button
                    id="delete-task-btn"
                    onClick={() => onDeleteTask(selectedTask.id)}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-colors border border-white/10"
                    title="Delete task"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Status transition action buttons */}
              <div>
                <span className="block text-[11px] font-mono text-slate-400 mb-1.5 uppercase tracking-wider">
                  Quick Lifecycle Transition:
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(['assigned', 'working', 'review', 'completed', 'blocked'] as TaskStatus[]).map((st) => (
                    <button
                      key={st}
                      onClick={() => onUpdateTaskStatus(selectedTask.id, st)}
                      className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition-all ${
                        selectedTask.status === st
                          ? 'bg-cyan-500 text-slate-950 shadow-md font-bold'
                          : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/10'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <span className="block text-[11px] font-mono text-slate-400 mb-1 uppercase tracking-wider">
                  Task Instructions & Context:
                </span>
                <div className="bg-black/40 border border-white/10 rounded-lg p-3.5 text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-wrap">
                  {selectedTask.description}
                </div>
              </div>

              {/* Meta information */}
              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                  <span className="text-[10px] text-slate-400 block">Assignee</span>
                  <span className="font-semibold text-slate-200">{selectedTask.assignee.toUpperCase()}</span>
                </div>
                <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                  <span className="text-[10px] text-slate-400 block">Created By</span>
                  <span className="font-semibold text-slate-200">{selectedTask.created_by.toUpperCase()}</span>
                </div>
              </div>

              {/* Related Files & Linked Finding */}
              {(selectedTask.related_files.length > 0 || selectedTask.related_finding) && (
                <div className="space-y-2">
                  <span className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                    Context References:
                  </span>
                  <div className="bg-black/30 p-3 rounded-lg border border-white/5 text-xs font-mono space-y-1.5">
                    {selectedTask.related_finding && (
                      <div className="flex items-center gap-1.5 text-rose-400">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Linked Finding: <strong>{selectedTask.related_finding}</strong></span>
                      </div>
                    )}
                    {selectedTask.related_files.length > 0 && (
                      <div className="text-slate-300">
                        <span className="text-slate-500">Related Files: </span>
                        {selectedTask.related_files.join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Execution Result Log */}
              {selectedTask.result && (
                <div>
                  <span className="block text-[11px] font-mono text-emerald-400 mb-1 uppercase tracking-wider flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Gemini Execution Report:
                  </span>
                  <div className="bg-black/40 border border-emerald-500/30 rounded-lg p-3.5 text-xs text-emerald-300/90 font-mono leading-relaxed whitespace-pre-wrap">
                    {selectedTask.result}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="glass-card rounded-xl p-12 text-center text-slate-400 text-xs border border-white/10">
              Select a task to view details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
