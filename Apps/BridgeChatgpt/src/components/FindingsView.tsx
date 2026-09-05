import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Code2,
  FileCode,
  Filter,
  Flame,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { Finding, FindingSeverity, FindingStatus, Task } from '../types.js';

interface FindingsViewProps {
  findings: Finding[];
  onOpenFindingModal: (finding?: Finding) => void;
  onUpdateFindingStatus: (findingId: string, status: FindingStatus, resolution?: string) => Promise<void>;
  onCreateTaskFromFinding: (finding: Finding) => void;
}

export const FindingsView: React.FC<FindingsViewProps> = ({
  findings,
  onOpenFindingModal,
  onUpdateFindingStatus,
  onCreateTaskFromFinding,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(findings[0] || null);

  const filteredFindings = findings.filter((f) => {
    if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
    if (statusFilter !== 'all' && f.status !== statusFilter) return false;
    if (
      searchQuery &&
      !f.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !f.id.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !f.file.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !f.description.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const getSeverityBadge = (s: FindingSeverity) => {
    switch (s) {
      case 'critical':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-700">CRITICAL</span>;
      case 'high':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-orange-950 text-orange-300 border border-orange-700">HIGH</span>;
      case 'medium':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950 text-amber-300 border border-amber-800">MED</span>;
      case 'low':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-blue-300 border border-blue-800">LOW</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">INFO</span>;
    }
  };

  const getStatusBadge = (status: FindingStatus) => {
    switch (status) {
      case 'verified':
        return <span className="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-emerald-950/80 border border-emerald-600/40 text-emerald-300 flex items-center gap-1"><ShieldCheck className="w-3 h-3" />Verified</span>;
      case 'fixed':
        return <span className="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-sky-950/80 border border-sky-600/40 text-sky-300">Fixed</span>;
      case 'assigned':
        return <span className="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-indigo-950/80 border border-indigo-600/40 text-indigo-300">Assigned</span>;
      case 'rejected':
        return <span className="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-slate-800 text-slate-400">Rejected</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-rose-950/80 border border-rose-600/40 text-rose-300">Open</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 glass-card rounded-xl p-5 border border-white/10 shadow-xl backdrop-blur-md">
        <div>
          <h2 className="font-semibold text-slate-100 text-base">Code Review Findings & Vulnerabilities</h2>
          <p className="text-xs text-slate-400 font-mono">
            Issues identified by ChatGPT through MCP inspection, targeted for Gemini fixes.
          </p>
        </div>

        <button
          id="new-finding-btn"
          onClick={() => onOpenFindingModal()}
          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-xs font-semibold transition-all shadow-md shadow-rose-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>Log Finding</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2.5 glass-card rounded-xl p-3 border border-white/10">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="search-findings-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search findings by ID, title, file path..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-slate-200 text-xs focus:outline-none focus:border-rose-500"
          />
        </div>

        <select
          id="filter-finding-severity"
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-slate-300 text-xs font-mono focus:outline-none focus:border-rose-500"
        >
          <option value="all" className="bg-slate-900 text-slate-100">All Severities</option>
          <option value="critical" className="bg-slate-900 text-slate-100">Critical</option>
          <option value="high" className="bg-slate-900 text-slate-100">High</option>
          <option value="medium" className="bg-slate-900 text-slate-100">Medium</option>
          <option value="low" className="bg-slate-900 text-slate-100">Low</option>
          <option value="info" className="bg-slate-900 text-slate-100">Info</option>
        </select>

        <select
          id="filter-finding-status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-slate-300 text-xs font-mono focus:outline-none focus:border-rose-500"
        >
          <option value="all" className="bg-slate-900 text-slate-100">All Statuses</option>
          <option value="open" className="bg-slate-900 text-slate-100">Open</option>
          <option value="assigned" className="bg-slate-900 text-slate-100">Assigned</option>
          <option value="fixed" className="bg-slate-900 text-slate-100">Fixed</option>
          <option value="verified" className="bg-slate-900 text-slate-100">Verified</option>
          <option value="rejected" className="bg-slate-900 text-slate-100">Rejected</option>
        </select>
      </div>

      {/* Main Split: Findings List & Detail Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* List */}
        <div className="lg:col-span-5 space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
          {filteredFindings.length === 0 ? (
            <div className="glass-card rounded-xl p-8 text-center text-slate-400 text-xs border border-white/10">
              No findings matching filters.
            </div>
          ) : (
            filteredFindings.map((finding) => (
              <div
                key={finding.id}
                onClick={() => setSelectedFinding(finding)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer backdrop-blur-md ${
                  selectedFinding?.id === finding.id
                    ? 'bg-rose-500/10 border-rose-500/50 shadow-md shadow-rose-950/30'
                    : 'glass-card hover:border-white/20'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-rose-300">{finding.id}</span>
                    {getSeverityBadge(finding.severity)}
                  </div>
                  <div>{getStatusBadge(finding.status)}</div>
                </div>

                <h4 className="text-xs font-semibold text-slate-200 line-clamp-1 mb-1">{finding.title}</h4>
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 mb-2 truncate">
                  <FileCode className="w-3 h-3 text-cyan-400 shrink-0" />
                  <span className="truncate">{finding.file}:{finding.line}</span>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono border-t border-white/5 pt-2">
                  <span>Logged by: <strong className="text-slate-300">{finding.created_by}</strong></span>
                  <span>Assigned: <strong className="text-slate-300">{finding.assigned_to || 'None'}</strong></span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Inspector */}
        <div className="lg:col-span-7">
          {selectedFinding ? (
            <div className="glass-card rounded-xl p-5 shadow-xl space-y-4 border border-white/10 backdrop-blur-md">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-bold text-rose-300">{selectedFinding.id}</span>
                    {getSeverityBadge(selectedFinding.severity)}
                    {getStatusBadge(selectedFinding.status)}
                  </div>
                  <h3 className="font-semibold text-slate-100 text-base">{selectedFinding.title}</h3>
                  <p className="text-xs font-mono text-cyan-300 mt-1 flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{selectedFinding.file}:{selectedFinding.line}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    id="edit-finding-btn"
                    onClick={() => onOpenFindingModal(selectedFinding)}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-medium transition-colors border border-white/10"
                  >
                    Edit
                  </button>
                  <button
                    id="assign-task-from-finding-btn"
                    onClick={() => onCreateTaskFromFinding(selectedFinding)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold transition-colors shadow-md shadow-cyan-500/20"
                    title="Dispatch task for Gemini to resolve this finding"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Assign Task to Gemini</span>
                  </button>
                </div>
              </div>

              {/* Status lifecycle buttons */}
              <div>
                <span className="block text-[11px] font-mono text-slate-400 mb-1.5 uppercase tracking-wider">
                  Review & Resolution Status:
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(['open', 'assigned', 'fixed', 'verified', 'rejected'] as FindingStatus[]).map((st) => (
                    <button
                      key={st}
                      onClick={() => onUpdateFindingStatus(selectedFinding.id, st)}
                      className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition-all ${
                        selectedFinding.status === st
                          ? 'bg-rose-500 text-white shadow-md font-bold'
                          : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/10'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <span className="block text-[11px] font-mono text-slate-400 mb-1 uppercase tracking-wider">
                  Defect Description & Context:
                </span>
                <div className="bg-black/40 border border-white/10 rounded-lg p-3.5 text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-wrap">
                  {selectedFinding.description}
                </div>
              </div>

              {/* Meta information */}
              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                  <span className="text-[10px] text-slate-400 block">Reported By</span>
                  <span className="font-semibold text-slate-200">{selectedFinding.created_by.toUpperCase()}</span>
                </div>
                <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                  <span className="text-[10px] text-slate-400 block">Assigned Coder</span>
                  <span className="font-semibold text-slate-200">{(selectedFinding.assigned_to || 'None').toUpperCase()}</span>
                </div>
              </div>

              {/* Resolution Notes */}
              {selectedFinding.resolution && (
                <div>
                  <span className="block text-[11px] font-mono text-emerald-400 mb-1 uppercase tracking-wider flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Resolution & Verification:
                  </span>
                  <div className="bg-black/40 border border-emerald-500/30 rounded-lg p-3.5 text-xs text-emerald-300/90 font-mono leading-relaxed whitespace-pre-wrap">
                    {selectedFinding.resolution}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="glass-card rounded-xl p-12 text-center text-slate-400 text-xs border border-white/10">
              Select a finding to inspect details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
