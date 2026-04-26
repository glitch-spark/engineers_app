'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Topbar from '@/components/Topbar';

interface ProfileData {
  username: string;
  email: string;
  image: string;
  birthday: string;
}

interface PasswordData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function ProfilePage() {
  const { data: session, update: updateSession } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  
  const [formData, setFormData] = useState<ProfileData>({
    username: '',
    email: '',
    image: '',
    birthday: ''
  });

  const [passwordData, setPasswordData] = useState<PasswordData>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [originalData, setOriginalData] = useState<ProfileData>({
    username: '',
    email: '',
    image: '',
    birthday: ''
  });

  // Load user data on component mount
  useEffect(() => {
    const loadUserData = async () => {
      if (session?.user) {
        try {
          const response = await fetch('/api/profile');
          if (response.ok) {
            const data = await response.json();
            const userData: ProfileData = {
              username: data.user.username || session.user.name || '',
              email: data.user.email || session.user.email || '',
              image: data.user.image || session.user.image || '',
              birthday: data.user.birthday ? new Date(data.user.birthday).toISOString().slice(0, 10) : ''
            };
            setFormData(userData);
            setOriginalData(userData);
          } else {
            // Fallback to session data if API fails
            const userData: ProfileData = {
              username: session.user.name || '',
              email: session.user.email || '',
              image: session.user.image || '',
              birthday: ''
            };
            setFormData(userData);
            setOriginalData(userData);
          }
        } catch (error) {
          console.error('Failed to load user data:', error);
          // Fallback to session data
          const userData: ProfileData = {
            username: session.user.name || '',
            email: session.user.email || '',
            image: session.user.image || '',
            birthday: ''
          };
          setFormData(userData);
          setOriginalData(userData);
        } finally {
          setIsLoadingData(false);
        }
      }
    };

    loadUserData();
  }, [session]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Profile updated successfully!' });
        setOriginalData(formData);
        setIsEditing(false);
        
        // Update session with new data
        await updateSession({
          ...session,
          user: {
            ...session?.user,
            name: formData.username,
            email: formData.email,
            image: formData.image,
          }
        });
      } else {
        const errorData = await response.json();
        setMessage({ type: 'error', text: errorData.error || 'Failed to update profile' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An unexpected error occurred' });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    // Validate password fields
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      setIsLoading(false);
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setMessage({ type: 'error', text: 'New password must be at least 6 characters long' });
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/profile/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword,
        }),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Password changed successfully!' });
        setPasswordData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
        setIsChangingPassword(false);
      } else {
        const errorData = await response.json();
        setMessage({ type: 'error', text: errorData.error || 'Failed to change password' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An unexpected error occurred' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData(originalData);
    setIsEditing(false);
    setMessage(null);
  };

  const handlePasswordCancel = () => {
    setPasswordData({
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    });
    setIsChangingPassword(false);
    setMessage(null);
  };

  const hasChanges = JSON.stringify(formData) !== JSON.stringify(originalData);

  if (!session) {
    router.push('/login');
    return null;
  }

  if (isLoadingData) {
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Profile Settings</h1>
          <p className="text-gray-600">Loading your profile information...</p>
        </div>
        <div className="card">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 pb-12">
      <Topbar/>
      {/* Header Section */}
      <div className="text-center mt-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Profile Settings</h1>
        <p className="text-gray-600">Manage your account information and preferences</p>
      </div>

      {/* Profile Card */}
      <div className="card mt-4">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Profile Image Section */}
          <div className="flex flex-col items-center lg:items-start space-y-4">
            <div className="relative group">
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-gray-100 shadow-lg">
                {formData.image ? (
                  <Image
                    src={formData.image}
                    alt="Profile"
                    width={128}
                    height={128}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = `https://ui-avatars.com/api/?username=${encodeURIComponent(formData.username)}&size=128&background=2563eb&color=fff`;
                    }}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white text-4xl font-bold">
                    {formData.username ? formData.username.charAt(0).toUpperCase() : 'U'}
                  </div>
                )}
              </div>
              
