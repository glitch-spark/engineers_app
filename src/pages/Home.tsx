import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

export default function Home() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!ready) return;
    if (user) navigate('/dashboard', { replace: true });
  }, [user, ready, navigate]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Welcome to Engineer Dashboard</h1>
        <p className="text-gray-600 mb-6">Please login to continue</p>
        <div className="space-x-4">
          <Link to="/login" className="btn">Login</Link>
          <Link to="/register" className="btn">Register</Link>
        </div>
      </div>
    </div>
  );
}
