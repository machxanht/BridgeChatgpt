import React, { useEffect, useMemo, useState } from 'react';
import { FolderGit2, Pencil, Save, UserRound, X } from 'lucide-react';
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
        // The main app already handles connection errors. Keep this banner non-blocking.
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
  const appHost = typeof window !== 'undefined' ? window.location.host : '';

  const save = () => {
    try {
      window.localStorage.setItem(CHATGPT_EMAIL_KEY, draftChatgpt.trim());
      window.localStorage.setItem(GEMINI_EMAIL_KEY, draftGemini.trim());
    } catch {
      // If storage is disabled, values still remain visible for this session.
    }
    setChatgptEmail(draftChatgpt.trim());
    setGeminiEmail(draftGemini.trim());
    setEditing(false);
  };

  return (
    <div className="relative z-30 bg-slate-950/95 border-b border-cyan-500/20 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-wide font-semibold text-cyan-300">Đang dùng cái gì?</div>
            <div className="text-xs text-slate-400 mt-1">Thông tin cơ bản để nhìn một phát biết đúng tài khoản và đúng project.</div>
          </div>
          <button
            onClick={() => {
              if (editing) {
                setDraftChatgpt(chatgptEmail);
                setDraftGemini(geminiEmail);
              }
              setEditing(!editing);
            }}
            className="text-xs px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
          >
            {editing ? <><X className="w-3.5 h-3.5 inline mr-1" />Đóng</> : <><Pencil className="w-3.5 h-3.5 inline mr-1" />Sửa tài khoản</>}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2 mt-3">
          <div className="rounded-xl bg-black/30 border border-white/5 p-3">
            <div className="text-[10px] text-slate-500 uppercase flex items-center gap-1"><FolderGit2 className="w-3 h-3" /> Project</div>
            <div className="text-sm font-bold text-white mt-1">{project?.project_name || 'Đang tải...'}</div>
            <div className="text-[11px] text-cyan-300 mt-1 break-all">{repository}</div>
            <div className="text-[10px] text-slate-500 mt-1">Nhánh: {project?.default_branch || '—'}</div>
          </div>

          <div className="rounded-xl bg-black/30 border border-white/5 p-3">
            <div className="text-[10px] text-slate-500 uppercase">App đang mở</div>
            <div className="text-sm font-bold text-white mt-1">Bridge</div>
            <div className="text-[11px] text-cyan-300 mt-1 break-all">{appHost || '—'}</div>
            <div className="text-[10px] text-slate-500 mt-1">Workspace/public app hiện tại</div>
          </div>

          <div className="rounded-xl bg-indigo-950/30 border border-indigo-500/20 p-3">
            <div className="text-[10px] text-indigo-300 uppercase flex items-center gap-1"><UserRound className="w-3 h-3" /> ChatGPT</div>
            <div className="text-sm font-bold text-white mt-1 break-all">{effectiveChatgpt || 'Email chưa xác định'}</div>
            <div className="text-[11px] text-slate-400 mt-1">{chatgpt?.account_label || 'Tài khoản ChatGPT hiện tại'}</div>
          </div>

          <div className="rounded-xl bg-cyan-950/30 border border-cyan-500/20 p-3">
            <div className="text-[10px] text-cyan-300 uppercase flex items-center gap-1"><UserRound className="w-3 h-3" /> Google AI Studio</div>
            <div className="text-sm font-bold text-white mt-1 break-all">{effectiveGemini || 'Email chưa xác định'}</div>
            <div className="text-[11px] text-slate-400 mt-1">{gemini?.account_label || 'Tài khoản Google AI Studio hiện tại'}</div>
          </div>

          <div className="rounded-xl bg-black/30 border border-white/5 p-3">
            <div className="text-[10px] text-slate-500 uppercase">Lưu ý</div>
            <div className="text-xs text-slate-300 mt-1 leading-5">Bridge không được phép tự đọc email đăng nhập của ChatGPT/Google từ trình duyệt. Email mày nhập ở đây chỉ lưu trên thiết bị này, không ghi vào GitHub hay database.</div>
          </div>
        </div>

        {editing && (
          <div className="mt-3 rounded-xl border border-cyan-500/20 bg-cyan-950/15 p-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-xs text-slate-300">
                Email ChatGPT đang dùng
                <input
                  value={draftChatgpt}
                  onChange={event => setDraftChatgpt(event.target.value)}
                  placeholder="vd: ten@example.com"
                  inputMode="email"
                  className="mt-1 w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs text-slate-300">
                Email Google AI Studio đang dùng
                <input
                  value={draftGemini}
                  onChange={event => setDraftGemini(event.target.value)}
                  placeholder="vd: ten@gmail.com"
                  inputMode="email"
                  className="mt-1 w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
            <button onClick={save} className="mt-3 px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 text-xs font-bold"><Save className="w-3.5 h-3.5 inline mr-1" />Lưu trên máy này</button>
          </div>
        )}
      </div>
    </div>
  );
};
