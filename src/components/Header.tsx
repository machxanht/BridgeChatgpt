import React from 'react';
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  Cpu,
  FolderGit2,
  Gauge,
  Layers,
  ListTodo,
  MessageSquare,
  Radio,
  RotateCw,
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
  const isAdvancedActive = ['tasks', 'findings', 'messages', 'git', 'settings', 'activity'].includes(activeTab);

  const advancedSubTabs = [
    { id: 'tasks', label: 'Nhiệm vụ (Tasks)', icon: ListTodo },
    { id: 'findings', label: 'Phát hiện lỗi (Findings)', icon: ShieldCheck },
    { id: 'messages', label: 'Tin nhắn Agent', icon: MessageSquare },
    { id: 'git', label: 'Git & Mã nguồn', icon: FolderGit2 },
    { id: 'settings', label: 'Cài đặt MCP', icon: Settings },
  ];

  return (
    <header className="glass-card sticky top-0 z-40 px-4 lg:px-6 py-3 border-b border-white/10 shadow-lg backdrop-blur-xl">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Brand & Repository / AI Team Indicator */}
        <div className="flex items-center justify-between md:justify-start gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-cyan-500 flex items-center justify-center text-slate-950 shadow-lg shadow-cyan-500/25 font-black text-base tracking-tight">
              B
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                  BRIDGE <span className="text-cyan-400 font-mono text-sm font-normal">/ AI Mission Control</span>
                </h1>
                <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold">
                  CHỈ HUY AI
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono truncate max-w-[220px] sm:max-w-xs">
                {project ? project.project_name : 'machxanht/BridgeChatgpt'}
              </p>
            </div>
          </div>

          {/* Connection status pill */}
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-medium backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>MCP Trực tuyến</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs: Mission Control vs Nâng Cao (Advanced) */}
        <nav className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {/* 1. Main Screen Button */}
          <button
            id="tab-mission-control"
            onClick={() => setActiveTab('workspace')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap shadow-sm ${
              activeTab === 'workspace'
                ? 'bg-cyan-500 text-slate-950 shadow-cyan-500/20 ring-1 ring-cyan-400'
                : 'text-slate-300 hover:text-white hover:bg-white/10 border border-white/10'
            }`}
          >
            <Gauge className={`w-4 h-4 ${activeTab === 'workspace' ? 'text-slate-950' : 'text-cyan-400'}`} />
            <span>Trung Tâm Điều Khiển</span>
          </button>

          {/* 2. Advanced Navigation Pill with Dropdown/Tabs */}
          <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-xl p-1">
            <span className="text-[11px] font-mono font-semibold text-slate-400 px-2 uppercase">
              Nâng cao:
            </span>
            {advancedSubTabs.map((sub) => {
              const Icon = sub.icon;
              const isSubActive = activeTab === sub.id;
              return (
                <button
                  key={sub.id}
                  id={`tab-${sub.id}`}
                  onClick={() => setActiveTab(sub.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    isSubActive
                      ? 'bg-white/15 text-cyan-300 border border-white/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                  title={sub.label}
                >
                  <Icon className={`w-3.5 h-3.5 ${isSubActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                  <span className="hidden sm:inline">{sub.label.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Action Controls: Auto Review switch & Refresh */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            id="auto-review-toggle-btn"
            onClick={onToggleAutoReview}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-all border ${
              autoReview
                ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'
            }`}
            title="Tự động giao ChatGPT đánh giá khi Gemini hoàn tất tác vụ"
          >
            <Sparkles className={`w-3.5 h-3.5 ${autoReview ? 'text-cyan-400' : 'text-slate-500'}`} />
            <span>Auto-Review: {autoReview ? 'BẬT' : 'TẮT'}</span>
          </button>

          <button
            id="manual-refresh-btn"
            onClick={onRefresh}
            className="p-2 rounded-xl text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
            title="Làm mới trạng thái"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isPolling ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
};
