import React, { useState } from 'react';
import {
  Check,
  Copy,
  Database,
  ExternalLink,
  GitBranch,
  KeyRound,
  Layers,
  Save,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react';
import { ProjectConfig, WorkspaceState } from '../types.js';

interface SettingsViewProps {
  state: WorkspaceState;
  onUpdateProject: (config: Partial<ProjectConfig>) => Promise<void>;
  onSeedSampleScenario: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  state,
  onUpdateProject,
  onSeedSampleScenario,
}) => {
  const { project, tasks, findings, messages, recent_activity } = state;
  const [projectName, setProjectName] = useState(project?.project_name || 'Bridge');
  const [projectRoot, setProjectRoot] = useState(project?.project_root || '.');
  const [repoUrl, setRepoUrl] = useState(project?.repo_url || 'https://github.com/machxanht/Bridge');
  const [defaultBranch, setDefaultBranch] = useState(project?.default_branch || 'main');
  const [testCommand, setTestCommand] = useState(project?.test_command || 'npm test');
  const [isSaving, setIsSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const mcpUrl = typeof window !== 'undefined' ? `${window.location.origin}/mcp` : 'http://localhost:3000/mcp';

  const geminiConfigJson = JSON.stringify(
    {
      mcpServers: {
        bridge: {
          url: mcpUrl,
          headers: {
            Authorization: 'Bearer bridge-mcp-secret-token',
            'x-agent-name': 'gemini',
          },
        },
      },
    },
    null,
    2
  );

  const chatgptInstructions = `You are the Reviewer, Architect, and Task Manager for the Bridge Shared AI Workspace.
You connect to Bridge using the Remote MCP Streamable HTTP endpoint (${mcpUrl}).

Capabilities & Protocols:
1. Call project_info, project_list_files, project_read_file, and project_search to inspect project code.
2. Call project_git_status and project_git_diff to review live changes.
3. When you detect a bug, vulnerability, or architectural issue, call finding_create.
4. When you want Gemini 3.7 Flash to implement a feature or fix, call task_create with assignee="gemini".
5. Never attempt to edit project files directly. Gemini is the coder/executor agent.
6. When Gemini reports completion, review the diff with project_git_diff, run tests with project_test, and verify the finding or dispatch a follow-up task.`;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onUpdateProject({
        project_name: projectName.trim(),
        project_root: projectRoot.trim(),
        repo_url: repoUrl.trim(),
        default_branch: defaultBranch.trim(),
        test_command: testCommand.trim(),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="glass-card rounded-xl p-5 border border-white/10 shadow-xl backdrop-blur-md">
        <h2 className="font-semibold text-slate-100 text-base">Workspace & Remote MCP Configuration</h2>
        <p className="text-xs text-slate-400 font-mono">
          Manage project context, authentication tokens, and agent connection parameters.
        </p>
      </div>

      {/* Project Configuration Form */}
      <div className="glass-card rounded-xl p-6 shadow-xl space-y-4 border border-white/10 backdrop-blur-md">
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          <GitBranch className="w-4 h-4 text-cyan-400" />
          <h3 className="font-semibold text-slate-100 text-sm">Active Project Parameters</h3>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1.5">Project Name</label>
              <input
                id="settings-project-name-input"
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-slate-100 text-xs font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1.5">Repository URL</label>
              <input
                id="settings-repo-url-input"
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-slate-100 text-xs font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1.5">Project Root (Sandboxed)</label>
              <input
                id="settings-project-root-input"
                type="text"
                value={projectRoot}
                onChange={(e) => setProjectRoot(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-slate-100 text-xs font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1.5">Default Branch</label>
              <input
                id="settings-default-branch-input"
                type="text"
                value={defaultBranch}
                onChange={(e) => setDefaultBranch(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-slate-100 text-xs font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-mono text-slate-300 mb-1.5">Test Execution Command</label>
              <input
                id="settings-test-command-input"
                type="text"
                value={testCommand}
                onChange={(e) => setTestCommand(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-slate-100 text-xs font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              id="save-settings-btn"
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold transition-all shadow-md shadow-cyan-500/20 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Saving...' : 'Save Configuration'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Remote MCP Connection Guide for Gemini & ChatGPT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gemini Config */}
        <div className="glass-card rounded-xl p-5 shadow-xl space-y-3 border border-white/10 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              <h3 className="font-semibold text-slate-100 text-sm">Gemini 3.7 Flash MCP Config</h3>
            </div>
            <button
              id="copy-gemini-config-btn"
              onClick={() => copyToClipboard(geminiConfigJson, 'gemini')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-mono transition-colors border border-white/10"
            >
              {copiedKey === 'gemini' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'gemini' ? 'Copied' : 'Copy JSON'}</span>
            </button>
          </div>

          <p className="text-xs text-slate-400 font-sans leading-relaxed">
            Add this configuration to Gemini's remote MCP tools to allow Gemini to receive tasks and report results.
          </p>

          <pre className="bg-black/40 border border-white/10 rounded-lg p-3 text-xs font-mono text-cyan-300 overflow-x-auto">
            {geminiConfigJson}
          </pre>
        </div>

        {/* ChatGPT Custom GPT Config */}
        <div className="glass-card rounded-xl p-5 shadow-xl space-y-3 border border-white/10 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <h3 className="font-semibold text-slate-100 text-sm">ChatGPT Web Custom GPT Setup</h3>
            </div>
            <button
              id="copy-chatgpt-instructions-btn"
              onClick={() => copyToClipboard(chatgptInstructions, 'chatgpt')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-mono transition-colors border border-white/10"
            >
              {copiedKey === 'chatgpt' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'chatgpt' ? 'Copied' : 'Copy Prompt'}</span>
            </button>
          </div>

          <p className="text-xs text-slate-400 font-sans leading-relaxed">
            In Custom GPT / Actions setup, point the endpoint to <code className="text-emerald-300 bg-emerald-950/40 px-1 py-0.5 rounded border border-emerald-500/20">{mcpUrl}</code> with Bearer token authentication.
          </p>

          <pre className="bg-black/40 border border-white/10 rounded-lg p-3 text-[11px] font-mono text-emerald-300/90 overflow-y-auto max-h-36 whitespace-pre-wrap leading-relaxed">
            {chatgptInstructions}
          </pre>
        </div>
      </div>

      {/* Database State & Diagnostics */}
      <div className="glass-card rounded-xl p-5 shadow-xl space-y-4 border border-white/10 backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-400" />
            <h3 className="font-semibold text-slate-100 text-sm">Persistent SQLite Workspace Storage</h3>
          </div>

          <button
            id="seed-scenario-settings-btn"
            onClick={onSeedSampleScenario}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white text-xs font-medium font-mono transition-colors border border-indigo-400/30"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
            <span>Seed Sample Review Scenario</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
          <div className="bg-black/30 p-3.5 rounded-lg border border-white/5">
            <span className="text-slate-400 block text-[10px]">Total Tasks</span>
            <span className="text-lg font-bold text-slate-100">{tasks.length}</span>
          </div>
          <div className="bg-black/30 p-3.5 rounded-lg border border-white/5">
            <span className="text-slate-400 block text-[10px]">Total Findings</span>
            <span className="text-lg font-bold text-slate-100">{findings.length}</span>
          </div>
          <div className="bg-black/30 p-3.5 rounded-lg border border-white/5">
            <span className="text-slate-400 block text-[10px]">Messages Exchanged</span>
            <span className="text-lg font-bold text-slate-100">{messages.length}</span>
          </div>
          <div className="bg-black/30 p-3.5 rounded-lg border border-white/5">
            <span className="text-slate-400 block text-[10px]">Logged Activities</span>
            <span className="text-lg font-bold text-slate-100">{recent_activity.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
