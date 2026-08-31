import React, { useState, useEffect } from 'react';
import { Check, Flame, ListTodo, Sparkles, X } from 'lucide-react';
import { AgentType, Finding, Task, TaskPriority, TaskStatus } from '../types.js';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (taskData: any) => Promise<void>;
  initialTask?: Task | null;
  findings?: Finding[];
}

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialTask,
  findings = [],
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assignee, setAssignee] = useState<AgentType>('gemini');
  const [createdBy, setCreatedBy] = useState<AgentType>('chatgpt');
  const [status, setStatus] = useState<TaskStatus>('assigned');
  const [relatedFiles, setRelatedFiles] = useState('');
  const [relatedFinding, setRelatedFinding] = useState('');
  const [result, setResult] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialTask) {
      setTitle(initialTask.title);
      setDescription(initialTask.description);
      setPriority(initialTask.priority);
      setAssignee(initialTask.assignee);
      setCreatedBy(initialTask.created_by);
      setStatus(initialTask.status);
      setRelatedFiles(initialTask.related_files?.join(', ') || '');
      setRelatedFinding(initialTask.related_finding || '');
      setResult(initialTask.result || '');
    } else {
      setTitle('');
      setDescription('');
      setPriority('medium');
      setAssignee('gemini');
      setCreatedBy('chatgpt');
      setStatus('assigned');
      setRelatedFiles('');
      setRelatedFinding('');
      setResult('');
    }
  }, [initialTask, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setIsSubmitting(true);
    try {
      const filesArray = relatedFiles
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean);

      await onSave({
        title: title.trim(),
        description: description.trim(),
        priority,
        assignee,
        created_by: createdBy,
        status,
        related_files: filesArray,
        related_finding: relatedFinding || null,
        result: result.trim() || null,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div
        id="task-modal-container"
        className="glass-card rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-white/15 backdrop-blur-xl"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-black/30">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
              <ListTodo className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-100 text-base">
                {initialTask ? `Edit Task: ${initialTask.id}` : 'Create New Collaboration Task'}
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Bridge task dispatch for Gemini 3.7 Flash or ChatGPT review.
              </p>
            </div>
          </div>
          <button
            id="close-task-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1.5 font-medium">
              Task Title <span className="text-rose-400">*</span>
            </label>
            <input
              id="task-title-input"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Implement token refresh mutex in auth service"
              className="w-full px-3.5 py-2.5 rounded-lg bg-black/40 border border-white/10 text-slate-100 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          {/* Grid settings */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Assignee */}
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1.5 font-medium">Assignee</label>
              <select
                id="task-assignee-select"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value as AgentType)}
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
              >
                <option value="gemini" className="bg-slate-900 text-slate-100">Gemini 3.7 Flash (Coder)</option>
                <option value="chatgpt" className="bg-slate-900 text-slate-100">ChatGPT (Reviewer)</option>
                <option value="human" className="bg-slate-900 text-slate-100">Human Operator</option>
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1.5 font-medium">Priority</label>
              <select
                id="task-priority-select"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
              >
                <option value="urgent" className="bg-slate-900 text-slate-100">🔴 Urgent</option>
                <option value="high" className="bg-slate-900 text-slate-100">🟠 High</option>
                <option value="medium" className="bg-slate-900 text-slate-100">🟡 Medium</option>
                <option value="low" className="bg-slate-900 text-slate-100">🔵 Low</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1.5 font-medium">Status</label>
              <select
                id="task-status-select"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
              >
                <option value="pending" className="bg-slate-900 text-slate-100">Pending</option>
                <option value="assigned" className="bg-slate-900 text-slate-100">Assigned</option>
                <option value="working" className="bg-slate-900 text-slate-100">Working</option>
                <option value="review" className="bg-slate-900 text-slate-100">Review</option>
                <option value="completed" className="bg-slate-900 text-slate-100">Completed</option>
                <option value="blocked" className="bg-slate-900 text-slate-100">Blocked</option>
                <option value="cancelled" className="bg-slate-900 text-slate-100">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1.5 font-medium">
              Task Description & Criteria <span className="text-rose-400">*</span>
            </label>
            <textarea
              id="task-description-input"
              rows={4}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide exact instructions, required file changes, edge cases, and expected acceptance tests..."
              className="w-full px-3.5 py-2.5 rounded-lg bg-black/40 border border-white/10 text-slate-100 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-sans leading-relaxed"
            />
          </div>

          {/* Related Finding & Related Files */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1.5 font-medium">
                Linked Finding / Bug ID
              </label>
              <select
                id="task-related-finding-select"
                value={relatedFinding}
                onChange={(e) => setRelatedFinding(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
              >
                <option value="" className="bg-slate-900 text-slate-100">None (Standalone Task)</option>
                {findings.map((f) => (
                  <option key={f.id} value={f.id} className="bg-slate-900 text-slate-100">
                    {f.id}: {f.title} ({f.severity})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1.5 font-medium">
                Related Files (comma-separated)
              </label>
              <input
                id="task-related-files-input"
                type="text"
                value={relatedFiles}
                onChange={(e) => setRelatedFiles(e.target.value)}
                placeholder="src/services/auth.ts, tests/auth.test.ts"
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-slate-200 text-xs focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          </div>

          {/* Execution Result (Visible if editing or marking complete) */}
          {(initialTask || status === 'completed' || status === 'review') && (
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1.5 font-medium">
                Execution Result / Gemini Report
              </label>
              <textarea
                id="task-result-input"
                rows={3}
                value={result}
                onChange={(e) => setResult(e.target.value)}
                placeholder="Report of modified files, test execution logs, and notes reported by Gemini..."
                className="w-full px-3.5 py-2.5 rounded-lg bg-black/40 border border-white/10 text-slate-200 text-xs font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
          )}

          {/* Modal Footer */}
          <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-3">
            <button
              id="cancel-task-btn"
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              id="save-task-btn"
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md shadow-cyan-500/20 transition-all disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{initialTask ? 'Update Task' : 'Dispatch Task'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
