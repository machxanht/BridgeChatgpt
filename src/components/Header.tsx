import React from 'react';
import {
  Activity,
  CheckCircle2,
  FolderGit2,
  ListTodo,
  MessageSquare,
  Radio,
  Settings,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { ProjectConfig } from '../types.js';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  project: ProjectConfig | null;
  autoReview: boolean;
  onToggleAutoReview: () => void;
  isPolling: boolean;
  onRefresh: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  project,
  autoReview,
  onToggleAutoReview,
  isPolling,
  onRefresh,
}) => {
  const tabs = [
    { id: 'workspace', label: 'Workspace', icon: Activity },
    { id: 'tasks', label: 'Tasks', icon: ListTodo },
    { id: 'findings', label: 'Findings', icon: ShieldCheck },
    { id: 'messages', label: 'Agent Comms', icon: MessageSquare },
    { id: 'git', label: 'Git & Code', icon: FolderGit2 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <header className="glass-card sticky top-0 z-40 px-4 lg:px-6 py-3 border-b border-white/10 shadow-lg">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Brand & Connection Status */}
        <div className="flex items-center justify-between md:justify-start gap-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-cyan-500 flex items-center justify-center text-slate-950 shadow-md shadow-cyan-500/20 font-bold text-sm tracking-tight">
              B
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-semibold tracking-tight uppercase text-slate-100">
                  Bridge <span className="text-cyan-400">/ Workspace</span>
                </h1>
                <span className="text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-medium">
                  Shared AI
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono truncate max-w-[200px] sm:max-w-xs">
                {project ? project.project_name : 'Loading project...'}
              </p>
            </div>
          </div>

          {/* Connection status pill */}
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-medium backdrop-blur-md">
              <span className="status-dot bg-emerald-400 animate-pulse"></span>
              <span>MCP Active</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-white/10 text-cyan-300 shadow-sm border border-white/15 backdrop-blur-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Action Controls: Auto Review switch & Refresh */}
        <div className="flex items-center gap-2.5 justify-end">
          {/* Auto Review toggle */}
          <button
            id="toggle-auto-review-btn"
            onClick={onToggleAutoReview}
            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              autoReview
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200 shadow-sm shadow-cyan-950/50'
                : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-300 hover:bg-white/10'
            }`}
            title="When enabled, task completions automatically trigger ChatGPT review and follow-ups"
          >
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Auto Review</span>
            <div className={`w-8 h-4 rounded-full flex items-center px-0.5 transition-colors ${
              autoReview ? 'bg-cyan-500/60' : 'bg-white/20'
            }`}>
              <div className={`w-3 h-3 bg-white rounded-full transition-transform ${
                autoReview ? 'translate-x-4' : 'translate-x-0'
              }`}></div>
            </div>
          </button>

          {/* Quick Refresh */}
          <button
            id="refresh-workspace-btn"
            onClick={onRefresh}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-cyan-300 transition-colors border border-white/10"
            title="Refresh workspace state"
          >
            <Radio className={`w-3.5 h-3.5 ${isPolling ? 'animate-pulse text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
};
