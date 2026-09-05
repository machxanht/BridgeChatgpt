import React, { useState } from 'react';
import {
  ArrowRight,
  Bot,
  Brain,
  CheckCircle2,
  Code2,
  Cpu,
  Flame,
  Play,
  RotateCw,
  Send,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react';
import { TargetAgentType } from '../types.js';

interface CommandBarProps {
  onSendCommand: (command: string, targetAgent: TargetAgentType) => Promise<void>;
  onTriggerAutoReviewCycle: () => Promise<void>;
  isAutoReviewing: boolean;
}

export const CommandBar: React.FC<CommandBarProps> = ({
  onSendCommand,
  onTriggerAutoReviewCycle,
  isAutoReviewing,
}) => {
  const [command, setCommand] = useState('');
  const [targetAgent, setTargetAgent] = useState<TargetAgentType>('all');
  const [isSending, setIsSending] = useState(false);

  const presets = [
    { label: 'Review auth & security', text: 'Review authentication and authorization logic for security vulnerabilities.' },
    { label: 'Review git diff', text: 'Inspect latest git diff and report any regression risks.' },
    { label: 'Run project tests', text: 'Run the project test suite and verify current build status.' },
    { label: 'Create task for Gemini', text: 'task: Implement unit tests for edge case error handling' },
  ];

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!command.trim()) return;

    setIsSending(true);
    try {
      await onSendCommand(command.trim(), targetAgent);
      setCommand('');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="glass-card rounded-xl p-4 shadow-xl border border-white/10">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-mono font-semibold text-slate-200">Workspace Command Center</span>
          <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
            Directly instruct ChatGPT, Gemini, or broadcast to shared channel
          </span>
        </div>

        {/* Step Auto-Review button */}
        <button
          id="step-auto-review-btn"
          onClick={onTriggerAutoReviewCycle}
          disabled={isAutoReviewing}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-medium bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/25 transition-all disabled:opacity-50"
          title="Manually trigger the next Auto-Review state machine step"
        >
          <Zap className={`w-3.5 h-3.5 text-amber-400 ${isAutoReviewing ? 'animate-spin' : ''}`} />
          <span>{isAutoReviewing ? 'Cycling...' : 'Step Auto-Review'}</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        {/* Target Agent Selector */}
        <div className="flex items-center">
          <select
            id="command-target-select"
            value={targetAgent}
            onChange={(e) => setTargetAgent(e.target.value as TargetAgentType)}
            className="w-full sm:w-auto px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-slate-200 text-xs font-mono focus:outline-none focus:border-cyan-500/50"
          >
            <option value="all" className="bg-slate-900 text-slate-100">📢 Broadcast (All)</option>
            <option value="chatgpt" className="bg-slate-900 text-slate-100">🧠 ChatGPT (Reviewer)</option>
            <option value="gemini" className="bg-slate-900 text-slate-100">⚡ Gemini (Coder)</option>
          </select>
        </div>

        {/* Input box */}
        <div className="flex-1 relative">
          <input
            id="command-input-field"
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Request a review, assign a goal, or type command (e.g. 'task: fix auth race condition')..."
            className="w-full px-4 py-2.5 rounded-lg bg-black/40 border border-white/10 text-slate-100 text-xs sm:text-sm placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/40 font-sans"
          />
          <div className="absolute right-2.5 top-2.5 text-[10px] text-slate-500 border border-white/10 px-1.5 py-0.5 rounded font-mono hidden sm:block">
            ⌘ Enter
          </div>
        </div>

        {/* Send Button */}
        <button
          id="send-command-btn"
          type="submit"
          disabled={isSending || !command.trim()}
          className="flex items-center justify-center gap-1.5 px-6 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs sm:text-sm font-semibold transition-all shadow-md shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Send Command</span>
        </button>
      </form>

      {/* Quick Prompt Presets */}
      <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto pb-1 scrollbar-none">
        <span className="text-[10px] font-mono text-slate-500 uppercase whitespace-nowrap">Presets:</span>
        {presets.map((preset, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setCommand(preset.text)}
            className="px-2.5 py-1 rounded-md text-[11px] font-mono bg-white/5 hover:bg-white/10 text-slate-300 hover:text-cyan-300 transition-colors whitespace-nowrap border border-white/10"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
};
