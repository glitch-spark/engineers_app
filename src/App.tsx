import { Routes, Route } from 'react-router-dom';
import { AuthGuard } from './auth/AuthGuard';
import { RoleGuard } from './auth/RoleGuard';
import AppShell from './components/AppShell';
import Home from './pages/Home';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import Accounts from './pages/Accounts';

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
    </Routes>
  );
}
