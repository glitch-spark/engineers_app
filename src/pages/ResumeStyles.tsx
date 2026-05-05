import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Link } from 'react-router-dom';
import Select from '../components/Select';
import ResumeTabs from '../components/ResumeTabs';
import ResumeStylingEditor from '../components/ResumeStylingEditor';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/endpoints';

export default function ResumeStylesPage() {
  const { user } = useAuth();
  const { data: accountsData, isLoading } = useSWR(
    'styles-accounts-lookup',
    () => api.lookupAccounts()
  );

  const accounts = useMemo(() => {
    const all = accountsData?.accounts ?? [];
    return all.filter((a) => a.createdBy && user?.id && a.createdBy === user.id);
  }, [accountsData, user?.id]);

  const [accountId, setAccountId] = useState('');

  const options = useMemo(
    () =>
      accounts.map((a) => ({
        value: a._id,
        label: `${a.name}${a.label ? ` — ${a.label}` : ''}`,
      })),
    [accounts]
  );

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Resume styles &amp; preview</h1>
        <p className="text-sm text-gray-500 mt-1">
          Author the styling spec per profile. Generated PDFs follow what you save here.
        </p>
      </header>
      <ResumeTabs />

      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading profiles...</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-gray-500">
            You don't own any profiles yet.{' '}
            <Link to="/accounts" className="font-medium underline text-primary">Create one</Link> first.
          </p>
        ) : (
          <Select
            label="Profile"
            value={accountId}
            onChange={setAccountId}
            placeholder="Select a profile"
            options={options}
          />
        )}
      </div>

      {accountId && <ResumeStylingEditor accountId={accountId} />}
    </div>
  );
}
