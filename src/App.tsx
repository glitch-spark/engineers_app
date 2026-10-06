import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthGuard } from './auth/AuthGuard';
import { RoleGuard } from './auth/RoleGuard';
import AppShell from './components/AppShell';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Transactions from './pages/Transactions';
import Report from './pages/Report';
import Users from './pages/Users';
import Profile from './pages/Profile';
import Accountants from './pages/Accountants';
import InterviewsPage from './pages/interviews/InterviewsPage';
import InterviewsAnalyze from './pages/InterviewsAnalyze';
import InterviewFocus from './pages/InterviewFocus';
import InterviewReview from './pages/InterviewReview';
import Resume from './pages/Resume';
import InterviewPrep from './pages/InterviewPrep';
import Generated from './pages/Generated';
import JobApplies from './pages/JobApplies';
import Bidders from './pages/Bidders';
import BidReview from './pages/BidReview';
import JobApplyRun from './pages/JobApplyRun';
import Pipeline from './pages/Pipeline';
import Integrations from './pages/Integrations';
import AccountEdit from './pages/AccountEdit';
import Preferences from './pages/Preferences';

function Protected({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <RoleGuard>
        <AppShell>{children}</AppShell>
      </RoleGuard>
    </AuthGuard>
  );
}

/** Full-screen pages: auth + role checks without the sidebar/topbar chrome. */
function Standalone({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <RoleGuard>{children}</RoleGuard>
    </AuthGuard>
  );
}

function LegacyInterviewRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/interview/${id}`} replace />;
}

export default function App() {
  return (
    <>
      <Toaster
        position="top-center"
        gutter={8}
        toastOptions={{
          className: '!rounded-xl !border !border-zinc-200 !bg-white !text-sm !text-zinc-800 !shadow-modal dark:!border-zinc-700 dark:!bg-zinc-900 dark:!text-zinc-100',
          success: { iconTheme: { primary: '#18181b', secondary: '#fafafa' } },
          error: { iconTheme: { primary: '#dc2626', secondary: '#fafafa' } },
        }}
      />
      <Routes>
        <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      {/* Leaderboard is hidden for now; old links land on the Dashboard. */}
      <Route path="/leaderboard" element={<Navigate to="/dashboard" replace />} />
      <Route path="/accounts" element={<Protected><Accounts /></Protected>} />
      <Route path="/accounts/new" element={<Protected><AccountEdit /></Protected>} />
      <Route path="/accounts/:id" element={<Protected><AccountEdit /></Protected>} />
      <Route path="/transactions" element={<Protected><Transactions /></Protected>} />
      <Route path="/report" element={<Protected><Report /></Protected>} />
      <Route path="/weekly-plan" element={<Navigate to="/report" replace />} />
      <Route path="/interviews" element={<Protected><InterviewsPage view="list" /></Protected>} />
      <Route path="/interviews/calendar" element={<Protected><InterviewsPage view="calendar" /></Protected>} />
      <Route path="/interviews/live" element={<Navigate to="/interviews/calendar" replace />} />
      <Route path="/interviews/analyze" element={<Protected><InterviewsAnalyze /></Protected>} />
      <Route path="/interviews/:id" element={<LegacyInterviewRedirect />} />
      <Route path="/interview/:id" element={<Standalone><InterviewFocus /></Standalone>} />
      <Route path="/interviews/:id/review" element={<Protected><InterviewReview /></Protected>} />
      <Route path="/resume" element={<Protected><Resume /></Protected>} />
      <Route path="/resume/generated" element={<Protected><Generated /></Protected>} />
      <Route path="/job-applies" element={<Protected><JobApplies /></Protected>} />
      <Route path="/job-applies/:runId" element={<Protected><JobApplyRun /></Protected>} />
      <Route path="/bidders" element={<Protected><Bidders /></Protected>} />
      <Route path="/bids/review" element={<Protected><BidReview /></Protected>} />
      <Route path="/interview-prep" element={<Protected><InterviewPrep /></Protected>} />
      <Route path="/pipeline" element={<Protected><Pipeline /></Protected>} />
      <Route path="/integrations" element={<Protected><Integrations /></Protected>} />
      <Route path="/preferences" element={<Protected><Preferences /></Protected>} />
      <Route path="/users" element={<Protected><Users /></Protected>} />
      <Route path="/profile" element={<Protected><Profile /></Protected>} />
      <Route path="/accountants" element={<Protected><Accountants /></Protected>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
