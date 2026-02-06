import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAccounts } from '../hooks/useAccounts'
import { useCloseBook } from '../hooks/useBook'

interface LayoutProps {
  bookName: string
  children: ReactNode
}

export default function Layout({ bookName, children }: LayoutProps) {
  const location = useLocation()
  const { data: accounts } = useAccounts()
  const closeBook = useCloseBook()

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-800 text-white flex flex-col">
        <div className="p-4 border-b border-gray-700">
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
                ? 'bg-gray-700 text-white'
                : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            Dashboard
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
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-300 hover:bg-gray-700'
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
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                Payees
              </Link>
              <Link
                to="/categories"
                className={`block px-3 py-2 rounded ${
                  location.pathname === '/categories'
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                Categories
              </Link>
            </div>
          </div>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
