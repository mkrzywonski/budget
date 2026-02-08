import { ReactNode, useState, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAccounts } from '../hooks/useAccounts'
import { useCloseBook, useRenameBook, useBackupBook, useRestoreBook, useBackupStatus } from '../hooks/useBook'
import { useTheme } from '../hooks/useTheme'

interface LayoutProps {
  bookName: string
  children: ReactNode
}

export default function Layout({ bookName, children }: LayoutProps) {
  const location = useLocation()
  const { data: accounts } = useAccounts()
  const closeBook = useCloseBook()
  const renameBook = useRenameBook()
  const { isDark, toggle } = useTheme()
  const backup = useBackupBook()
  const restoreBook = useRestoreBook()
  const { data: backupStatus } = useBackupStatus()
  const [showBackupMenu, setShowBackupMenu] = useState(false)
  const [backupDownloading, setBackupDownloading] = useState(false)
  const [restoreError, setRestoreError] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(bookName)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const startEditing = () => {
    setNameValue(bookName)
    setEditingName(true)
    setTimeout(() => nameInputRef.current?.select(), 0)
  }

  const saveName = () => {
    const trimmed = nameValue.trim()
    if (trimmed && trimmed !== bookName) {
      renameBook.mutate(trimmed)
    }
    setEditingName(false)
  }

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveName()
    if (e.key === 'Escape') setEditingName(false)
  }

  const handleBackupDownload = async () => {
    setBackupDownloading(true)
    try {
      await backup.download()
    } finally {
      setBackupDownloading(false)
      setShowBackupMenu(false)
    }
  }

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setRestoreError('')
    try {
      await restoreBook.mutateAsync(file)
      setShowBackupMenu(false)
    } catch (err) {
      setRestoreError((err as Error).message)
    }
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-800 dark:bg-gray-950 text-white flex flex-col">
        <div className="p-4 border-b border-gray-700 dark:border-gray-800">
          <div className="flex items-center gap-1.5">
            {editingName ? (
              <input
                ref={nameInputRef}
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={saveName}
                onKeyDown={handleNameKeyDown}
                className="text-lg font-semibold bg-gray-700 dark:bg-gray-900 text-white rounded px-1 -ml-1 w-full outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
            ) : (
              <>
                <h1 className="text-lg font-semibold truncate">{bookName}</h1>
                <button
                  onClick={startEditing}
                  className="text-gray-500 hover:text-white shrink-0"
                  title="Rename book"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </>
            )}
          </div>
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
          <Link
            to="/budget"
            className={`block px-3 py-2 rounded mb-2 ${
              location.pathname === '/budget'
                ? 'bg-gray-700 dark:bg-gray-900 text-white'
                : 'text-gray-300 hover:bg-gray-700 dark:hover:bg-gray-900'
            }`}
          >
            Budget
          </Link>
          <Link
            to="/search"
            className={`block px-3 py-2 rounded mb-2 ${
              location.pathname === '/search'
                ? 'bg-gray-700 dark:bg-gray-900 text-white'
                : 'text-gray-300 hover:bg-gray-700 dark:hover:bg-gray-900'
            }`}
          >
            Search
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

        <div className="p-4 border-t border-gray-700 dark:border-gray-800 space-y-2">
          <div className="relative">
            <button
              onClick={() => setShowBackupMenu(!showBackupMenu)}
              className="text-sm text-gray-400 hover:text-white flex items-center gap-2 w-full"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Backup / Restore
            </button>
            {showBackupMenu && (
              <div className="absolute bottom-8 left-0 w-56 bg-gray-700 dark:bg-gray-800 border border-gray-600 dark:border-gray-700 rounded-lg shadow-lg p-3 space-y-2 z-20">
                {backupStatus?.last_backup && (
                  <p className="text-xs text-gray-400">
                    Last backup: {new Date(backupStatus.last_backup).toLocaleDateString()}
                  </p>
                )}
                <button
                  onClick={handleBackupDownload}
                  disabled={backupDownloading}
                  className="w-full text-left text-sm text-gray-200 hover:text-white hover:bg-gray-600 dark:hover:bg-gray-700 px-2 py-1.5 rounded disabled:opacity-50"
                >
                  {backupDownloading ? 'Downloading...' : 'Download Backup'}
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={restoreBook.isPending}
                  className="w-full text-left text-sm text-gray-200 hover:text-white hover:bg-gray-600 dark:hover:bg-gray-700 px-2 py-1.5 rounded disabled:opacity-50"
                >
                  {restoreBook.isPending ? 'Restoring...' : 'Restore from Backup'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".db,.sqlite,.sqlite3"
                  onChange={handleRestore}
                  className="hidden"
                />
                {restoreError && (
                  <p className="text-xs text-red-400">{restoreError}</p>
                )}
              </div>
            )}
          </div>
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
