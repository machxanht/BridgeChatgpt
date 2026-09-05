import React, { useState } from 'react';
import {
  ArrowRight,
  Bot,
  Brain,
  CheckCircle2,
  Code2,
  Cpu,
  Filter,
  HelpCircle,
  MessageSquare,
  Radio,
  Send,
  ShieldAlert,
  Sparkles,
  User,
  Zap,
} from 'lucide-react';
import { AgentType, Message, MessageType, TargetAgentType } from '../types.js';

interface MessagesViewProps {
  messages: Message[];
  onSendMessage: (msg: { from: AgentType; to: TargetAgentType; type: MessageType; content: string; task_id?: string; finding_id?: string }) => Promise<void>;
}

export const MessagesView: React.FC<MessagesViewProps> = ({ messages, onSendMessage }) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [filterAgent, setFilterAgent] = useState<string>('all');
  const [fromAgent, setFromAgent] = useState<AgentType>('chatgpt');
  const [toAgent, setToAgent] = useState<TargetAgentType>('gemini');
  const [msgType, setMsgType] = useState<MessageType>('review');
  const [content, setContent] = useState('');
  const [taskId, setTaskId] = useState('');
  const [findingId, setFindingId] = useState('');
  const [isSending, setIsSending] = useState(false);

  const filteredMessages = messages.filter((m) => {
    if (filterType !== 'all' && m.type !== filterType) return false;
    if (filterAgent !== 'all' && m.from !== filterAgent && m.to !== filterAgent) return false;
    return true;
  });

  const getTypeBadge = (type: MessageType) => {
    switch (type) {
      case 'review':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-sky-950 text-sky-300 border border-sky-800">REVIEW</span>;
      case 'result':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-950 text-emerald-300 border border-emerald-800">RESULT</span>;
      case 'task':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-indigo-950 text-indigo-300 border border-indigo-800">TASK</span>;
      case 'finding':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-rose-950 text-rose-300 border border-rose-800">FINDING</span>;
      case 'question':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-950 text-amber-300 border border-amber-800">QUESTION</span>;
      case 'handoff':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-purple-950 text-purple-300 border border-purple-800">HANDOFF</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">STATUS</span>;
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsSending(true);
    try {
      await onSendMessage({
        from: fromAgent,
        to: toAgent,
        type: msgType,
        content: content.trim(),
        task_id: taskId.trim() || undefined,
        finding_id: findingId.trim() || undefined,
      });
      setContent('');
      setTaskId('');
      setFindingId('');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="glass-card rounded-xl p-5 border border-white/10 shadow-xl backdrop-blur-md">
        <h2 className="font-semibold text-slate-100 text-base">Structured Agent Communication Protocol</h2>
        <p className="text-xs text-slate-400 font-mono">
          Direct semantic message bus between ChatGPT and Gemini. Eliminates manual copy/pasting.
        </p>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2.5 glass-card rounded-xl p-3 border border-white/10">
        <select
          id="filter-message-type"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-slate-300 text-xs font-mono focus:outline-none focus:border-cyan-500"
        >
          <option value="all" className="bg-slate-900 text-slate-100">All Message Types</option>
          <option value="task" className="bg-slate-900 text-slate-100">Task Handoffs</option>
          <option value="finding" className="bg-slate-900 text-slate-100">Finding Reports</option>
          <option value="review" className="bg-slate-900 text-slate-100">Review Requests & Feedback</option>
          <option value="result" className="bg-slate-900 text-slate-100">Execution Results</option>
          <option value="question" className="bg-slate-900 text-slate-100">Questions & Clarifications</option>
          <option value="status" className="bg-slate-900 text-slate-100">Status Updates</option>
        </select>

        <select
          id="filter-message-agent"
          value={filterAgent}
          onChange={(e) => setFilterAgent(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-slate-300 text-xs font-mono focus:outline-none focus:border-cyan-500"
        >
          <option value="all" className="bg-slate-900 text-slate-100">All Agents</option>
          <option value="chatgpt" className="bg-slate-900 text-slate-100">ChatGPT</option>
          <option value="gemini" className="bg-slate-900 text-slate-100">Gemini</option>
          <option value="human" className="bg-slate-900 text-slate-100">Human</option>
        </select>
      </div>

      {/* Message Feed & Composer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Message Feed */}
        <div className="lg:col-span-7 space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
          {filteredMessages.length === 0 ? (
            <div className="glass-card rounded-xl p-10 text-center text-slate-400 text-xs border border-white/10">
              No messages found. Dispatch a message or trigger an action to start conversation.
            </div>
          ) : (
            filteredMessages.map((msg) => (
              <div
                key={msg.id}
                className="glass-card rounded-xl p-4 space-y-2 shadow-lg border border-white/10 backdrop-blur-md"
              >
                <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-cyan-300">{msg.id}</span>
                    {getTypeBadge(msg.type)}
                    <span className="text-xs font-mono text-slate-300">
                      <strong className="text-indigo-300">{msg.from.toUpperCase()}</strong> → <strong className="text-cyan-300">{msg.to.toUpperCase()}</strong>
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>

                <p className="text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-wrap">
                  {msg.content}
                </p>

                {(msg.task_id || msg.finding_id) && (
                  <div className="flex items-center gap-2 pt-1 font-mono text-[10px]">
                    {msg.task_id && (
                      <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                        Task: {msg.task_id}
                      </span>
                    )}
                    {msg.finding_id && (
                      <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20">
                        Finding: {msg.finding_id}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Message Composer */}
        <div className="lg:col-span-5">
          <div className="glass-card rounded-xl p-5 shadow-xl space-y-4 border border-white/10 backdrop-blur-md">
            <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-cyan-400" />
              <span>Compose Structured Agent Message</span>
            </h3>

            <form onSubmit={handleSend} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">From</label>
                  <select
                    id="composer-from-select"
                    value={fromAgent}
                    onChange={(e) => setFromAgent(e.target.value as AgentType)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-slate-200 text-xs font-mono"
                  >
                    <option value="chatgpt" className="bg-slate-900 text-slate-100">ChatGPT (Reviewer)</option>
                    <option value="gemini" className="bg-slate-900 text-slate-100">Gemini (Coder)</option>
                    <option value="human" className="bg-slate-900 text-slate-100">Human Operator</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">To</label>
                  <select
                    id="composer-to-select"
                    value={toAgent}
                    onChange={(e) => setToAgent(e.target.value as TargetAgentType)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-slate-200 text-xs font-mono"
                  >
                    <option value="gemini" className="bg-slate-900 text-slate-100">Gemini (Coder)</option>
                    <option value="chatgpt" className="bg-slate-900 text-slate-100">ChatGPT (Reviewer)</option>
                    <option value="all" className="bg-slate-900 text-slate-100">All (Broadcast)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1">Message Type</label>
                <select
                  id="composer-type-select"
                  value={msgType}
                  onChange={(e) => setMsgType(e.target.value as MessageType)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-slate-200 text-xs font-mono"
                >
                  <option value="review" className="bg-slate-900 text-slate-100">Review Request / Feedback</option>
                  <option value="result" className="bg-slate-900 text-slate-100">Execution Result Report</option>
                  <option value="task" className="bg-slate-900 text-slate-100">Task Assignment Handoff</option>
                  <option value="finding" className="bg-slate-900 text-slate-100">Finding Alert</option>
                  <option value="question" className="bg-slate-900 text-slate-100">Question / Clarification</option>
                  <option value="status" className="bg-slate-900 text-slate-100">Status Update</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">Task ID (Optional)</label>
                  <input
                    id="composer-task-id-input"
                    type="text"
                    value={taskId}
                    onChange={(e) => setTaskId(e.target.value)}
                    placeholder="TASK-1"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-slate-200 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">Finding ID (Optional)</label>
                  <input
                    id="composer-finding-id-input"
                    type="text"
                    value={findingId}
                    onChange={(e) => setFindingId(e.target.value)}
                    placeholder="BUG-1"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-slate-200 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1">Message Content</label>
                <textarea
                  id="composer-content-input"
                  rows={4}
                  required
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Structured communication, handoff criteria, test instructions..."
                  className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-slate-100 text-xs focus:outline-none focus:border-cyan-500 font-sans leading-relaxed"
                />
              </div>

              <button
                id="send-message-btn"
                type="submit"
                disabled={isSending || !content.trim()}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold transition-all shadow-md shadow-cyan-500/20 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Message</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
