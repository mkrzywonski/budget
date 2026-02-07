import { useState } from 'react'
import { useRecentBooks, useOpenBook, useCreateBook } from '../hooks/useBook'

export default function BookPicker() {
  const { data: recentBooks, isLoading } = useRecentBooks()
  const openBook = useOpenBook()
  const createBook = useCreateBook()

  const [showForm, setShowForm] = useState<'open' | 'create' | null>(null)
  const [newPath, setNewPath] = useState('')
  const [newName, setNewName] = useState('')

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
              <input
                type="text"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="/home/user/budget.db"
                className="w-full px-3 py-2 border border-input-border rounded bg-input focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
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
              <input
                type="text"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="/home/user/budget.db"
                className="w-full px-3 py-2 border border-input-border rounded bg-input focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
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
    </div>
  )
}
