import React from 'react';
import {
  Brain,
  ChevronDown,
  FolderGit2,
  ListTodo,
  MessageSquare,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Waypoints,
} from 'lucide-react';
import type { ProjectConfig } from '../types.js';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  project: ProjectConfig | null;
  autoReview: boolean;
  onToggleAutoReview: () => void;
  isPolling: boolean;
  onRefresh: () => void;
}

const navItems = [
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'findings', label: 'Findings', icon: ShieldCheck },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'git', label: 'Git', icon: FolderGit2 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  project,
  autoReview,
  onToggleAutoReview,
  isPolling,
  onRefresh,
}) => {
  return (
    <header className="sticky top-0 z-40 grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-surface/85 px-3 backdrop-blur-xl sm:grid-cols-[1fr_auto_1fr] sm:px-4">
      <button onClick={() => setActiveTab('workspace')} className="flex min-w-0 items-center gap-2 text-left">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-gpt/15 text-gpt">
          <Waypoints className="size-4" />
        </span>
        <span className="truncate text-[13px] font-semibold tracking-[0.18em]">BRIDGE</span>
      </button>

      <div className="hidden min-w-0 justify-center sm:flex">
        <span className="max-w-[38vw] truncate text-sm font-medium text-muted-foreground">
          {activeTab === 'workspace' ? (project?.project_name || 'Workspace') : navItems.find(item => item.id === activeTab)?.label || activeTab}
        </span>
      </div>

      <div className="flex items-center justify-end gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2/60 px-2.5 py-1 text-[11px] font-medium">
          <span className="size-1.5 animate-pulse-dot rounded-full bg-gpt" />
          <span className="hidden sm:inline">Connected</span>
        </span>

        <button
          onClick={onToggleAutoReview}
          title="Auto Review"
          className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors ${autoReview ? 'border-gpt/30 bg-gpt/10 text-gpt' : 'border-border bg-surface-2/60 text-muted-foreground'}`}
        >
          <Sparkles className="size-3" />
          <span className="hidden md:inline">Review {autoReview ? 'On' : 'Off'}</span>
        </button>

        <button
          onClick={onRefresh}
          title="Refresh"
          className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <RefreshCw className={`size-4 ${isPolling ? 'animate-spin text-studio' : ''}`} />
        </button>

        <details className="group relative">
          <summary className="grid size-9 cursor-pointer list-none place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground">
            {activeTab === 'workspace' ? <Settings className="size-4" /> : <ChevronDown className="size-4" />}
          </summary>
          <div className="absolute right-0 top-11 z-50 w-48 animate-rise rounded-xl border border-border bg-surface p-1.5 shadow-float">
            <button onClick={() => setActiveTab('workspace')} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-muted-foreground hover:bg-surface-2 hover:text-foreground">
              <Brain className="size-3.5 text-gpt" /> Workspace
            </button>
            {navItems.map(item => (
              <button key={item.id} onClick={() => setActiveTab(item.id)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] hover:bg-surface-2 ${activeTab === item.id ? 'text-gpt' : 'text-muted-foreground hover:text-foreground'}`}>
                <item.icon className="size-3.5" /> {item.label}
              </button>
            ))}
          </div>
        </details>
      </div>
    </header>
  );
};
