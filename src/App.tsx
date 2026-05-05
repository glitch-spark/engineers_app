import { Routes, Route, Navigate } from 'react-router-dom';
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
import CardLink from './pages/CardLink';
import WeeklyPlan from './pages/WeeklyPlan';
import Users from './pages/Users';
import Profile from './pages/Profile';
import Accountants from './pages/Accountants';
import Interviews from './pages/Interviews';
import InterviewDetail from './pages/InterviewDetail';
import InterviewReview from './pages/InterviewReview';
import Resume from './pages/Resume';
import Generated from './pages/Generated';
import ResumeStyles from './pages/ResumeStyles';
import AccountResumeSettings from './pages/AccountResumeSettings';
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

export default function App() {
  return (
    <>
      <Toaster position="top-center" gutter={8} />
      <Routes>
        <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/accounts" element={<Protected><Accounts /></Protected>} />
      <Route path="/accounts/new" element={<Protected><AccountEdit /></Protected>} />
      <Route path="/accounts/:id" element={<Protected><AccountEdit /></Protected>} />
      <Route path="/accounts/:id/resume-settings" element={<Protected><AccountResumeSettings /></Protected>} />
      <Route path="/transactions" element={<Protected><Transactions /></Protected>} />
      <Route path="/cardlink" element={<Protected><CardLink /></Protected>} />
      <Route path="/weekly-plan" element={<Protected><WeeklyPlan /></Protected>} />
      <Route path="/interviews" element={<Protected><Interviews /></Protected>} />
      <Route path="/interviews/:id" element={<Protected><InterviewDetail /></Protected>} />
      <Route path="/interviews/:id/review" element={<Protected><InterviewReview /></Protected>} />
      <Route path="/resume" element={<Protected><Resume /></Protected>} />
      <Route path="/resume/generated" element={<Protected><Generated /></Protected>} />
      <Route path="/resume/styles" element={<Protected><ResumeStyles /></Protected>} />
      <Route path="/preferences" element={<Protected><Preferences /></Protected>} />
      <Route path="/users" element={<Protected><Users /></Protected>} />
      <Route path="/profile" element={<Protected><Profile /></Protected>} />
      <Route path="/accountants" element={<Protected><Accountants /></Protected>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
