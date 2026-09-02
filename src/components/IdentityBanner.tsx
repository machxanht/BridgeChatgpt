import React, { useEffect, useMemo, useState } from 'react';
import { Pencil, Save, X } from 'lucide-react';
import type { WorkspaceState } from '../types.js';

const CHATGPT_EMAIL_KEY = 'bridge.display.chatgptEmail';
const GEMINI_EMAIL_KEY = 'bridge.display.geminiEmail';

function safeRead(key: string) {
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function repoName(url?: string) {
  if (!url) return 'Chưa xác định';
  return url.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '') || url;
}

function looksLikeEmail(value?: string | null) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

export const IdentityBanner: React.FC = () => {
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [chatgptEmail, setChatgptEmail] = useState('');
  const [geminiEmail, setGeminiEmail] = useState('');
  const [draftChatgpt, setDraftChatgpt] = useState('');
  const [draftGemini, setDraftGemini] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const c = safeRead(CHATGPT_EMAIL_KEY);
    const g = safeRead(GEMINI_EMAIL_KEY);
    setChatgptEmail(c);
    setGeminiEmail(g);
    setDraftChatgpt(c);
    setDraftGemini(g);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/workspace');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setWorkspace(data);
      } catch {
        // Keep identity helper non-blocking if the main app is reconnecting.
      }
    };
    load();
    const timer = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const agents = workspace?.mission_control?.agents || [];
  const chatgpt = agents.find(agent => agent.id === 'chatgpt');
  const gemini = agents.find(agent => agent.id === 'gemini');
  const effectiveChatgpt = chatgptEmail || (looksLikeEmail(chatgpt?.account_label) ? chatgpt?.account_label || '' : '');
  const effectiveGemini = geminiEmail || (looksLikeEmail(gemini?.account_label) ? gemini?.account_label || '' : '');
  const project = workspace?.project;
  const repository = useMemo(() => repoName(project?.repository_url), [project?.repository_url]);

  const save = () => {
    try {
      window.localStorage.setItem(CHATGPT_EMAIL_KEY, draftChatgpt.trim());
      window.localStorage.setItem(GEMINI_EMAIL_KEY, draftGemini.trim());
    } catch {
      // Values still remain visible for this browser session.
    }
    setChatgptEmail(draftChatgpt.trim());
    setGeminiEmail(draftGemini.trim());
    setEditing(false);
  };

  return (
    <div className="relative z-30 border-b border-white/5 bg-slate-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-2">
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-slate-400">
          <span><b className="text-slate-200">Project:</b> {project?.project_name || 'Đang tải...'}</span>
          <span className="text-slate-700">•</span>
          <span><b className="text-slate-200">Repo:</b> <span className="text-cyan-300">{repository}</span> / {project?.default_branch || '—'}</span>
          <span className="text-slate-700">•</span>
          <span><b className="text-slate-200">ChatGPT:</b> {effectiveChatgpt || 'chưa đặt email'}</span>
          <span className="text-slate-700">•</span>
          <span><b className="text-slate-200">Studio:</b> {effectiveGemini || 'chưa đặt email'}</span>
          <button
            onClick={() => {
              if (editing) {
                setDraftChatgpt(chatgptEmail);
                setDraftGemini(geminiEmail);
              }
              setEditing(!editing);
            }}
            className="ml-auto text-cyan-300 hover:text-white whitespace-nowrap"
            title="Sửa email hiển thị trên thiết bị này"
          >
            {editing ? <><X className="w-3 h-3 inline mr-1" />Đóng</> : <><Pencil className="w-3 h-3 inline mr-1" />Tài khoản</>}
          </button>
        </div>

        {editing && (
          <div className="mt-2 flex flex-col md:flex-row gap-2 items-stretch md:items-end rounded-xl border border-white/10 bg-black/25 p-2">
            <label className="text-[11px] text-slate-400 flex-1">
              Email ChatGPT
              <input value={draftChatgpt} onChange={event => setDraftChatgpt(event.target.value)} inputMode="email" placeholder="ten@example.com" className="mt-1 w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-white" />
            </label>
            <label className="text-[11px] text-slate-400 flex-1">
              Email Google AI Studio
              <input value={draftGemini} onChange={event => setDraftGemini(event.target.value)} inputMode="email" placeholder="ten@gmail.com" className="mt-1 w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-white" />
            </label>
            <button onClick={save} className="px-3 py-2 rounded-lg bg-cyan-500 text-slate-950 text-xs font-bold whitespace-nowrap"><Save className="w-3.5 h-3.5 inline mr-1" />Lưu trên máy</button>
          </div>
        )}
      </div>
    </div>
  );
};
