import React, { useState, useEffect } from 'react';
import { AlertTriangle, Check, ShieldAlert, X } from 'lucide-react';
import { AgentType, Finding, FindingSeverity, FindingStatus } from '../types.js';

interface FindingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (findingData: any) => Promise<void>;
  initialFinding?: Finding | null;
}

export const FindingModal: React.FC<FindingModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialFinding,
}) => {
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<FindingSeverity>('high');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState('');
  const [line, setLine] = useState('1');
  const [status, setStatus] = useState<FindingStatus>('open');
  const [createdBy, setCreatedBy] = useState<AgentType>('chatgpt');
  const [assignedTo, setAssignedTo] = useState<AgentType | ''>('gemini');
  const [resolution, setResolution] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialFinding) {
      setTitle(initialFinding.title);
      setSeverity(initialFinding.severity);
      setDescription(initialFinding.description);
      setFile(initialFinding.file);
      setLine(String(initialFinding.line || '1'));
      setStatus(initialFinding.status);
      setCreatedBy(initialFinding.created_by);
      setAssignedTo(initialFinding.assigned_to || '');
      setResolution(initialFinding.resolution || '');
    } else {
      setTitle('');
      setSeverity('high');
      setDescription('');
      setFile('src/');
      setLine('1');
      setStatus('open');
      setCreatedBy('chatgpt');
      setAssignedTo('gemini');
      setResolution('');
    }
  }, [initialFinding, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !file.trim()) return;

    setIsSubmitting(true);
    try {
      await onSave({
        title: title.trim(),
        severity,
        description: description.trim(),
        file: file.trim(),
        line: line.trim() || '1',
        status,
        created_by: createdBy,
        assigned_to: assignedTo || null,
        resolution: resolution.trim() || null,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div
        id="finding-modal-container"
        className="glass-card rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-white/15 backdrop-blur-xl"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-black/30">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-100 text-base">
                {initialFinding ? `Edit Finding: ${initialFinding.id}` : 'Log Code Review Finding'}
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Identified vulnerability, defect, or architectural smell.
              </p>
            </div>
          </div>
          <button
            id="close-finding-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1.5 font-medium">
              Finding Title <span className="text-rose-400">*</span>
            </label>
            <input
              id="finding-title-input"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Unhandled promise rejection in auth callback"
              className="w-full px-3.5 py-2.5 rounded-lg bg-black/40 border border-white/10 text-slate-100 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Severity */}
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1.5 font-medium">Severity</label>
              <select
                id="finding-severity-select"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as FindingSeverity)}
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-slate-200 text-xs focus:outline-none focus:border-rose-500"
              >
                <option value="critical" className="bg-slate-900 text-slate-100">🔴 Critical</option>
                <option value="high" className="bg-slate-900 text-slate-100">🟠 High</option>
                <option value="medium" className="bg-slate-900 text-slate-100">🟡 Medium</option>
                <option value="low" className="bg-slate-900 text-slate-100">🔵 Low</option>
                <option value="info" className="bg-slate-900 text-slate-100">⚪ Info</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1.5 font-medium">Status</label>
              <select
                id="finding-status-select"
                value={status}
                onChange={(e) => setStatus(e.target.value as FindingStatus)}
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-slate-200 text-xs focus:outline-none focus:border-rose-500"
              >
                <option value="open" className="bg-slate-900 text-slate-100">Open</option>
                <option value="assigned" className="bg-slate-900 text-slate-100">Assigned</option>
                <option value="fixed" className="bg-slate-900 text-slate-100">Fixed</option>
                <option value="verified" className="bg-slate-900 text-slate-100">Verified (ChatGPT)</option>
                <option value="rejected" className="bg-slate-900 text-slate-100">Rejected</option>
              </select>
            </div>

            {/* Assigned to */}
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1.5 font-medium">Assign To</label>
              <select
                id="finding-assigned-select"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value as AgentType)}
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-slate-200 text-xs focus:outline-none focus:border-rose-500"
              >
                <option value="gemini" className="bg-slate-900 text-slate-100">Gemini 3.7 Flash</option>
                <option value="chatgpt" className="bg-slate-900 text-slate-100">ChatGPT</option>
                <option value="human" className="bg-slate-900 text-slate-100">Human</option>
              </select>
            </div>
          </div>

          {/* File location */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-mono text-slate-300 mb-1.5 font-medium">
                Affected File Path <span className="text-rose-400">*</span>
              </label>
              <input
                id="finding-file-input"
                type="text"
                required
                value={file}
                onChange={(e) => setFile(e.target.value)}
                placeholder="src/services/auth.ts"
                className="w-full px-3.5 py-2 rounded-lg bg-black/40 border border-white/10 text-slate-200 text-xs font-mono focus:outline-none focus:border-rose-500"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1.5 font-medium">Line(s)</label>
              <input
                id="finding-line-input"
                type="text"
                value={line}
                onChange={(e) => setLine(e.target.value)}
                placeholder="42 or 42-50"
                className="w-full px-3.5 py-2 rounded-lg bg-black/40 border border-white/10 text-slate-200 text-xs font-mono focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1.5 font-medium">
              Description & Reproduction Details <span className="text-rose-400">*</span>
            </label>
            <textarea
              id="finding-description-input"
              rows={4}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the exact bug mechanism, impact, and suggested fix..."
              className="w-full px-3.5 py-2.5 rounded-lg bg-black/40 border border-white/10 text-slate-100 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 leading-relaxed font-sans"
            />
          </div>

          {/* Resolution */}
          {(initialFinding || status === 'fixed' || status === 'verified') && (
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1.5 font-medium">
                Resolution & Verification Details
              </label>
              <textarea
                id="finding-resolution-input"
                rows={2}
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="Notes on fix validation, test coverage, and verification status..."
                className="w-full px-3.5 py-2.5 rounded-lg bg-black/40 border border-white/10 text-slate-200 text-xs font-mono focus:outline-none focus:border-rose-500"
              />
            </div>
          )}

          {/* Footer */}
          <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-3">
            <button
              id="cancel-finding-btn"
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              id="save-finding-btn"
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold bg-rose-500 hover:bg-rose-400 text-white shadow-md shadow-rose-500/20 transition-all disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{initialFinding ? 'Update Finding' : 'Log Finding'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
