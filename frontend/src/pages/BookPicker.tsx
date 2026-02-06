import { useState } from 'react'
import { useRecentBooks, useOpenBook, useCreateBook } from '../hooks/useBook'

export default function BookPicker() {
  const { data: recentBooks, isLoading } = useRecentBooks()
  const openBook = useOpenBook()
  const createBook = useCreateBook()

  const [showCreate, setShowCreate] = useState(false)
  const [newPath, setNewPath] = useState('')
  const [newName, setNewName] = useState('')

  const handleOpen = (path: string, name: string) => {
    openBook.mutate({ path, name })
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPath) return

    const path = newPath.endsWith('.db') ? newPath : `${newPath}.db`
    createBook.mutate({ path, name: newName || undefined })
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Personal Finance Ledger
        </h1>

        {/* Recent Books */}
        {!isLoading && recentBooks && recentBooks.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">
              Recent Books
            </h2>
            <div className="space-y-2">
              {recentBooks.map((book) => (
                <button
                  key={book.path}
                  onClick={() => handleOpen(book.path, book.name)}
                  disabled={openBook.isPending}
                  className="w-full text-left px-4 py-3 rounded border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-colors"
                >
                  <div className="font-medium text-gray-900">{book.name}</div>
                  <div className="text-sm text-gray-500 truncate">{book.path}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Create New */}
        {showCreate ? (
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                File Path
              </label>
              <input
                type="text"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="/home/user/budget.db"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Display Name (optional)
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="My Budget"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
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
          <button
            onClick={() => setShowCreate(true)}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
          >
            Create New Book
          </button>
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
