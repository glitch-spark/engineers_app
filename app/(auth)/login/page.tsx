'use client';
import { FormEvent, useState } from 'react';
import { signIn } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password');
      setIsLoading(false);
      return;
    }

    try {
      const result = await signIn('credentials', {
        username, 
        password, 
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid username or password. Please try again.');
      } else if (result?.ok) {
        if (typeof window !== "undefined") {
          window.location.href = '/dashboard';
        }

      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo and Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            {/* <Image 
              src="/logo-engineers.svg" 
              alt="Engineers" 
              width={200} 
              height={50} 
              priority 
              className="h-12 w-auto"
            /> */}
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome back</h1>
          <p className="text-gray-600">Sign in to your account to continue</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-3xl shadow-strong p-8 border border-gray-100">
          <form onSubmit={submit} className="space-y-6">
            <div className="form-group">
              <label htmlFor="username" className="form-label">Username or Email</label>
              <input 
                id="username"
                className="input focus-ring" 
                placeholder="Enter your username or email" 
                type="text"
                value={username} 
                onChange={e => setUsername(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password" className="form-label">Password</label>
              <input 
                id="password"
                className="input focus-ring" 
                placeholder="Enter your password" 
                type="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="p-1 bg-red-100 rounded-full">
                    <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <p className="text-red-700 text-sm font-medium">{error}</p>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button 
              type="submit" 
              className={`w-full btn ${isLoading ? 'opacity-75 cursor-not-allowed' : ''}`}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  Sign In
                </>
              )}
            </button>

            {/* Forgot Password */}
            <div className="text-center">
              <button type="button" className="text-sm text-primary hover:text-primary-dark font-medium transition-colors duration-200">
                Forgot your password?
              </button>
            </div>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">New to Engineer?</span>
            </div>
          </div>

          {/* Register Link */}
          <div className="text-center">
            <Link 
              href="/register" 
              className="btn-outline w-full"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Create an account
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-xs text-gray-500">
            By signing in, you agree to our{' '}
            <a href="#" className="text-primary hover:text-primary-dark transition-colors duration-200">Terms of Service</a>
            {' '}and{' '}
            <a href="#" className="text-primary hover:text-primary-dark transition-colors duration-200">Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  );
}
