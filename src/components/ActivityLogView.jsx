import React, { useState } from 'react';
import { 
  Activity, Search, Filter, Shield, Download, Trash2, 
  CheckCircle2, AlertCircle, Info, AlertTriangle, FileText, Mic, UserCheck, Key 
} from 'lucide-react';

export default function ActivityLogView({
  logs = [],
  onClearLogs
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.actorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSeverity = severityFilter === 'ALL' || log.severity === severityFilter;
    const matchesAction = actionFilter === 'ALL' || log.action === actionFilter;

    return matchesSearch && matchesSeverity && matchesAction;
  });

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `AIForm_Activity_Audit_Log_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const getActionBadge = (action) => {
    switch (action) {
      case 'DOCUMENT_PARSED':
        return { label: 'OCR Document Parsed', icon: FileText, color: 'bg-teal-100 text-teal-800 border-teal-200' };
      case 'VOICE_INTAKE_USED':
        return { label: 'Voice Intake Assistant', icon: Mic, color: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'REGISTRATION_SUBMITTED':
        return { label: 'Registration Intake', icon: CheckCircle2, color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
      case 'PDF_DOWNLOADED':
        return { label: 'PDF Dossier Downloaded', icon: Download, color: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
      case 'ACCOUNT_CREATED':
      case 'ACCOUNT_UPDATED':
      case 'ROLE_ASSIGNED':
        return { label: 'Account Security', icon: Key, color: 'bg-purple-100 text-purple-800 border-purple-200' };
      case 'ACCOUNT_DEACTIVATED':
        return { label: 'Account Deactivation', icon: AlertTriangle, color: 'bg-rose-100 text-rose-800 border-rose-200' };
      default:
        return { label: action.replace(/_/g, ' '), icon: Info, color: 'bg-slate-100 text-slate-800 border-slate-200' };
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 shadow-sm space-y-6">
      
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-black text-slate-900 tracking-tight">Security Audit Trail & Activity Monitoring</h2>
            <span className="text-[10px] bg-purple-100 text-purple-800 border border-purple-200 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 shadow-xs">
              <Shield size={12} /> HIPAA Audit Logging
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Real-time chronological telemetry tracking registrations, OCR uploads, AI extractions, and administrative actions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportJSON}
            className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-2xl text-xs font-bold flex items-center gap-1.5 shadow-sm hover:shadow transition-all active:scale-95 cursor-pointer"
          >
            <Download size={14} className="text-purple-600" /> Export JSON Audit
          </button>
          <button
            onClick={onClearLogs}
            className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all cursor-pointer"
          >
            Clear Log
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px] relative">
          <Search size={15} className="absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search events by details, actor name, or action..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none"
          />
        </div>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none"
        >
          <option value="ALL">All Severities</option>
          <option value="info">Info</option>
          <option value="success">Success</option>
          <option value="warning">Warning</option>
          <option value="danger">Danger</option>
        </select>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none"
        >
          <option value="ALL">All Event Types</option>
          <option value="REGISTRATION_SUBMITTED">Registrations</option>
          <option value="DOCUMENT_PARSED">Document & OCR Parsing</option>
          <option value="VOICE_INTAKE_USED">Voice Intake Sessions</option>
          <option value="PDF_DOWNLOADED">PDF Downloads</option>
          <option value="ACCOUNT_CREATED">Account Created</option>
          <option value="ROLE_ASSIGNED">Role / Permission Assigned</option>
          <option value="ACCOUNT_DEACTIVATED">Account Deactivations</option>
        </select>
      </div>

      {/* Activity Timeline List */}
      <div className="space-y-3">
        {filteredLogs.length > 0 ? (
          filteredLogs.map((log) => {
            const badge = getActionBadge(log.action);
            const Icon = badge.icon;

            return (
              <div
                key={log.id}
                className="p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50/70 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 border ${badge.color}`}>
                    <Icon size={16} />
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold border ${badge.color}`}>
                        {badge.label}
                      </span>
                      <span className="font-bold text-slate-900">{log.actorName}</span>
                      <span className="text-[10px] text-slate-400 font-mono">({log.actorRole})</span>
                    </div>

                    <p className="text-slate-700 font-medium">
                      {log.details}
                    </p>
                  </div>
                </div>

                <div className="text-right sm:flex-shrink-0">
                  <span className="font-mono text-[11px] text-slate-400 block">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    {new Date(log.timestamp).toLocaleDateString()}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-12 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
            No activity logs match your filter criteria.
          </div>
        )}
      </div>

    </div>
  );
}

