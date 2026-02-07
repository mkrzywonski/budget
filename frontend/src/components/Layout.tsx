import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAccounts } from '../hooks/useAccounts'
import { useCloseBook } from '../hooks/useBook'
import { useTheme } from '../hooks/useTheme'

interface LayoutProps {
  bookName: string
  children: ReactNode
}

export default function Layout({ bookName, children }: LayoutProps) {
  const location = useLocation()
  const { data: accounts } = useAccounts()
  const closeBook = useCloseBook()
  const { isDark, toggle } = useTheme()

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-800 dark:bg-gray-950 text-white flex flex-col">
        <div className="p-4 border-b border-gray-700 dark:border-gray-800">
          <h1 className="text-lg font-semibold">{bookName}</h1>
          <button
            onClick={() => closeBook.mutate()}
            className="text-sm text-gray-400 hover:text-white mt-1"
          >
            Switch Book
          </button>
        </div>

        <nav className="flex-1 p-4">
          <Link
            to="/"
            className={`block px-3 py-2 rounded mb-2 ${
              location.pathname === '/'
                ? 'bg-gray-700 dark:bg-gray-900 text-white'
                : 'text-gray-300 hover:bg-gray-700 dark:hover:bg-gray-900'
            }`}
          >
            Dashboard
          </Link>
          <Link
            to="/reports"
            className={`block px-3 py-2 rounded mb-2 ${
              location.pathname === '/reports'
                ? 'bg-gray-700 dark:bg-gray-900 text-white'
                : 'text-gray-300 hover:bg-gray-700 dark:hover:bg-gray-900'
            }`}
          >
            Reports
          </Link>

          <div className="mt-4">
            <h2 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Accounts
            </h2>
            <div className="mt-2 space-y-1">
              {accounts?.map((account) => (
                <Link
                  key={account.id}
                  to={`/accounts/${account.id}`}
                  className={`block px-3 py-2 rounded ${
                    location.pathname === `/accounts/${account.id}`
                      ? 'bg-gray-700 dark:bg-gray-900 text-white'
                      : 'text-gray-300 hover:bg-gray-700 dark:hover:bg-gray-900'
                  }`}
                >
                  {account.name}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <h2 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Manage
            </h2>
            <div className="mt-2 space-y-1">
              <Link
                to="/payees"
                className={`block px-3 py-2 rounded ${
                  location.pathname === '/payees'
                    ? 'bg-gray-700 dark:bg-gray-900 text-white'
                    : 'text-gray-300 hover:bg-gray-700 dark:hover:bg-gray-900'
                }`}
              >
                Payee Rules
              </Link>
              <Link
                to="/categories"
                className={`block px-3 py-2 rounded ${
                  location.pathname === '/categories'
                    ? 'bg-gray-700 dark:bg-gray-900 text-white'
                    : 'text-gray-300 hover:bg-gray-700 dark:hover:bg-gray-900'
                }`}
              >
                Categories
              </Link>
            </div>
          </div>
        </nav>

        <div className="p-4 border-t border-gray-700 dark:border-gray-800">
          <button
            onClick={toggle}
            className="text-sm text-gray-400 hover:text-white flex items-center gap-2"
          >
            {isDark ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
            {isDark ? 'Light Mode' : 'Dark Mode'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
