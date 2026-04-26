'use client';
import useSWR from 'swr';
import { useState, useEffect, useMemo } from 'react';
import Modal from '@/components/Modal';
import Select from '@/components/Select';
import { Pencil, Trash2, Search, Filter, Plus, Users, UserCheck, UserX, Mail, Phone, Calendar, Shield } from 'lucide-react';

const fetcher = (u: string) => fetch(u).then(r => r.json());

interface User {
  _id: string;
  name?: string;
  email: string;
  role: string;
  phone?: string;
  birthday?: string;
  image?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface PaginationData {
  users: User[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export default function UsersPage() {
  // Search and filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  // Modal state
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'staff',
    phone: '',
    birthday: '',
  });

  // Search loading state
  const [isSearching, setIsSearching] = useState(false);

  // Build API URL with filters and pagination
  const usersUrl = useMemo(() => {
    const qs = new URLSearchParams();
    if (searchTerm) qs.set('search', searchTerm);
    if (roleFilter) qs.set('role', roleFilter);
    if (statusFilter) qs.set('status', statusFilter);
    qs.set('page', currentPage.toString());
    qs.set('limit', pageSize.toString());
    const q = qs.toString();
    return `/api/users?${q}`;
  }, [searchTerm, roleFilter, statusFilter, currentPage, pageSize]);

  const { data, mutate, isLoading } = useSWR<PaginationData>(usersUrl, fetcher);

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm || roleFilter || statusFilter) {
        setIsSearching(true);
        setCurrentPage(1);
        mutate().finally(() => setIsSearching(false));
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm, roleFilter, statusFilter, mutate]);

  // Preload form on edit
  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name || '',
        email: editing.email || '',
        role: editing.role || 'staff',
        phone: editing.phone || '',
        birthday: editing.birthday ? new Date(editing.birthday).toISOString().slice(0, 10) : '',
      });
    } else {
      setForm({
        name: '',
        email: '',
        role: 'staff',
        phone: '',
        birthday: '',
      });
    }
  }, [editing]);

  const openAdd = () => {
    setEditing(null);
    setError('');
    setOpen(true);
  };

  const openEdit = (user: User) => {
    setEditing(user);
    setError('');
    setOpen(true);
  };

  const save = async () => {
    setError('');
    setSaving(true);
    
    try {
      if (editing) {
        // Update existing user
        const res = await fetch(`/api/users/${editing._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || `Request failed (${res.status})`);
        }
      } else {
        // Create new user
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || `Request failed (${res.status})`);
        }
      }
      
      await mutate();
      setOpen(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to save');
      console.error('Save user failed', e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;
    
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await mutate();
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Failed to delete user');
      }
    } catch (error) {
      console.error('Delete user failed:', error);
      alert('Failed to delete user');
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setRoleFilter('');
    setStatusFilter('');
    setCurrentPage(1);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800 border-red-200';
      case 'accountant': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'staff': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Shield size={16} />;
      case 'accountant': return <UserCheck size={16} />;
      case 'staff': return <Users size={16} />;
      default: return <Users size={16} />;
    }
  };

  const users = data?.users || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-600 mt-1">Manage system users, roles, and permissions</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openAdd}>
          <Plus size={16} className="mr-2" />
          Add User
        </button>
      </div>

      {/* Search and Filters */}
      <div className="card">
        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex-1 min-w-64">
            <label className="block text-xs mb-1 text-gray-600">Search Users</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                className="input pl-10 w-full"
                type="text"
                placeholder="Search by name, email, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <div>
            <Select
              label="Role Filter"
              labelClassName="text-xs mb-1 text-gray-600"
              value={roleFilter}
              onChange={setRoleFilter}
              options={[
                { value: '', label: 'All Roles' },
                { value: 'admin', label: 'Admin' },
                { value: 'accountant', label: 'Accountant' },
                { value: 'staff', label: 'Staff' }
              ]}
            />
          </div>
          
          <div>
            <Select
              label="Status"
              labelClassName="text-xs mb-1 text-gray-600"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: '', label: 'All Status' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' }
              ]}
            />
          </div>
          
          <button type="button" className="btn" onClick={clearFilters}>
            Clear Filters
          </button>
          
          {isSearching && (
            <div className="text-sm text-gray-600 flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
              Searching...
            </div>
          )}
        </div>
      </div>

      {/* Results Summary */}
      {pagination && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {searchTerm || roleFilter || statusFilter ? (
              <span>
                Found {pagination.total} user{pagination.total !== 1 ? 's' : ''} matching your criteria
              </span>
            ) : (
              <span>
                Showing {pagination.total} user{pagination.total !== 1 ? 's' : ''} total
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Show:</label>
            <Select
              value={pageSize.toString()}
              onChange={(value) => handlePageSizeChange(Number(value))}
              options={[
                { value: '5', label: '5' },
                { value: '10', label: '10' },
                { value: '20', label: '20' },
                { value: '50', label: '50' }
              ]}
              className="w-20"
            />
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="card p-0 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-900">User</th>
              <th className="px-4 py-3 font-medium text-gray-900">Contact</th>
              <th className="px-4 py-3 font-medium text-gray-900">Role</th>
              <th className="px-4 py-3 font-medium text-gray-900">Status</th>
              <th className="px-4 py-3 font-medium text-gray-900">Created</th>
              <th className="px-4 py-3 font-medium text-gray-900 w-32">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
                    Loading users...
                  </div>
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  {searchTerm || roleFilter || statusFilter ? (
                    <div>
                      <p>No users found matching your search criteria.</p>
                      <p className="text-sm mt-1">Try adjusting your search terms or filters.</p>
                    </div>
                  ) : (
                    <div>
                      <p>No users found.</p>
                      <p className="text-sm mt-1">Get started by adding your first user.</p>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              users.map(user => (
                <tr key={user._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-4">
                    <div className="flex items-center">
                      <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center mr-3">
                        {user.image ? (
                          <img src={user.image} alt={user.name || 'User'} className="h-10 w-10 rounded-full object-cover" />
                        ) : (
                          <span className="text-gray-600 font-medium">
                            {user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{user.name || 'Unnamed User'}</div>
                        <div className="text-gray-500 text-xs">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  
                  <td className="px-4 py-4">
                    <div className="space-y-1">
                      {user.birthday && (
                        <div className="flex items-center text-gray-600">
                          <Calendar size={14} className="mr-2" />
                          <span className="text-sm">{new Date(user.birthday).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </td>
                  
                  <td className="px-4 py-4">
                    <div className="flex items-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getRoleBadgeColor(user.role)}`}>
                        {getRoleIcon(user.role)}
                        <span className="ml-1 capitalize">{user.role}</span>
                      </span>
                    </div>
                  </td>
                  
                  <td className="px-4 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <UserCheck size={12} className="mr-1" />
                      Active
                    </span>
                  </td>
                  
                  <td className="px-4 py-4 text-gray-500 text-sm">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                  </td>
                  
                  <td className="px-4 py-4">
                    <div className="flex gap-2">
                      <button 
                        className="btn btn-sm" 
                        onClick={() => openEdit(user)}
                        title="Edit User"
                      >
                        <Pencil size={14} />
                      </button>
                      <button 
                        className="btn btn-sm btn-danger" 
                        onClick={() => remove(user._id)}
                        title="Delete User"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Page {pagination.page} of {pagination.totalPages}
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-sm"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </button>
            <button
              className="btn btn-sm"
              onClick={() => setCurrentPage(Math.min(pagination.totalPages, currentPage + 1))}
              disabled={currentPage === pagination.totalPages}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit User' : 'Add New User'}
      >
        <div className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
              {error}
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">Full Name</label>
            <input
              className="input w-full"
              type="text"
              placeholder="Enter full name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">Email Address</label>
            <input
              className="input w-full"
              type="email"
              placeholder="Enter email address"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={!!editing} // Email cannot be changed for existing users
            />
            {editing && (
              <p className="text-xs text-gray-500 mt-1">Email address cannot be changed for existing users</p>
            )}
          </div>

          <div>
            <Select
              label="Role"
              value={form.role}
              onChange={(value) => setForm({ ...form, role: value })}
              options={[
                { value: 'staff', label: 'Staff' },
                { value: 'accountant', label: 'Accountant' },
                { value: 'admin', label: 'Admin' }
              ]}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">Phone Number</label>
            <input
              className="input w-full"
              type="tel"
              placeholder="Enter phone number"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">Birthday</label>
            <input
              className="input w-full"
              type="date"
              value={form.birthday}
              onChange={(e) => setForm({ ...form, birthday: e.target.value })}
            />
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t">
            <button
              type="button"
              className="btn"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={save}
              disabled={saving}
            >
              {saving ? 'Saving...' : (editing ? 'Update User' : 'Create User')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
