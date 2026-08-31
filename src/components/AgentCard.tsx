import React from 'react';
import {
  Bot,
  Brain,
  CheckCircle2,
  Code2,
  Cpu,
  Eye,
  FileCode,
  Flame,
  Play,
  User,
  Wrench,
} from 'lucide-react';
import { AgentOperationalStatus, AgentStatus, AgentType } from '../types.js';

interface AgentCardProps {
  agentKey: 'chatgpt' | 'gemini' | 'human';
  data: AgentStatus;
  onSetStatus: (agent: 'chatgpt' | 'gemini' | 'human', status: AgentOperationalStatus) => void;
}

export const AgentCard: React.FC<AgentCardProps> = ({ agentKey, data, onSetStatus }) => {
  const isChatGPT = agentKey === 'chatgpt';
  const isGemini = agentKey === 'gemini';
  const isHuman = agentKey === 'human';

  const getStatusBadge = (status: AgentOperationalStatus) => {
    switch (status) {
      case 'working':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-amber-950/80 border border-amber-600/40 text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping"></span>
            Working
          </span>
        );
      case 'reviewing':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-sky-950/80 border border-sky-600/40 text-sky-300">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse"></span>
            Reviewing
          </span>
        );
      case 'blocked':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-rose-950/80 border border-rose-600/40 text-rose-300">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400"></span>
            Blocked
          </span>
        );
      case 'offline':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-slate-800 text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-500"></span>
            Offline
          </span>
        );
      case 'idle':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-emerald-950/60 border border-emerald-700/30 text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
            Idle / Standby
          </span>
        );
    }
  };

  return (
    <div
      id={`agent-card-${agentKey}`}
      className={`rounded-xl p-4 flex flex-col justify-between transition-all shadow-lg backdrop-blur-md ${
        isGemini
          ? 'glass-card border-cyan-500/30 bg-cyan-500/5 hover:border-cyan-400/50'
          : isChatGPT
          ? 'glass-card border-indigo-500/20 bg-indigo-500/5 hover:border-indigo-400/40'
          : 'glass-card hover:border-white/20'
      }`}
    >
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div
              className={`h-10 w-10 rounded-xl flex items-center justify-center text-white shadow-inner ${
                isChatGPT
                  ? 'bg-indigo-600/30 border border-indigo-500/40 text-indigo-300'
                  : isGemini
                  ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300'
                  : 'bg-white/10 border border-white/15 text-slate-200'
              }`}
            >
              {isChatGPT && <Brain className="w-5 h-5" />}
              {isGemini && <Cpu className="w-5 h-5" />}
              {isHuman && <User className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-100 text-sm">
                  {isChatGPT && 'ChatGPT Web'}
                  {isGemini && 'Gemini 3.7 Flash'}
                  {isHuman && 'Human Operator'}
                </h3>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                  isChatGPT
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : isGemini
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'bg-white/10 text-slate-300 border border-white/10'
                }`}>
                  {isChatGPT && 'REVIEWER'}
                  {isGemini && 'CODER'}
                  {isHuman && 'ADMIN'}
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-400">
                {isChatGPT && 'Reviewer • Architect • Task Manager'}
                {isGemini && 'Coder • Executor • Tester'}
                {isHuman && 'Supervisor • Workspace Admin'}
              </p>
            </div>
          </div>

          <div>{getStatusBadge(data.status)}</div>
        </div>

        {/* Current task or note */}
        <div className="bg-black/30 border border-white/5 rounded-lg p-3 mb-3 backdrop-blur-sm">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Current Assignment:</span>
            {data.current_task_id && (
              <span className="text-cyan-300 font-semibold px-1.5 py-0.2 rounded bg-cyan-500/15 border border-cyan-500/30 text-[10px]">
                {data.current_task_id}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
            {data.message || (data.current_task_id ? `Executing task ${data.current_task_id}` : 'Standing by for instructions or task assignments.')}
          </p>
          
          {/* Subtle Activity bar */}
          <div className="mt-2.5 h-1 w-full bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isChatGPT
                  ? 'bg-indigo-500 ' + (data.status === 'reviewing' || data.status === 'working' ? 'w-[75%] animate-pulse' : 'w-[20%]')
                  : isGemini
                  ? 'bg-cyan-400 ' + (data.status === 'working' ? 'w-[85%] animate-pulse' : 'w-[20%]')
                  : 'bg-emerald-400 w-[15%]'
              }`}
            ></div>
          </div>
        </div>
      </div>

      {/* Role capabilities & status triggers */}
      <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
          {isChatGPT && (
            <>
              <Eye className="w-3.5 h-3.5 text-indigo-400" />
              <span>Reviews diffs & tests</span>
            </>
          )}
          {isGemini && (
            <>
              <Code2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Edits files & executes code</span>
            </>
          )}
          {isHuman && (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Dispatches goals & reviews</span>
            </>
          )}
        </div>

        {/* Quick state switcher for demonstration / testing */}
        <div className="flex items-center gap-1">
          <button
            id={`set-status-idle-${agentKey}`}
            onClick={() => onSetStatus(agentKey, 'idle')}
            className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
              data.status === 'idle'
                ? 'bg-white/15 text-slate-200 font-bold border border-white/20'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }`}
            title="Set Idle"
          >
            Idle
          </button>
          <button
            id={`set-status-active-${agentKey}`}
            onClick={() => onSetStatus(agentKey, isChatGPT ? 'reviewing' : 'working')}
            className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
              data.status === 'working' || data.status === 'reviewing'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 font-bold shadow-sm'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }`}
            title={isChatGPT ? 'Set Reviewing' : 'Set Working'}
          >
            {isChatGPT ? 'Review' : 'Work'}
          </button>
        </div>
      </div>
    </div>
  );
};
