import { useState } from 'react'
import { useRecentBooks, useOpenBook, useCreateBook } from '../hooks/useBook'
import { api } from '../api/client'

interface BrowseEntry {
  name: string
  path: string
  is_dir: boolean
}

export default function BookPicker() {
  const { data: recentBooks, isLoading } = useRecentBooks()
  const openBook = useOpenBook()
  const createBook = useCreateBook()

  const [showForm, setShowForm] = useState<'open' | 'create' | null>(null)
  const [newPath, setNewPath] = useState('')
  const [newName, setNewName] = useState('')
  const [showBrowser, setShowBrowser] = useState(false)
  const [browseDir, setBrowseDir] = useState('~')
  const [browseEntries, setBrowseEntries] = useState<BrowseEntry[]>([])
  const [browseLoading, setBrowseLoading] = useState(false)
  const [browseError, setBrowseError] = useState('')

  const handleOpen = (path: string, name: string) => {
    openBook.mutate({ path, name })
  }

  const handleOpenExisting = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPath) return
    openBook.mutate({ path: newPath })
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPath) return

    const path = newPath.endsWith('.db') ? newPath : `${newPath}.db`
    createBook.mutate({ path, name: newName || undefined })
  }

  const closeForm = () => {
    setShowForm(null)
    setNewPath('')
    setNewName('')
  }

  // Browse filesystem
  const loadDir = async (dir: string) => {
    setBrowseLoading(true)
    setBrowseError('')
    try {
      const entries = await api.get<BrowseEntry[]>(`/books/browse?dir=${encodeURIComponent(dir)}`)
      setBrowseEntries(entries)
      setBrowseDir(dir)
    } catch (e) {
      setBrowseError((e as Error).message)
    } finally {
      setBrowseLoading(false)
    }
  }

  const goUp = async () => {
    const resp = await api.get<{ path: string }>(`/books/browse/parent?dir=${encodeURIComponent(browseDir)}`)
    loadDir(resp.path)
  }

  const openBrowser = () => {
    setShowBrowser(true)
    loadDir('~')
  }

  const selectFile = (path: string) => {
    setNewPath(path)
    setShowBrowser(false)
  }

  return (
    <div className="min-h-screen bg-surface-secondary flex items-center justify-center p-4">
      <div className="bg-surface rounded-lg shadow-lg max-w-md w-full p-6">
        <h1 className="text-2xl font-bold text-content mb-6">
          Personal Finance Ledger
        </h1>

        {/* Recent Books */}
        {!isLoading && recentBooks && recentBooks.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-content mb-2">
              Recent Books
            </h2>
            <div className="space-y-2">
              {recentBooks.map((book) => (
                <button
                  key={book.path}
                  onClick={() => handleOpen(book.path, book.name)}
                  disabled={openBook.isPending}
                  className="w-full text-left px-4 py-3 rounded border border-border hover:border-blue-500 hover:bg-blue-50 transition-colors"
                >
                  <div className="font-medium text-content">{book.name}</div>
                  <div className="text-sm text-content-secondary truncate">{book.path}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Open / Create Forms */}
        {showForm === 'open' ? (
          <form onSubmit={handleOpenExisting} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-content mb-1">
                File Path
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  placeholder="/home/user/budget.db"
                  className="flex-1 px-3 py-2 border border-input-border rounded bg-input focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={openBrowser}
                  className="px-3 py-2 border border-border-strong rounded hover:bg-hover text-sm"
                  title="Browse..."
                >
                  Browse
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={openBook.isPending || !newPath}
                className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {openBook.isPending ? 'Opening...' : 'Open'}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="px-4 py-2 border border-border-strong rounded hover:bg-hover"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : showForm === 'create' ? (
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-content mb-1">
                File Path
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  placeholder="/home/user/budget.db"
                  className="flex-1 px-3 py-2 border border-input-border rounded bg-input focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={openBrowser}
                  className="px-3 py-2 border border-border-strong rounded hover:bg-hover text-sm"
                  title="Browse..."
                >
                  Browse
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-content mb-1">
                Display Name (optional)
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="My Budget"
                className="w-full px-3 py-2 border border-input-border rounded bg-input focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createBook.isPending || !newPath}
                className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {createBook.isPending ? 'Creating...' : 'Create'}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="px-4 py-2 border border-border-strong rounded hover:bg-hover"
              >
                Cancel
              </button>
            </div>
            {createBook.isError && (
              <p className="text-red-600 text-sm">
                {(createBook.error as Error).message}
              </p>
            )}
          </form>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setShowForm('open')}
              className="flex-1 py-2 rounded border border-border-strong hover:bg-hover font-medium"
            >
              Open Existing
            </button>
            <button
              onClick={() => setShowForm('create')}
              className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
            >
              Create New
            </button>
          </div>
        )}

        {openBook.isError && (
          <p className="mt-4 text-red-600 text-sm">
            {(openBook.error as Error).message}
          </p>
        )}
      </div>

      {/* File Browser Modal */}
      {showBrowser && (
        <div className="fixed inset-0 bg-overlay flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-lg w-full max-h-[80vh] flex flex-col">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-content">Browse Files</h3>
              <button
                onClick={() => setShowBrowser(false)}
                className="text-content-tertiary hover:text-content-secondary text-xl"
              >
                ×
              </button>
            </div>

            <div className="px-4 py-2 border-b border-border text-sm text-content-secondary truncate bg-surface-secondary">
              {browseDir}
            </div>

            <div className="flex-1 overflow-auto">
              {browseLoading ? (
                <div className="p-4 text-content-secondary text-sm">Loading...</div>
              ) : browseError ? (
                <div className="p-4 text-red-600 text-sm">{browseError}</div>
              ) : (
                <div className="divide-y divide-border">
                  <button
                    onClick={goUp}
                    className="w-full text-left px-4 py-2 hover:bg-hover text-sm flex items-center gap-2"
                  >
                    <span className="text-content-tertiary">📁</span>
                    <span className="text-content-secondary">..</span>
                  </button>
                  {browseEntries.map((entry) => (
                    <button
                      key={entry.path}
                      onClick={() => entry.is_dir ? loadDir(entry.path) : selectFile(entry.path)}
                      className="w-full text-left px-4 py-2 hover:bg-hover text-sm flex items-center gap-2"
                    >
                      <span className="text-content-tertiary">{entry.is_dir ? '📁' : '📄'}</span>
                      <span className={entry.is_dir ? 'text-content' : 'text-blue-600 font-medium'}>
                        {entry.name}
                      </span>
                    </button>
                  ))}
                  {browseEntries.length === 0 && (
                    <div className="px-4 py-3 text-sm text-content-tertiary">
                      No .db files or subdirectories
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-border">
              <button
                onClick={() => setShowBrowser(false)}
                className="w-full px-4 py-2 border border-border-strong rounded hover:bg-hover text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
