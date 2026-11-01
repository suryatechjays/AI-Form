import React, { useState } from 'react';
import {
  Search, FileText, Download, Trash2, UserPlus, Eye, Calendar,
  Droplet, Stethoscope, AlertTriangle, ShieldCheck, Printer, Lock,
  RefreshCw, Users, Activity, CheckCircle2, AlertOctagon, HeartPulse
} from 'lucide-react';
import { generatePatientRegistrationPDF } from '../services/pdfGenerator';
import { ROLES, normalizeRole, hasPermission, PERMISSIONS } from '../types/auth';
import { registrationAPI } from '../services/api';

export default function PatientRecordsView({
  records = [],
  pagination = { page: 1, limit: 15, total: 0, totalPages: 1 },
  isLoading = false,
  searchTerm: externalSearchTerm,
  onSearchChange,
  deptFilter: externalDeptFilter,
  onDeptChange,
  onPageChange,
  onPageSizeChange,
  currentUser,
  onSelectRecord,
  onNewRegistration,
  onDeleteRecord,
  onReloadRecords
}) {
  const [internalSearchTerm, setInternalSearchTerm] = useState('');
  const [internalDeptFilter, setInternalDeptFilter] = useState('All');
  const [downloadingId, setDownloadingId] = useState(null);
  const [regeneratingId, setRegeneratingId] = useState(null);

  const searchTerm = externalSearchTerm !== undefined ? externalSearchTerm : internalSearchTerm;
  const deptFilter = externalDeptFilter !== undefined ? externalDeptFilter : internalDeptFilter;

  const handleSearchChange = (val) => {
    if (onSearchChange) onSearchChange(val);
    else setInternalSearchTerm(val);
  };

  const handleDeptChange = (val) => {
    if (onDeptChange) onDeptChange(val);
    else setInternalDeptFilter(val);
  };

  const currentRole = normalizeRole(currentUser?.role);
  const isPatient = currentRole === ROLES.PATIENT;
  const isSuperUser = currentRole === ROLES.SUPER_USER;
  const canDelete = isSuperUser || hasPermission(currentUser, PERMISSIONS.DELETE_RECORDS);

  // Role-Based Record Filtering
  const accessibleRecords = isPatient
    ? records.filter(r => {
        if (r.rawRegistration || r.rawPatient) {
          const createdBy = r.rawRegistration?.created_by_user_id;
          const submittedBy = r.rawRegistration?.submitted_by_user_id;
          const patientUserId = r.rawPatient?.user_id;
          if (createdBy || submittedBy || patientUserId) {
            return (
              createdBy === currentUser?.id ||
              submittedBy === currentUser?.id ||
              patientUserId === currentUser?.id
            );
          }
          return true;
        }
        return (
          (currentUser?.linkedRegistrationId && r.registrationId === currentUser.linkedRegistrationId) ||
          (r.email && currentUser?.email && r.email.toLowerCase() === currentUser.email.toLowerCase())
        );
      })
    : records;

  const filtered = accessibleRecords.filter(r => {
    const matchesSearch =
      `${r.firstName || ''} ${r.lastName || ''}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.registrationId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.mrn || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.phone || '').includes(searchTerm);

    const matchesDept = deptFilter === 'All' || r.department === deptFilter;

    return matchesSearch && matchesDept;
  });

  const displayedRecords = onPageChange ? accessibleRecords : filtered;
  const currentPage = pagination?.page || 1;
  const pageSize = pagination?.limit || 15;
  const totalCount = pagination?.total !== undefined ? pagination.total : displayedRecords.length;
  const totalPages = pagination?.totalPages || Math.ceil(totalCount / pageSize) || 1;

  // KPI Metrics Calculation
  const allergyCount = accessibleRecords.filter(r => r.hasAllergies && r.allergies && r.allergies.length > 0).length;
  const cardiologyCount = accessibleRecords.filter(r => r.department === 'Cardiology').length;

  const handleDownloadPDF = async (patient, e) => {
    e.stopPropagation();
    setDownloadingId(patient.registrationId);
    try {
      if (patient.id || patient.registrationId) {
        try {
          const blob = await registrationAPI.downloadPDF(patient.id || patient.registrationId);
          const blobUrl = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = `AI_Form_Registration_${patient.registrationId || 'dossier'}.pdf`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.URL.revokeObjectURL(blobUrl);
          return;
        } catch (apiErr) {
          console.warn('Backend PDF download error, attempting client fallback:', apiErr);
        }
      }
      const doc = await generatePatientRegistrationPDF(patient);
      doc.save(`AI_Form_Registration_${patient.registrationId || 'dossier'}.pdf`);
    } catch (err) {
      console.error('Failed to generate patient registration PDF:', err);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleRegenerate = async (patient, e) => {
    e.stopPropagation();
    setRegeneratingId(patient.registrationId);
    try {
      await registrationAPI.retryPDF(patient.id || patient.registrationId);
      if (onReloadRecords) onReloadRecords();
    } catch (err) {
      console.error('Failed to regenerate PDF dossier:', err);
    } finally {
      setRegeneratingId(null);
    }
  };

  return (
    <div className="space-y-6">

      {/* Top Clinical KPI Stat Highlights Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* KPI 1 */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              {isPatient ? 'My Encounters' : 'Total Encounters'}
            </span>
            <div className="text-2xl font-black text-slate-900 mt-1">{totalCount}</div>
            <span className="text-[11px] text-teal-600 font-semibold mt-0.5 block">
              {isPatient ? 'Patient Portal Records' : 'Stored in Admissions DB'}
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shadow-xs">
            <Users size={20} />
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              {isPatient ? 'Active Records' : 'Active Today'}
            </span>
            <div className="text-2xl font-black text-emerald-700 mt-1">{displayedRecords.length}</div>
            <span className="text-[11px] text-emerald-600 font-semibold mt-0.5 block">
              {isPatient ? 'Filtered Records' : 'Filtered Encounters'}
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shadow-xs">
            <Activity size={20} />
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Critical Allergies</span>
            <div className="text-2xl font-black text-rose-700 mt-1">{allergyCount}</div>
            <span className="text-[11px] text-rose-600 font-semibold mt-0.5 block">Drug Sensitivity Alerts</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center shadow-xs">
            <AlertOctagon size={20} />
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              {isPatient ? 'Official Dossiers' : 'Verified Dossiers'}
            </span>
            <div className="text-2xl font-black text-purple-700 mt-1">{totalCount}</div>
            <span className="text-[11px] text-purple-600 font-semibold mt-0.5 block">
              {totalCount > 0 ? 'Official PDF Ready' : 'No Dossiers Yet'}
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-purple-50 border border-purple-200 text-purple-700 flex items-center justify-center shadow-xs">
            <FileText size={20} />
          </div>
        </div>

      </div>

      {/* Main Container Card */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 shadow-sm space-y-5">
        
        {/* Banner Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-black text-slate-900 tracking-tight">
                {isPatient ? 'My Medical Registration Records' : 'Hospital Admission Roster & Encounters Master'}
              </h2>
              <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 shadow-xs ${
                isPatient
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : isSuperUser
                  ? 'bg-purple-100 text-purple-800 border border-purple-200'
                  : 'bg-teal-100 text-teal-800 border border-teal-200'
              }`}>
                <ShieldCheck size={12} />
                {isPatient ? 'Patient Portal Scoped' : isSuperUser ? 'Super User Master Roster' : 'Reception Desk Scoped'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {isPatient
                ? 'Access your personal registration summary, inspect clinical markers, and download official intake cards.'
                : 'Search, audit, inspect clinical details, and reprint official PDF admission intake dossiers.'}
            </p>
          </div>

          {/* Register Button */}
          <button
            onClick={onNewRegistration}
            className="px-4 py-2 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white rounded-2xl text-xs font-bold shadow-md shadow-teal-600/20 hover:shadow-teal-600/30 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
          >
            <UserPlus size={15} />
            {isPatient ? 'New Self Registration' : 'Register New Patient'}
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[260px] relative">
            <Search size={15} className="absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder={isPatient ? 'Search my records by registration ID or department...' : 'Search by patient name, MRN, registration ID, or phone...'}
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50/80 hover:bg-slate-50 border border-slate-200 rounded-2xl text-xs focus:bg-white focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 outline-none transition-all font-medium"
            />
          </div>

          {!isPatient && (
            <select
              value={deptFilter}
              onChange={(e) => handleDeptChange(e.target.value)}
              className="px-3.5 py-2.5 bg-slate-50/80 hover:bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-700 outline-none focus:border-teal-500 transition-all cursor-pointer"
            >
              <option value="All">All Clinical Departments</option>
              <option value="General Medicine">General Medicine</option>
              <option value="Cardiology">Cardiology</option>
              <option value="Orthopedics">Orthopedics</option>
              <option value="Pediatrics">Pediatrics</option>
              <option value="Emergency Care">Emergency Care</option>
            </select>
          )}

          {onReloadRecords && (
            <button
              onClick={onReloadRecords}
              title="Refresh Roster from SQLite Backend"
              className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            </button>
          )}
        </div>

        {/* Records Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200/90 shadow-sm bg-white">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3.5 px-4">Patient Identity</th>
                <th className="py-3.5 px-3">Identifiers (ID & MRN)</th>
                <th className="py-3.5 px-3">DOB / Age / Blood</th>
                <th className="py-3.5 px-3">Department</th>
                <th className="py-3.5 px-3">Allergy Status</th>
                <th className="py-3.5 px-3">Admission Timestamp</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedRecords.length > 0 ? (
                displayedRecords.map((patient) => {
                  const fullName = `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'Unknown';
                  const hasAllergies = patient.hasAllergies && patient.allergies && patient.allergies.length > 0;
                  const initials = fullName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

                  return (
                    <tr
                      key={patient.registrationId}
                      className="hover:bg-teal-50/50 transition-colors cursor-pointer group"
                      onClick={() => onSelectRecord(patient)}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-teal-600 to-teal-500 text-white font-extrabold flex items-center justify-center text-[11px] shadow-xs ring-1 ring-teal-400/20 flex-shrink-0">
                            {initials || 'PT'}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 group-hover:text-teal-700 block transition-colors">
                              {fullName}
                            </span>
                            <span className="text-[11px] text-slate-400 font-medium">
                              {patient.phone || patient.email || 'No contact provided'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-3 font-mono text-[11px]">
                        <div className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-lg inline-block border border-slate-200">
                          {patient.registrationId}
                        </div>
                        <div className="text-[10px] text-slate-400 font-semibold mt-0.5">
                          {patient.mrn || 'MRN-PENDING'}
                        </div>
                      </td>

                      <td className="py-3.5 px-3 text-slate-700">
                        <div className="font-medium">{patient.dateOfBirth || 'N/A'} ({patient.age || '--'}y)</div>
                        <span className="font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded text-[10px] inline-block mt-0.5">
                          {patient.bloodGroup || 'Unknown'}
                        </span>
                      </td>

                      <td className="py-3.5 px-3">
                        <span className="px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200 inline-block">
                          {patient.department || 'General Medicine'}
                        </span>
                      </td>

                      <td className="py-3.5 px-3">
                        {hasAllergies ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1 w-max shadow-xs">
                            <AlertTriangle size={11} className="text-rose-600" />
                            {patient.allergies.length} Allergies
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/80 flex items-center gap-1 w-max">
                            <CheckCircle2 size={11} className="text-emerald-600" />
                            NKDA (No Allergies)
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 text-slate-500 font-mono text-[11px]">
                        {patient.registrationDate || '2026-10-28'}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          
                          {/* Download PDF button */}
                          <button
                            onClick={(e) => handleDownloadPDF(patient, e)}
                            disabled={downloadingId === patient.registrationId}
                            title="Download Official Registration PDF"
                            className="p-1.5 text-teal-700 hover:text-teal-900 hover:bg-teal-100/80 rounded-xl transition-all cursor-pointer"
                          >
                            {downloadingId === patient.registrationId ? (
                              <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Download size={15} />
                            )}
                          </button>

                          {/* Clerical Regenerate PDF when failed/pending */}
                          {patient.canRegenerate && (
                            <button
                              onClick={(e) => handleRegenerate(patient, e)}
                              disabled={regeneratingId === patient.registrationId}
                              title="Regenerate Failed/Pending PDF Dossier"
                              className="p-1.5 text-amber-600 hover:bg-amber-100 rounded-xl transition-colors cursor-pointer"
                            >
                              <RefreshCw size={15} className={regeneratingId === patient.registrationId ? 'animate-spin' : ''} />
                            </button>
                          )}

                          {/* View / Edit registration details */}
                          <button
                            onClick={() => onSelectRecord(patient)}
                            title="View / Edit Registration"
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                          >
                            <Eye size={15} />
                          </button>

                          {/* Delete Record (Restricted to Super User by RBAC) */}
                          {canDelete && (
                            <button
                              onClick={() => onDeleteRecord(patient.registrationId)}
                              title="Delete Record (Super User Only)"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}

                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                    {isPatient
                      ? 'No patient records found under your account. Register your details using the form.'
                      : 'No admissions records found matching your search criteria.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="text-slate-900 font-bold">{totalCount > 0 ? (currentPage - 1) * pageSize + 1 : 0}</strong> to{' '}
              <strong className="text-slate-900 font-bold">{Math.min(currentPage * pageSize, totalCount)}</strong> of{' '}
              <strong className="text-slate-900 font-bold">{totalCount}</strong> admissions
            </span>
            {onPageSizeChange && (
              <div className="flex items-center gap-1.5 ml-4">
                <span className="text-slate-400">Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => onPageSizeChange(Number(e.target.value))}
                  className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none cursor-pointer"
                >
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium mr-2">
              Page {currentPage} of {totalPages || 1}
            </span>
            <button
              onClick={() => onPageChange && onPageChange(currentPage - 1)}
              disabled={currentPage <= 1 || isLoading}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer active:scale-95"
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange && onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages || isLoading}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer active:scale-95"
            >
              Next
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}
