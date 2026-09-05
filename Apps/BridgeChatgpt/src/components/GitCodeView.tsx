import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  Code2,
  File,
  FileCode,
  Folder,
  FolderGit2,
  GitBranch,
  GitCommit,
  GitCompare,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Terminal,
  XCircle,
} from 'lucide-react';
import { GitStatusResult, TestExecutionResult } from '../types.js';

export const GitCodeView: React.FC = () => {
  const [subTab, setSubTab] = useState<'files' | 'git_status' | 'git_diff' | 'git_log' | 'tests'>('git_status');
  const [filesList, setFilesList] = useState<Array<{ name: string; path: string; is_directory: boolean }>>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [isLoadingFile, setIsLoadingFile] = useState(false);

  const [gitStatus, setGitStatus] = useState<GitStatusResult | null>(null);
  const [gitDiff, setGitDiff] = useState<string>('');
  const [gitLog, setGitLog] = useState<Array<{ hash: string; author: string; date: string; subject: string }>>([]);

  const [testCommand, setTestCommand] = useState('npm run lint');
  const [testResult, setTestResult] = useState<TestExecutionResult | null>(null);
  const [isRunningTest, setIsRunningTest] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/project/files?recursive=true');
      const data = await res.json();
      if (data.files) {
        setFilesList(data.files);
        if (!selectedFilePath && data.files.find((f: any) => !f.is_directory)) {
          const first = data.files.find((f: any) => !f.is_directory);
          loadFile(first.path);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadFile = async (path: string) => {
    setSelectedFilePath(path);
    setIsLoadingFile(true);
    try {
      const res = await fetch(`/api/project/file?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      setFileContent(data.numbered_content || data.content || '(Empty file)');
    } catch (err: any) {
      setFileContent(`Error reading file: ${err.message}`);
    } finally {
      setIsLoadingFile(false);
    }
  };

  const fetchGitData = async () => {
    setIsLoading(true);
    try {
      const [statusRes, diffRes, logRes] = await Promise.all([
        fetch('/api/project/git/status'),
        fetch('/api/project/git/diff'),
        fetch('/api/project/git/log?limit=20'),
      ]);
      setGitStatus(await statusRes.json());
      const diffData = await diffRes.json();
      setGitDiff(diffData.diff || 'No changes detected.');
      const logData = await logRes.json();
      setGitLog(logData.commits || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const runTests = async () => {
    setIsRunningTest(true);
    try {
      const res = await fetch('/api/project/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: testCommand }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({
        command: testCommand,
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: err.message,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsRunningTest(false);
    }
  };

  useEffect(() => {
    fetchFiles();
    fetchGitData();
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="glass-card rounded-xl p-5 border border-white/10 shadow-xl backdrop-blur-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-100 text-base">Project Code, Git & Test Inspector</h2>
          <p className="text-xs text-slate-400 font-mono">
            Sandboxed inspection tools accessible to both ChatGPT (Reviewer) and Gemini (Coder).
          </p>
        </div>

        <button
          id="refresh-git-data-btn"
          onClick={() => {
            fetchFiles();
            fetchGitData();
          }}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-mono transition-colors border border-white/10"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Sync State</span>
        </button>
      </div>

      {/* Sub-Navigation */}
      <div className="flex items-center gap-1.5 glass-card rounded-xl p-2 border border-white/10 overflow-x-auto scrollbar-none">
        {[
          { id: 'git_status', label: 'Git Status', icon: GitBranch },
          { id: 'git_diff', label: 'Git Diff', icon: GitCompare },
          { id: 'tests', label: 'Test Runner', icon: Terminal },
          { id: 'files', label: 'File Explorer', icon: Folder },
          { id: 'git_log', label: 'Commit History', icon: GitCommit },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = subTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`subtab-${tab.id}`}
              onClick={() => setSubTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Sub Tab: Git Status */}
      {subTab === 'git_status' && (
        <div className="glass-card rounded-xl p-5 space-y-4 border border-white/10 backdrop-blur-md shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-cyan-400" />
              <h3 className="font-semibold text-slate-100 text-sm">
                Working Tree Status (Branch: <span className="font-mono text-cyan-300">{gitStatus?.branch || 'main'}</span>)
              </h3>
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-medium ${
              gitStatus?.clean ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
            }`}>
              {gitStatus?.clean ? 'Working Tree Clean' : 'Uncommitted Changes'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
            <div className="bg-black/30 border border-white/5 rounded-lg p-3">
              <span className="text-slate-400 block mb-1 font-bold">Modified Files ({gitStatus?.modified.length || 0})</span>
              {gitStatus?.modified.length === 0 ? (
                <span className="text-slate-500">None</span>
              ) : (
                <ul className="space-y-1 text-amber-300">
                  {gitStatus?.modified.map((f, i) => (
                    <li key={i} className="truncate">• {f}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-black/30 border border-white/5 rounded-lg p-3">
              <span className="text-slate-400 block mb-1 font-bold">Staged Files ({gitStatus?.staged.length || 0})</span>
              {gitStatus?.staged.length === 0 ? (
                <span className="text-slate-500">None</span>
              ) : (
                <ul className="space-y-1 text-emerald-300">
                  {gitStatus?.staged.map((f, i) => (
                    <li key={i} className="truncate">• {f}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-black/30 border border-white/5 rounded-lg p-3">
              <span className="text-slate-400 block mb-1 font-bold">Untracked Files ({gitStatus?.untracked.length || 0})</span>
              {gitStatus?.untracked.length === 0 ? (
                <span className="text-slate-500">None</span>
              ) : (
                <ul className="space-y-1 text-slate-300">
                  {gitStatus?.untracked.map((f, i) => (
                    <li key={i} className="truncate">• {f}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div>
            <span className="block text-[11px] font-mono text-slate-400 mb-1">Raw git status porcelain:</span>
            <pre className="bg-black/40 border border-white/10 rounded-lg p-3 text-xs font-mono text-slate-300 overflow-x-auto max-h-48">
              {gitStatus?.raw || 'Working tree clean.'}
            </pre>
          </div>
        </div>
      )}

      {/* Sub Tab: Git Diff */}
      {subTab === 'git_diff' && (
        <div className="glass-card rounded-xl p-5 space-y-3 border border-white/10 backdrop-blur-md shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-cyan-400" />
              <h3 className="font-semibold text-slate-100 text-sm">Working Tree Git Diff</h3>
            </div>
            <span className="text-xs font-mono text-slate-400">
              {gitDiff.includes('diff --git') ? 'Changes detected' : 'No differences'}
            </span>
          </div>

          <div className="bg-black/40 border border-white/10 rounded-lg p-4 font-mono text-xs overflow-x-auto max-h-[500px]">
            {gitDiff.split('\n').map((line, idx) => {
              let color = 'text-slate-300';
              let bg = '';
              if (line.startsWith('+') && !line.startsWith('+++')) {
                color = 'text-emerald-300';
                bg = 'bg-emerald-950/40';
              } else if (line.startsWith('-') && !line.startsWith('---')) {
                color = 'text-rose-300';
                bg = 'bg-rose-950/40';
              } else if (line.startsWith('@')) {
                color = 'text-cyan-300 font-bold';
              } else if (line.startsWith('diff --git')) {
                color = 'text-indigo-300 font-bold';
              }

              return (
                <div key={idx} className={`${color} ${bg} px-1 leading-relaxed whitespace-pre`}>
                  {line || ' '}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sub Tab: Test Runner */}
      {subTab === 'tests' && (
        <div className="glass-card rounded-xl p-5 space-y-4 border border-white/10 backdrop-blur-md shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span>Automated Test Execution</span>
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Execute verification commands inside the project workspace sandbox.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="test-command-input"
                type="text"
                value={testCommand}
                onChange={(e) => setTestCommand(e.target.value)}
                placeholder="npm run lint"
                className="px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-slate-200 text-xs font-mono w-48 sm:w-64 focus:outline-none focus:border-cyan-500"
              />
              <button
                id="run-project-test-btn"
                onClick={runTests}
                disabled={isRunningTest}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold font-mono transition-all shadow-md shadow-cyan-500/20 disabled:opacity-50"
              >
                <Play className={`w-3.5 h-3.5 ${isRunningTest ? 'animate-spin' : ''}`} />
                <span>{isRunningTest ? 'Running...' : 'Run Tests'}</span>
              </button>
            </div>
          </div>

          {testResult && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3.5 rounded-lg bg-black/30 border border-white/10">
                <div className="flex items-center gap-2">
                  {testResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-400" />
                  )}
                  <div>
                    <span className="font-mono text-xs font-bold text-slate-200">
                      {testResult.success ? 'TESTS PASSED (Exit 0)' : `TESTS FAILED (Exit ${testResult.exitCode})`}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400 block">
                      Command: `{testResult.command}` • Duration: {testResult.durationMs}ms
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-slate-500">
                  {new Date(testResult.timestamp).toLocaleTimeString()}
                </span>
              </div>

              <div>
                <span className="block text-[11px] font-mono text-slate-400 mb-1">Standard Output & Errors:</span>
                <pre className="bg-black/40 border border-white/10 rounded-lg p-4 font-mono text-xs text-slate-300 max-h-80 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {testResult.stdout || testResult.stderr || '(No output produced)'}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub Tab: File Explorer */}
      {subTab === 'files' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4 glass-card border border-white/10 rounded-xl p-4 max-h-[550px] overflow-y-auto space-y-1 backdrop-blur-md">
            <h4 className="font-semibold text-slate-200 text-xs font-mono mb-2 uppercase tracking-wider">
              Project Files ({filesList.filter(f => !f.is_directory).length})
            </h4>
            {filesList.map((item, idx) => (
              <div
                key={idx}
                onClick={() => !item.is_directory && loadFile(item.path)}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-mono cursor-pointer transition-colors ${
                  selectedFilePath === item.path
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                    : item.is_directory
                    ? 'text-slate-400 hover:text-slate-200'
                    : 'text-slate-300 hover:bg-white/5'
                }`}
              >
                {item.is_directory ? (
                  <Folder className={`w-3.5 h-3.5 ${selectedFilePath === item.path ? 'text-slate-950' : 'text-cyan-400'} shrink-0`} />
                ) : (
                  <FileCode className={`w-3.5 h-3.5 ${selectedFilePath === item.path ? 'text-slate-950' : 'text-slate-400'} shrink-0`} />
                )}
                <span className="truncate">{item.path}</span>
              </div>
            ))}
          </div>

          <div className="lg:col-span-8 glass-card border border-white/10 rounded-xl p-4 flex flex-col max-h-[550px] backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
              <span className="font-mono text-xs text-cyan-300 truncate font-semibold">
                {selectedFilePath || 'Select a file'}
              </span>
              <span className="text-[10px] font-mono text-slate-400">Read-only sandbox inspector</span>
            </div>

            <div className="flex-1 bg-black/40 border border-white/10 rounded-lg p-3 font-mono text-xs text-slate-300 overflow-auto whitespace-pre leading-relaxed">
              {isLoadingFile ? 'Loading file contents...' : fileContent || 'No file selected.'}
            </div>
          </div>
        </div>
      )}

      {/* Sub Tab: Git Log */}
      {subTab === 'git_log' && (
        <div className="glass-card rounded-xl p-5 space-y-3 border border-white/10 backdrop-blur-md shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitCommit className="w-4 h-4 text-cyan-400" />
              <h3 className="font-semibold text-slate-100 text-sm">Recent Git Commits</h3>
            </div>
            <span className="text-xs font-mono text-slate-400">{gitLog.length} commits</span>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {gitLog.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs font-mono">No git commits found.</div>
            ) : (
              gitLog.map((c, i) => (
                <div key={i} className="bg-black/30 border border-white/5 rounded-lg p-3 font-mono text-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 truncate">
                    <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold shrink-0">
                      {c.hash}
                    </span>
                    <span className="text-slate-200 font-medium truncate">{c.subject}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 shrink-0 text-right">
                    <span>{c.author}</span> • <span className="text-slate-500">{c.date}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
