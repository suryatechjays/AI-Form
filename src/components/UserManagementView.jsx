import React, { useState } from 'react';
import { 
  Users, UserPlus, Shield, UserCheck, UserX, Edit3, Trash2, 
  Search, Filter, CheckCircle2, AlertTriangle, Key, Lock, Mail, X, User 
} from 'lucide-react';
import { ROLES, PERMISSIONS, ROLE_PERMISSIONS } from '../types/auth';

export default function UserManagementView({
  users = [],
  pagination = { page: 1, limit: 15, total: 0, totalPages: 1 },
  isLoading = false,
  searchTerm: externalSearchTerm,
  onSearchChange,
  roleFilter: externalRoleFilter,
  onRoleChange,
  statusFilter: externalStatusFilter,
  onStatusChange,
  onPageChange,
  onPageSizeChange,
  currentUser,
  onCreateUser,
  onUpdateUser,
  onToggleDeactivate,
  onDeleteUser
}) {
  const [internalSearchTerm, setInternalSearchTerm] = useState('');
  const [internalRoleFilter, setInternalRoleFilter] = useState('ALL');
  const [internalStatusFilter, setInternalStatusFilter] = useState('active'); // Default: Only active accounts visible

  const searchTerm = externalSearchTerm !== undefined ? externalSearchTerm : internalSearchTerm;
  const roleFilter = externalRoleFilter !== undefined ? externalRoleFilter : internalRoleFilter;
  const statusFilter = externalStatusFilter !== undefined ? externalStatusFilter : internalStatusFilter;

  const handleSearchChange = (val) => {
    if (onSearchChange) onSearchChange(val);
    else setInternalSearchTerm(val);
  };

  const handleRoleChange = (val) => {
    if (onRoleChange) onRoleChange(val);
    else setInternalRoleFilter(val);
  };

  const handleStatusChange = (val) => {
    if (onStatusChange) onStatusChange(val);
    else setInternalStatusFilter(val);
  };

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  // Form state for Create / Edit
  const [formData, setFormData] = useState({
    username: '',
    name: '',
    email: '',
    password: '',
    role: ROLES.RECEPTIONIST,
    department: 'Admissions Desk',
    status: 'active',
    permissions: [...(ROLE_PERMISSIONS[ROLES.RECEPTIONIST] || [])]
  });

  const filteredUsers = users.filter(u => {
    const rawTerm = (searchTerm || '').trim().toLowerCase();
    let matchesSearch = true;
    if (rawTerm) {
      const uName = (u.name || '').toLowerCase();
      const uUsername = (u.username || '').toLowerCase();
      const uEmail = (u.email || '').toLowerCase();
      const uDept = (u.department || '').toLowerCase();
      const uSearchable = `${uName} ${uUsername} ${uEmail} ${uDept}`;

      const searchWords = rawTerm.split(/\s+/).filter(Boolean);
      matchesSearch =
        uSearchable.includes(rawTerm) ||
        searchWords.every(word => uSearchable.includes(word));
    }

    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    const isDeactivated = u.status === 'deactivated' || u.is_active === 0;
    const matchesStatus = 
      statusFilter === 'ALL' || 
      (statusFilter === 'active' && !isDeactivated) || 
      (statusFilter === 'deactivated' && isDeactivated);

    return matchesSearch && matchesRole && matchesStatus;
  });

  const displayedUsers = (onPageChange ? users : filteredUsers).filter(u => {
    const isDeactivated = u.status === 'deactivated' || u.is_active === 0 || u.is_active === '0' || u.is_active === false;
    if (statusFilter === 'active') return !isDeactivated;
    if (statusFilter === 'deactivated') return isDeactivated;
    return true;
  });
  const currentPage = pagination?.page || 1;
  const pageSize = pagination?.limit || 15;
  const totalCount = pagination?.total !== undefined ? pagination.total : filteredUsers.length;
  const totalPages = pagination?.totalPages || Math.ceil(totalCount / pageSize) || 1;

  const handleOpenCreate = () => {
    setFormData({
      username: '',
      name: '',
      email: '',
      password: '',
      role: ROLES.RECEPTIONIST,
      department: 'Admissions Desk',
      status: 'active',
      permissions: [...(ROLE_PERMISSIONS[ROLES.RECEPTIONIST] || [])]
    });
    setIsCreateModalOpen(true);
  };

  const handleOpenEdit = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username || '',
      name: user.name || user.username || '',
      email: user.email || '',
      password: '',
      role: user.role || ROLES.RECEPTIONIST,
      department: user.department || 'General',
      status: (user.status === 'deactivated' || user.is_active === 0) ? 'deactivated' : 'active',
      permissions: user.permissions && user.permissions.length > 0 
        ? [...user.permissions] 
        : [...(ROLE_PERMISSIONS[user.role] || [])]
    });
  };

  const handleRoleChangeInForm = (newRole) => {
    setFormData(prev => ({
      ...prev,
      role: newRole,
      // Assign default permissions for the newly selected role
      permissions: [...(ROLE_PERMISSIONS[newRole] || [])]
    }));
  };

  const togglePermissionInForm = (permKey) => {
    setFormData(prev => {
      const exists = prev.permissions.includes(permKey);
      return {
        ...prev,
        permissions: exists
          ? prev.permissions.filter(p => p !== permKey)
          : [...prev.permissions, permKey]
      };
    });
  };

  const handleSaveCreate = (e) => {
    e.preventDefault();
    if (!formData.email) return;

    const username = (
      formData.username ||
      formData.email.split('@')[0] ||
      formData.name.toLowerCase().replace(/[^a-z0-9]/g, '_')
    ).trim();

    onCreateUser({
      ...formData,
      username,
      name: formData.name || username,
      createdAt: new Date().toISOString().split('T')[0],
      lastActive: 'Never',
      avatarColor: formData.role === ROLES.SUPER_USER 
        ? 'bg-purple-600' 
        : formData.role === ROLES.RECEPTIONIST 
        ? 'bg-teal-600' 
        : formData.role === ROLES.ASSISTANT_ADMIN
        ? 'bg-blue-600'
        : 'bg-emerald-600'
    });

    setIsCreateModalOpen(false);
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    if (!editingUser) return;

    onUpdateUser(editingUser.id, {
      ...formData,
      name: formData.name || editingUser.name || formData.username,
      avatarColor: formData.role === ROLES.SUPER_USER 
        ? 'bg-purple-600' 
        : formData.role === ROLES.RECEPTIONIST 
        ? 'bg-teal-600' 
        : formData.role === ROLES.ASSISTANT_ADMIN
        ? 'bg-blue-600'
        : 'bg-emerald-600'
    });

    setEditingUser(null);
  };

  const ALL_PERMISSIONS_LIST = [
    { key: PERMISSIONS.REGISTER_SELF, label: 'Register Self', desc: 'Can register own patient profile' },
    { key: PERMISSIONS.REGISTER_OTHERS, label: 'Register Others', desc: 'Can register new patients at admissions desk' },
    { key: PERMISSIONS.UPLOAD_DOCUMENTS, label: 'Upload Documents & OCR', desc: 'Can upload medical records and parse text' },
    { key: PERMISSIONS.VOICE_INTAKE, label: 'Voice Intake Assistant', desc: 'Can use speech-to-text voice assistant' },
    { key: PERMISSIONS.VIEW_ALL_RECORDS, label: 'View All Admissions', desc: 'Can search and access all hospital patient records' },
    { key: PERMISSIONS.EDIT_RECORDS, label: 'Edit Patient Records', desc: 'Can update clinical information and admissions' },
    { key: PERMISSIONS.DELETE_RECORDS, label: 'Delete Records', desc: 'Can permanently remove registration records' },
    { key: PERMISSIONS.MANAGE_USERS, label: 'Manage User Accounts', desc: 'Can create and modify accounts' },
    { key: PERMISSIONS.ASSIGN_ROLES, label: 'Assign Roles & Permissions', desc: 'Can change user roles and grant security privileges' },
    { key: PERMISSIONS.DEACTIVATE_USERS, label: 'Deactivate Accounts', desc: 'Can disable user access' },
    { key: PERMISSIONS.VIEW_ACTIVITY_LOGS, label: 'Audit Activity Logs', desc: 'Can inspect system monitoring activity logs' },
    { key: PERMISSIONS.ADMIN_SETTINGS, label: 'Access Admin Settings', desc: 'Can configure system settings and parameters' }
  ];

  const receptionCount = users.filter(u => u.role === ROLES.RECEPTIONIST).length;
  const adminCount = users.filter(u => u.role === ROLES.SUPER_USER || u.role === ROLES.ASSISTANT_ADMIN).length;
  const deactivatedCount = users.filter(u => u.status === 'deactivated' || u.is_active === 0 || u.is_active === '0' || u.is_active === false).length;

  return (
    <div className="space-y-6">

      {/* Top Security & RBAC KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total User Accounts</span>
            <div className="text-2xl font-black text-slate-900 mt-1">{totalCount}</div>
            <span className="text-[11px] text-purple-600 font-semibold mt-0.5 block">SQLite Master Store</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-purple-50 border border-purple-200 text-purple-700 flex items-center justify-center shadow-xs">
            <Users size={20} />
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Reception Staff</span>
            <div className="text-2xl font-black text-teal-700 mt-1">{receptionCount}</div>
            <span className="text-[11px] text-teal-600 font-semibold mt-0.5 block">Intake & Admissions</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shadow-xs">
            <UserCheck size={20} />
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Admin Officers</span>
            <div className="text-2xl font-black text-indigo-700 mt-1">{adminCount}</div>
            <span className="text-[11px] text-indigo-600 font-semibold mt-0.5 block">Super & Assistant Admins</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center shadow-xs">
            <Shield size={20} />
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Deactivated Accounts</span>
            <div className="text-2xl font-black text-rose-700 mt-1">{deactivatedCount}</div>
            <span className="text-[11px] text-rose-600 font-semibold mt-0.5 block">Revoked Access</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center shadow-xs">
            <UserX size={20} />
          </div>
        </div>

      </div>

      <div className="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 shadow-sm space-y-6">
      
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-black text-slate-900 tracking-tight">User Account & Role-Based Access Control (RBAC)</h2>
            <span className="text-[10px] bg-purple-100 text-purple-800 border border-purple-200 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 shadow-xs">
              <Shield size={12} /> SQLite Database Synchronized
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Manage persisted accounts for Patients, Receptionists, Assistant Administrators, and Super Users stored in the SQLite backend.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 text-white rounded-2xl text-xs font-bold shadow-md shadow-purple-600/20 hover:shadow-purple-600/30 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
        >
          <UserPlus size={15} /> Create User Account
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px] relative">
          <Search size={15} className="absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search by username, full name, email, or department..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all font-medium"
          />
        </div>

        {/* Role Filter */}
        <select
          value={roleFilter}
          onChange={(e) => handleRoleChange(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-purple-500 transition-all cursor-pointer"
        >
          <option value="ALL">All Roles</option>
          <option value={ROLES.PATIENT}>Patients</option>
          <option value={ROLES.RECEPTIONIST}>Receptionists</option>
          <option value={ROLES.ASSISTANT_ADMIN}>Assistant Admins</option>
          <option value={ROLES.SUPER_USER}>Super Users</option>
        </select>

        {/* Status Filter: Defaults strictly to active accounts */}
        <select
          value={statusFilter}
          onChange={(e) => handleStatusChange(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-purple-500 transition-all cursor-pointer"
        >
          <option value="active">Active Accounts Only (Default)</option>
          <option value="deactivated">Deactivated Accounts Only</option>
          <option value="ALL">All Accounts (Including Deactivated)</option>
        </select>
      </div>

      {/* User Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
              <th className="py-3 px-4">User & Handle</th>
              <th className="py-3 px-3">Role</th>
              <th className="py-3 px-3">Department</th>
              <th className="py-3 px-3">Account Status</th>
              <th className="py-3 px-3">Assigned Permissions</th>
              <th className="py-3 px-3">Created</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayedUsers.length > 0 ? (
              displayedUsers.map((user) => {
                const isSelf = currentUser?.id === user.id || currentUser?.username === user.username;
                const isDeactivated = user.status === 'deactivated' || user.is_active === 0;

                return (
                  <tr
                    key={user.id || user.username}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isDeactivated ? 'bg-slate-50/50 opacity-70' : ''
                    }`}
                  >
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-full ${user.avatarColor || 'bg-slate-500'} text-white font-bold flex items-center justify-center text-xs shadow-sm`}>
                          {(user.name || user.username || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900">{user.name || user.username}</span>
                            {isSelf && (
                              <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-semibold">You</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-normal">
                            <span className="font-mono text-slate-600 font-medium">@{user.username}</span>
                            <span>•</span>
                            <span>{user.email}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        user.role === ROLES.SUPER_USER
                          ? 'bg-purple-100 text-purple-800 border border-purple-200'
                          : user.role === ROLES.RECEPTIONIST
                          ? 'bg-teal-100 text-teal-800 border border-teal-200'
                          : user.role === ROLES.ASSISTANT_ADMIN
                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}>
                        {user.role === ROLES.SUPER_USER 
                          ? 'Super User' 
                          : user.role === ROLES.RECEPTIONIST 
                          ? 'Receptionist' 
                          : user.role === ROLES.ASSISTANT_ADMIN
                          ? 'Assistant Admin'
                          : 'Patient'}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-slate-600 font-medium">
                      {user.department || 'General'}
                    </td>

                    <td className="py-3 px-3">
                      {isDeactivated ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                          <UserX size={11} /> Deactivated
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                          <UserCheck size={11} /> Active
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-slate-600">
                      <span className="bg-slate-100 px-2 py-0.5 rounded-md text-[11px] font-semibold text-slate-700 border border-slate-200">
                        {user.permissions?.length || 0} scopes
                      </span>
                    </td>

                    <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                      {user.createdAt || '2026-01-01'}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        
                        {/* Edit Role & Permissions */}
                        <button
                          onClick={() => handleOpenEdit(user)}
                          title="Edit User & Permissions"
                          className="p-1.5 text-slate-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                        >
                          <Edit3 size={15} />
                        </button>

                        {/* Deactivate / Reactivate Toggle */}
                        <button
                          onClick={() => onToggleDeactivate(user.id)}
                          disabled={isSelf}
                          title={isSelf ? 'Cannot deactivate your own account' : isDeactivated ? 'Reactivate Account' : 'Deactivate Account'}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isSelf
                              ? 'text-slate-300 cursor-not-allowed'
                              : isDeactivated
                              ? 'text-emerald-600 hover:bg-emerald-50'
                              : 'text-amber-600 hover:bg-amber-50'
                          }`}
                        >
                          {isDeactivated ? <UserCheck size={15} /> : <UserX size={15} />}
                        </button>

                        {/* Soft Delete User */}
                        <button
                          onClick={() => onDeleteUser(user.id)}
                          disabled={isSelf}
                          title={isSelf ? 'Cannot delete current account' : 'Deactivate & Archive Account'}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isSelf
                              ? 'text-slate-300 cursor-not-allowed'
                              : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                          }`}
                        >
                          <Trash2 size={15} />
                        </button>

                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                  No user accounts found matching your filter criteria.
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
            <strong className="text-slate-900 font-bold">{totalCount}</strong> accounts
          </span>
          {onPageSizeChange && (
            <div className="flex items-center gap-1.5 ml-4">
              <span className="text-slate-400">Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none"
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
            className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <button
            onClick={() => onPageChange && onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages || isLoading}
            className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>

      {/* CREATE USER MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            
            <div className="bg-gradient-to-r from-purple-700 to-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/30 border border-purple-400/40 flex items-center justify-center text-purple-200">
                  <UserPlus size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold">Create New User Account</h3>
                  <p className="text-xs text-purple-200">Persist account directly to AI Form SQLite backend with Argon2id password hashing</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-lg text-purple-200 hover:text-white hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCreate} className="p-6 overflow-y-auto space-y-4 flex-1">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Username (Login Handle) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. sarah_jenkins"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500 font-medium"
                  />
                  <span className="text-[10px] text-slate-400">Used for credentials login against backend</span>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Initial Password *</label>
                  <input
                    type="password"
                    required
                    placeholder="Enter initial password (min 8 chars)"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500 font-medium"
                  />
                  <span className="text-[10px] text-slate-400">Minimum 8 characters (Argon2id hashed)</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Full Display Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Sarah Jenkins"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500 font-medium"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. sjenkins@aegishealth.org"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500 font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Assigned Role *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => handleRoleChangeInForm(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-purple-500"
                  >
                    <option value={ROLES.RECEPTIONIST}>Receptionist (Register patients & admissions roster)</option>
                    <option value={ROLES.ASSISTANT_ADMIN}>Assistant Administrator (Admissions supervisor)</option>
                    <option value={ROLES.PATIENT}>Patient (Self-registration & document upload)</option>
                    <option value={ROLES.SUPER_USER}>Super User (Full administrative control & audit)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Department</label>
                  <input
                    type="text"
                    placeholder="e.g. Admissions Desk, Triage"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500 font-medium"
                  />
                </div>
              </div>

              {/* Granular Permissions Box */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Assigned Role Permissions ({formData.permissions.length} granted):
                  </span>
                  <span className="text-[11px] text-slate-500">Auto-filled by role selection</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {ALL_PERMISSIONS_LIST.map((p) => {
                    const isChecked = formData.permissions.includes(p.key);
                    return (
                      <label
                        key={p.key}
                        className={`flex items-start gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                          isChecked ? 'bg-purple-50/60 border-purple-200' : 'bg-white border-slate-200 opacity-60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => togglePermissionInForm(p.key)}
                          className="mt-0.5 rounded text-purple-600 focus:ring-purple-500"
                        />
                        <div>
                          <span className="font-bold text-slate-900 block">{p.label}</span>
                          <span className="text-[10px] text-slate-500">{p.desc}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/20"
                >
                  Save to SQLite Database
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER & PERMISSIONS MODAL */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            
            <div className="bg-gradient-to-r from-purple-700 to-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/30 border border-purple-400/40 flex items-center justify-center text-purple-200">
                  <Edit3 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold">Edit Account & Assign Permissions</h3>
                  <p className="text-xs text-purple-200">Modify role and access privileges for <strong>@{editingUser.username}</strong></p>
                </div>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="p-1.5 rounded-lg text-purple-200 hover:text-white hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Full Legal Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500 font-medium"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500 font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => handleRoleChangeInForm(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-purple-500"
                  >
                    <option value={ROLES.RECEPTIONIST}>Receptionist</option>
                    <option value={ROLES.ASSISTANT_ADMIN}>Assistant Admin</option>
                    <option value={ROLES.PATIENT}>Patient</option>
                    <option value={ROLES.SUPER_USER}>Super User</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Department</label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500 font-medium"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Account Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-purple-500"
                  >
                    <option value="active">Active (Access Enabled)</option>
                    <option value="deactivated">Deactivated (Access Blocked)</option>
                  </select>
                </div>
              </div>

              {/* Permissions Checkbox Grid */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Granular Access Permissions ({formData.permissions.length} active):
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, permissions: ALL_PERMISSIONS_LIST.map(p => p.key) })}
                      className="text-xs font-semibold text-purple-700 hover:underline"
                    >
                      Grant All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, permissions: [] })}
                      className="text-xs font-semibold text-slate-500 hover:underline"
                    >
                      Revoke All
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {ALL_PERMISSIONS_LIST.map((p) => {
                    const isChecked = formData.permissions.includes(p.key);
                    return (
                      <label
                        key={p.key}
                        className={`flex items-start gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                          isChecked ? 'bg-purple-50/60 border-purple-200' : 'bg-white border-slate-200 opacity-60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => togglePermissionInForm(p.key)}
                          className="mt-0.5 rounded text-purple-600 focus:ring-purple-500"
                        />
                        <div>
                          <span className="font-bold text-slate-900 block">{p.label}</span>
                          <span className="text-[10px] text-slate-500">{p.desc}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/20"
                >
                  Save Changes to Database
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}
