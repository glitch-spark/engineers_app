'use client';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-gray-100 mt-auto">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Company Info */}
          <div className="col-span-1 md:col-span-2">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Engineer Financial Management</h3>
            <p className="text-gray-600 text-sm leading-relaxed mb-4">
              Streamlining financial operations with modern technology and intuitive design. 
              Manage your accounts, transactions, and financial data with ease.
            </p>
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-sm text-gray-500">Powered by Next.js & Tailwind CSS</span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <a href="/dashboard" className="text-sm text-gray-600 hover:text-primary transition-colors duration-200">
                  Dashboard
                </a>
              </li>
              <li>
                <a href="/accounts" className="text-sm text-gray-600 hover:text-primary transition-colors duration-200">
                  Accounts
                </a>
              </li>
              <li>
                <a href="/transactions" className="text-sm text-gray-600 hover:text-primary transition-colors duration-200">
                  Transactions
                </a>
              </li>
              <li>
                <a href="/cardlink" className="text-sm text-gray-600 hover:text-primary transition-colors duration-200">
                  Card Link
                </a>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Support</h4>
            <ul className="space-y-2">
              <li>
                <a href="/profile" className="text-sm text-gray-600 hover:text-primary transition-colors duration-200">
                  Profile Settings
                </a>
              </li>
              <li>
                <button className="text-sm text-gray-600 hover:text-primary transition-colors duration-200 text-left">
                  Contact Support
                </button>
              </li>
              <li>
                <button className="text-sm text-gray-600 hover:text-primary transition-colors duration-200 text-left">
                  Documentation
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-100 mt-8 pt-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-gray-500">
              © {currentYear} Engineer Financial Management. All rights reserved.
            </p>
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <a href="#" className="hover:text-primary transition-colors duration-200">Privacy Policy</a>
              <a href="#" className="hover:text-primary transition-colors duration-200">Terms of Service</a>
              <span>v1.0.0</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
