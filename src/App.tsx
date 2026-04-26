import { Routes, Route } from 'react-router-dom';
import { AuthGuard } from './auth/AuthGuard';
import { RoleGuard } from './auth/RoleGuard';
import AppShell from './components/AppShell';
import Home from './pages/Home';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import Accounts from './pages/Accounts';
import Transactions from './pages/Transactions';
import CardLink from './pages/CardLink';
import WeeklyPlan from './pages/WeeklyPlan';
import Users from './pages/Users';
import Accountants from './pages/Accountants';

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
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/profile" element={<Protected><Profile /></Protected>} />
      <Route path="/accounts" element={<Protected><Accounts /></Protected>} />
      <Route path="/transactions" element={<Protected><Transactions /></Protected>} />
      <Route path="/cardlink" element={<Protected><CardLink /></Protected>} />
      <Route path="/weekly-plan" element={<Protected><WeeklyPlan /></Protected>} />
      <Route path="/users" element={<Protected><Users /></Protected>} />
      <Route path="/accountants" element={<Protected><Accountants /></Protected>} />
    </Routes>
  );
}
