'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useState } from 'react';

const NavLink = ({ href, label, isCollapsed, icon, badge }: { 
  href: string; 
  label: string; 
  isCollapsed: boolean;
  icon: React.ReactNode;
  badge?: number;
}) => {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link 
      href={href} 
      className={`group relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
        active 
          ? 'bg-primary/10 text-primary font-medium shadow-sm' 
          : 'text-gray-700 hover:bg-gray-50 hover:text-primary'
      } ${isCollapsed ? 'justify-center' : ''}`}
      title={isCollapsed ? label : undefined}
    >
      <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3'}`}>
        <div className={`flex-shrink-0 transition-colors duration-200 ${
          active ? 'text-primary' : 'text-gray-500 group-hover:text-primary'
        }`}>
          {icon}
        </div>
        {!isCollapsed && (
          <span className="flex-1">{label}</span>
        )}
        {!isCollapsed && badge && (
          <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-medium bg-primary text-white rounded-full min-w-[20px]">
            {badge}
          </span>
        )}
      </div>
      
      {/* Active indicator */}
      {active && !isCollapsed && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full"></div>
      )}
    </Link>
  );
};

export default function Sidebar({ isCollapsed, onToggle }: { isCollapsed: boolean; onToggle: () => void }) {
  const { data } = useSession();
  const role = (data?.user as any)?.role;
  
  return (
    <aside className={`fixed top-16 left-0 bottom-0 border-r border-gray-100 bg-white/80 backdrop-blur-md z-30 overflow-y-auto transition-all duration-300 ${
      isCollapsed ? 'w-20' : 'w-64'
    }`}>
      {/* Toggle Button */}
      <div className="p-4 border-b border-gray-100">
        <button
          onClick={onToggle}
          className="w-full p-3 rounded-xl hover:bg-gray-100 transition-all duration-200 flex items-center justify-center group"
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCollapsed ? (
            <svg className="w-5 h-5 text-gray-500 group-hover:text-primary transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-gray-500 group-hover:text-primary transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          )}
        </button>
      </div>
      
      {/* Navigation */}
      <nav className="p-4 space-y-2">
        <div className="mb-4">
          {!isCollapsed && (
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">
              Main
            </h3>
          )}
          
          <NavLink 
            href="/dashboard" 
            label="Dashboard" 
            isCollapsed={isCollapsed}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v6H8V5z" />
              </svg>
            }
          />
          
          <NavLink 
            href="/accounts" 
            label="Accounts" 
            isCollapsed={isCollapsed}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            }
          />
          
          <NavLink 
            href="/transactions" 
            label="Transactions" 
            isCollapsed={isCollapsed}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            }
          />
          
          <NavLink 
            href="/cardlink" 
            label="Card Link" 
            isCollapsed={isCollapsed}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 7a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V7zm0 3h20" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16h.01M11 16h.01" />
              </svg>
            }
          />
          
          <NavLink 
            href="/weekly-plan" 
            label="Weekly Plan" 
            isCollapsed={isCollapsed}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
          />
        </div>

        {/* Admin Section */}
        {role === 'admin' && (
          <div className="mb-4">
            {!isCollapsed && (
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">
                Administration
              </h3>
            )}
            
            <NavLink 
              href="/users" 
              label="Users" 
              isCollapsed={isCollapsed}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              }
            />
            
            {/* <NavLink 
              href="/accountants" 
              label="Accountants" 
              isCollapsed={isCollapsed}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            /> */}
          </div>
        )}

        {/* Quick Actions */}
        {/* <div className="mb-4">
          {!isCollapsed && (
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">
              Quick Actions
            </h3>
          )}
          
          <button className="w-full p-3 rounded-xl bg-primary text-white font-medium hover:bg-primary-dark transition-all duration-200 flex items-center justify-center gap-2 group">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            {!isCollapsed && <span>New Transaction</span>}
          </button>
        </div> */}
      </nav>

      {/* Footer */}
      {!isCollapsed && (
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-100 bg-gray-50/50">
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-2">Need help?</p>
            <button className="text-xs text-primary hover:text-primary-dark font-medium transition-colors duration-200">
              Contact Support
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