              {isEditing && (
                <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </div>
              )}
            </div>
            
            {isEditing && (
              <div className="form-group w-full max-w-xs">
                <label htmlFor="image" className="form-label">Profile Image URL</label>
                <input
                  id="image"
                  name="image"
                  type="url"
                  value={formData.image}
                  onChange={handleInputChange}
                  className="input focus-ring"
                  placeholder="https://example.com/image.jpg"
                />
              </div>
            )}
          </div>

          {/* Profile Form Section */}
          <div className="flex-1 space-y-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Username and Email Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="form-group">
                  <label htmlFor="username" className="form-label">Username</label>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    value={formData.username}
                    onChange={handleInputChange}
                    className="input focus-ring"
                    placeholder="Enter your username"
                    disabled={!isEditing}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="email" className="form-label">Email Address</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="input focus-ring"
                    placeholder="Enter your email address"
                    disabled={!isEditing}
                    required
                  />
                </div>
              </div>

              {/* Birthday Field */}
              <div className="form-group">
                <label htmlFor="birthday" className="form-label">Birthday</label>
                <input
                  id="birthday"
                  name="birthday"
                  type="date"
                  value={formData.birthday}
                  onChange={handleInputChange}
                  className="select focus-ring"
                  disabled={!isEditing}
                />
              </div>

              {/* Message Display */}
              {message && (
                <div className={`p-4 rounded-xl border ${
                  message.type === 'success' 
                    ? 'bg-green-50 border-green-200 text-green-800' 
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-1 rounded-full ${
                      message.type === 'success' ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      {message.type === 'success' ? (
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </div>
                    <span className="text-sm font-medium">{message.text}</span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                {!isEditing ? (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="btn"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    Edit Profile
                  </button>
                ) : (
                  <>
                    <button
                      type="submit"
                      className="btn"
                      disabled={isLoading || !hasChanges}
                    >
                      {isLoading ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Saving...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Save Changes
                        </>
                      )}
                    </button>
                    
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="btn-secondary"
                      disabled={isLoading}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Password Change Card */}
      <div className="card mt-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="card-header mb-0">Change Password</h3>
            <p className="text-gray-600">Update your account password for enhanced security</p>
          </div>
          {!isChangingPassword && (
            <button
              type="button"
              onClick={() => setIsChangingPassword(true)}
              className="btn-outline"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              Change Password
            </button>
          )}
        </div>

        {isChangingPassword && (
          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="form-group">
                <label htmlFor="currentPassword" className="form-label">Current Password</label>
                <input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  value={passwordData.currentPassword}
                  onChange={handlePasswordChange}
                  className="input focus-ring"
                  placeholder="Enter your current password"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="form-group">
                <label htmlFor="newPassword" className="form-label">New Password</label>
                <input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  value={passwordData.newPassword}
                  onChange={handlePasswordChange}
                  className="input focus-ring"
                  placeholder="Enter your new password"
                  minLength={6}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword" className="form-label">Confirm New Password</label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={handlePasswordChange}
                  className="input focus-ring"
                  placeholder="Confirm your new password"
                  minLength={6}
                  required
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <button
                type="submit"
                className="btn"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Changing Password...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Change Password
                  </>
                )}
              </button>
              
              <button
                type="button"
                onClick={handlePasswordCancel}
                className="btn-secondary"
                disabled={isLoading}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Account Information Card */}
      <div className="card mt-4">
        <h3 className="card-header">Account Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-600">Account Type</p>
            <p className="text-gray-900">Standard Account</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-600">Member Since</p>
            <p className="text-gray-900">
              {session.user?.email ? new Date().toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              }) : 'N/A'}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-600">Last Login</p>
            <p className="text-gray-900">
              {new Date().toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-600">Status</p>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              Active
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
