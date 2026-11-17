import useSWR from 'swr';
import { useState, useEffect, useId, useMemo } from 'react';
import Modal from '../components/Modal';
import Select from '../components/Select';
import { Pencil, Trash2, Plus, Users, UserCheck, UserX, Shield, Check, CalendarCheck } from 'lucide-react';
import * as api from '../api/endpoints';
import { notify, messageOf } from '../lib/notify';
import PageHeader from '../components/PageHeader';
import FilterBar, { FilterField } from '../components/filters/FilterBar';
import SearchFilter from '../components/filters/SearchFilter';
import Pagination from '../components/Pagination';
import { useUrlFilters } from '../lib/useUrlFilters';
import {
  USER_CLEAR_KEYS, USER_ROLE_FILTER_OPTIONS, USER_ROLE_OPTIONS, USER_STATUS_OPTIONS, USER_URL_DEFAULTS,
  parseUserValues, userCanClear, userListParams, type UserKey,
} from '../lib/userFilters';

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
  isActive?: boolean;
  /** Slack member ID (U…), typed in by the user on Profile → Slack. */
  slackUserId?: string | null;
}

const ROLE_OPTIONS = USER_ROLE_OPTIONS;
const roleLabel = (role: string) => ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;

export default function UsersPage() {
  const filterId = useId();
  const [urlValues, patchUrl] = useUrlFilters(USER_URL_DEFAULTS);
  const filters = useMemo(() => parseUserValues(urlValues), [urlValues]);
  const canClear = userCanClear(filters);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'staff',
    phone: '',
    birthday: '',
    slackUserId: '',
  });

  const { data, mutate, isLoading } = useSWR(
    ['users', filters.q, filters.role, filters.status, filters.page, filters.size] as const,
    () => api.listUsers(userListParams(filters)),
  );

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name || '',
        email: editing.email || '',
        role: editing.role || 'staff',
        phone: editing.phone || '',
        birthday: editing.birthday ? new Date(editing.birthday).toISOString().slice(0, 10) : '',
        slackUserId: editing.slackUserId || '',
      });
    } else {
      setForm({ name: '', email: '', role: 'staff', phone: '', birthday: '', slackUserId: '' });
    }
  }, [editing]);

  const openAdd = () => { setEditing(null); setError(''); setOpen(true); };
  const openEdit = (user: User) => { setEditing(user); setError(''); setOpen(true); };

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      if (editing) {
        await api.updateUser(editing._id, { ...form, slackUserId: form.slackUserId.trim() || null });
        notify.success(`User "${form.name || form.email}" updated`);
      } else {
        const { slackUserId: _slackUserId, ...fields } = form; // set on edit, once the user exists
        await api.createUser(fields);
        notify.success(`User "${form.name || form.email}" created`);
      }
      await mutate();
      setOpen(false);
    } catch (e) {
      setError(messageOf(e, 'Failed to save user'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;
    try {
      await api.deleteUser(id);
      notify.success('User deleted');
      await mutate();
    } catch (e) {
      notify.error(e, 'Failed to delete user');
    }
  };

  const approve = async (user: User) => {
    if (!confirm(`Approve ${user.name || user.email}? They will be able to log in.`)) return;
    try {
      await api.approveUser(user._id);
      notify.success(`${user.name || user.email} approved`);
      await mutate();
    } catch (e) {
      notify.error(e, 'Failed to approve user');
    }
  };

  const clearFilters = () => {
    patchUrl(Object.fromEntries(USER_CLEAR_KEYS.map((k) => [k, undefined])) as Partial<Record<UserKey, string>>);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800';
      case 'interview_manager': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
      case 'staff': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800';
      default: return 'bg-zinc-100 dark:bg-zinc-800 text-strong border-zinc-200 dark:border-zinc-700';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Shield size={16} aria-hidden />;
      case 'interview_manager': return <CalendarCheck size={16} aria-hidden />;
      case 'staff': return <Users size={16} aria-hidden />;
      default: return <Users size={16} aria-hidden />;
    }
  };

  const users = (data?.users as unknown as User[]) || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        action={
          <button type="button" className="btn" onClick={openAdd}>
            <Plus size={16} className="mr-2" aria-hidden /> Add User
          </button>
        }
      />

      <FilterBar canClear={canClear} onClear={clearFilters}>
        <FilterField label="Role" htmlFor={`${filterId}-role`} width="w-44">
          <Select
            id={`${filterId}-role`}
            className="w-full text-sm"
            value={filters.role}
            onChange={(v) => patchUrl({ role: v })}
            options={USER_ROLE_FILTER_OPTIONS}
          />
        </FilterField>
        <FilterField label="Status" htmlFor={`${filterId}-status`} width="w-44">
          <Select
            id={`${filterId}-status`}
            className="w-full text-sm"
            value={filters.status}
            onChange={(v) => patchUrl({ status: v })}
            options={USER_STATUS_OPTIONS}
          />
        </FilterField>
        <SearchFilter value={filters.q} onChange={(q) => patchUrl({ q })} placeholder="Search users…" />
      </FilterBar>

      {pagination && (
        <div className="text-sm text-muted" role="status">
          {canClear ? (
            <span>Found {pagination.total} user{pagination.total !== 1 ? 's' : ''} matching your criteria</span>
          ) : (
            <span>Showing {pagination.total} user{pagination.total !== 1 ? 's' : ''} total</span>
          )}
        </div>
      )}

      <div className="table-wrap">
        <table className="min-w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-3 font-medium text-strong">User</th>
              <th className="px-4 py-3 font-medium text-strong">Role</th>
              <th className="px-4 py-3 font-medium text-strong">Status</th>
              <th className="px-4 py-3 font-medium text-strong">Slack ID</th>
              <th className="px-4 py-3 font-medium text-strong">Created</th>
              <th className="px-4 py-3 font-medium text-strong w-32">Actions</th>
            </tr>
          </thead>
          <tbody className="row-divider">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  <div role="status" className="flex items-center justify-center">
                    <div className="spinner spinner-md mr-3" aria-hidden></div>
                    Loading users...
                  </div>
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  {canClear ? (
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
                <tr key={user._id} className="table-row transition-colors">
                  <td className="px-4 py-4">
                    <div className="flex items-center">
                      <div className="h-10 w-10 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center mr-3">
                        {user.image ? (
                          <img src={user.image} alt="" className="h-10 w-10 rounded-full object-cover" />
                        ) : (
                          <span className="text-muted font-medium">
                            {user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-strong">{user.name || 'Unnamed User'}</div>
                        <div className="text-muted text-xs">{user.email}</div>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-4">
                    <div className="flex items-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getRoleBadgeColor(user.role)}`}>
                        {getRoleIcon(user.role)}
                        <span className="ml-1">{roleLabel(user.role)}</span>
                      </span>
                    </div>
                  </td>

                  <td className="px-4 py-4">
                    {user.isActive === false ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                        <UserX size={12} aria-hidden />
                        Pending approval
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800">
                        <UserCheck size={12} aria-hidden />
                        Active
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-4 text-sm">
                    {user.slackUserId ? (
                      <span className="font-mono select-all">{user.slackUserId}</span>
                    ) : (
                      <span className="text-muted" title="Not set: Slack messages show their name without a ping">—</span>
                    )}
                  </td>

                  <td className="px-4 py-4 text-muted text-sm">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                  </td>

                  <td className="px-4 py-4">
                    <div className="flex gap-2">
                      {user.isActive === false && (
                        <button
                          className="btn-success btn-sm"
                          onClick={() => approve(user)}
                          title="Approve user — allow login"
                          aria-label={`Approve ${user.name || user.email} — allow login`}
                        >
                          <Check size={14} aria-hidden />
                        </button>
                      )}
                      <button className="btn-icon" onClick={() => openEdit(user)} title="Edit User" aria-label={`Edit ${user.name || user.email}`}>
                        <Pencil size={14} aria-hidden />
                      </button>
                      <button className="btn-icon hover:text-red-600" onClick={() => remove(user._id)} title="Delete User" aria-label={`Delete ${user.name || user.email}`}>
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        info={pagination}
        onPage={(page) => patchUrl({ page: String(page) })}
        pageSize={filters.size}
        onPageSize={(size) => patchUrl({ size: String(size) })}
        label="Users pagination"
      />

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit User' : 'Add New User'}>
        <div className="space-y-4">
          {error && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm dark:bg-red-950/40 dark:border-red-900/50 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2 text-body" htmlFor="user-name">Full Name</label>
            <input
              id="user-name"
              className="input w-full"
              type="text"
              placeholder="Enter full name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-body" htmlFor="user-email">Email Address</label>
            <input
              id="user-email"
              aria-describedby={editing ? 'user-email-note' : undefined}
              className="input w-full"
              type="email"
              placeholder="Enter email address"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={!!editing}
            />
            {editing && (
              <p id="user-email-note" className="text-xs text-muted mt-1">Email address cannot be changed for existing users</p>
            )}
          </div>

          <div>
            <Select
              label="Role"
              value={form.role}
              onChange={(value) => setForm({ ...form, role: value })}
              options={ROLE_OPTIONS}
            />
            {form.role === 'interview_manager' && (
              <p className="text-xs text-muted mt-1">
                Tagged on every caller interview in Slack and can view all interviews.
              </p>
            )}
          </div>

          {editing && (
            <div>
              <label className="block text-sm font-medium mb-2 text-body" htmlFor="user-slack-id">Slack member ID</label>
              <input
                id="user-slack-id"
                className="input w-full font-mono uppercase"
                placeholder="U04ABC12345"
                autoComplete="off"
                spellCheck={false}
                value={form.slackUserId}
                onChange={(e) => setForm({ ...form, slackUserId: e.target.value })}
                aria-describedby="user-slack-id-note"
              />
              <p id="user-slack-id-note" className="text-xs text-muted mt-1">
                In Slack: their profile → <strong>⋮</strong> → <strong>Copy member ID</strong>. Leave blank to clear.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2 text-body" htmlFor="user-phone">Phone Number</label>
            <input
              id="user-phone"
              className="input w-full"
              type="tel"
              placeholder="Enter phone number"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-body" htmlFor="user-birthday">Birthday</label>
            <input
              id="user-birthday"
              className="input w-full"
              type="date"
              value={form.birthday}
              onChange={(e) => setForm({ ...form, birthday: e.target.value })}
            />
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : (editing ? 'Update User' : 'Create User')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
