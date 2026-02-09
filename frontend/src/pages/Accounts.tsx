import { useState, useEffect, useRef } from 'react'
import { useAccounts, useCreateAccount, useUpdateAccount, useDeleteAccount } from '../hooks/useAccounts'
import { useBackupStatus, useBackupBook } from '../hooks/useBook'
import { Account } from '../api/client'
import { Link } from 'react-router-dom'

export default function Accounts() {
  const { data: accounts, isLoading } = useAccounts()
  const createAccount = useCreateAccount()
  const updateAccount = useUpdateAccount()
  const deleteAccount = useDeleteAccount()
  const { data: backupStatus } = useBackupStatus()
  const backup = useBackupBook()

  const [showCreate, setShowCreate] = useState(false)
  const [backupDismissed, setBackupDismissed] = useState(false)
  const [backupDownloading, setBackupDownloading] = useState(false)
  const [name, setName] = useState('')
  const [accountType, setAccountType] = useState('checking')
  const [institution, setInstitution] = useState('')

  const [menuOpenId, setMenuOpenId] = useState<number | null>(null)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)

  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState('')
  const [editInstitution, setEditInstitution] = useState('')
  const [editShowBalance, setEditShowBalance] = useState(true)

  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click
  useEffect(() => {
    if (menuOpenId === null) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpenId])

  // Populate edit form when editingAccount changes
  useEffect(() => {
    if (editingAccount) {
      setEditName(editingAccount.name)
      setEditType(editingAccount.account_type)
      setEditInstitution(editingAccount.institution || '')
      setEditShowBalance(editingAccount.show_running_balance)
    }
  }, [editingAccount])

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) return

    createAccount.mutate(
      { name, account_type: accountType, institution: institution || undefined },
      {
        onSuccess: () => {
          setShowCreate(false)
          setName('')
          setAccountType('checking')
          setInstitution('')
        }
      }
    )
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingAccount || !editName) return

    await updateAccount.mutateAsync({
      id: editingAccount.id,
      name: editName,
      account_type: editType,
      institution: editInstitution || undefined,
      show_running_balance: editShowBalance,
    })
    setEditingAccount(null)
  }

  const handleDelete = (account: Account) => {
    if (window.confirm(`Delete "${account.name}"? This will delete all its transactions and remove linked transfers in other accounts.`)) {
      deleteAccount.mutate(account.id, {
        onSuccess: () => window.location.reload(),
      })
    }
    setMenuOpenId(null)
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-content-secondary">Loading...</div>
      </div>
    )
  }

  const showBackupReminder = !backupDismissed && backupStatus &&
    (backupStatus.days_since_backup === null || backupStatus.days_since_backup > 90)

  const handleBackupDownload = async () => {
    setBackupDownloading(true)
    try {
      await backup.download()
    } finally {
      setBackupDownloading(false)
    }
  }

  return (
    <div className="p-6">
      {showBackupReminder && (
        <div className="mb-4 px-4 py-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg flex items-center justify-between gap-4">
          <span className="text-amber-800 dark:text-amber-200 text-sm">
            {backupStatus.days_since_backup === null
              ? 'This book has never been backed up.'
              : `This book hasn't been backed up in ${backupStatus.days_since_backup} days.`}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleBackupDownload}
              disabled={backupDownloading}
              className="text-sm px-3 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
            >
              {backupDownloading ? 'Downloading...' : 'Download Backup'}
            </button>
            <button
              onClick={() => setBackupDismissed(true)}
              className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 text-lg leading-none"
              title="Dismiss"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Accounts</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Add Account
        </button>
      </div>

      {/* Account Cards */}
      {accounts && accounts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="relative bg-surface rounded-lg shadow hover:shadow-md transition-shadow"
            >
              <Link
                to={`/accounts/${account.id}`}
                className="block p-4"
              >
                <h3 className="font-semibold text-lg pr-8">{account.name}</h3>
                <p className="text-sm text-content-secondary capitalize">{account.account_type}</p>
                {account.institution && (
                  <p className="text-sm text-content-tertiary">{account.institution}</p>
                )}
              </Link>
              <div className="absolute top-2 right-2" ref={menuOpenId === account.id ? menuRef : undefined}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpenId(menuOpenId === account.id ? null : account.id)
                  }}
                  className="p-1 rounded hover:bg-hover text-content-tertiary hover:text-content-secondary"
                >
                  &#8943;
                </button>
                {menuOpenId === account.id && (
                  <div className="absolute right-0 mt-1 bg-surface border border-border rounded shadow-lg py-1 z-10 min-w-[100px]">
                    <button
                      onClick={() => {
                        setEditingAccount(account)
                        setMenuOpenId(null)
                      }}
                      className="block w-full text-left px-4 py-2 text-sm hover:bg-hover"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(account)}
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-hover"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-surface rounded-lg">
          <p className="text-content-secondary mb-4">No accounts yet</p>
          <button
            onClick={() => setShowCreate(true)}
            className="text-blue-600 hover:underline"
          >
            Create your first account
          </button>
        </div>
      )}

      {/* Create Account Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-overlay flex items-center justify-center p-4">
          <div className="bg-surface rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">New Account</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-content mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Checking Account"
                  className="w-full px-3 py-2 border border-input-border rounded bg-input focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1">
                  Type
                </label>
                <select
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                  className="w-full px-3 py-2 border border-input-border rounded bg-input focus:ring-2 focus:ring-blue-500"
                >
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1">
                  Institution (optional)
                </label>
                <input
                  type="text"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="Bank of America"
                  className="w-full px-3 py-2 border border-input-border rounded bg-input focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={createAccount.isPending || !name}
                  className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 border border-border-strong rounded hover:bg-hover"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Account Modal */}
      {editingAccount && (
        <div className="fixed inset-0 bg-overlay flex items-center justify-center p-4">
          <div className="bg-surface rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Edit Account</h2>
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-content mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-input-border rounded bg-input focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1">
                  Type
                </label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  className="w-full px-3 py-2 border border-input-border rounded bg-input focus:ring-2 focus:ring-blue-500"
                >
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1">
                  Institution (optional)
                </label>
                <input
                  type="text"
                  value={editInstitution}
                  onChange={(e) => setEditInstitution(e.target.value)}
                  className="w-full px-3 py-2 border border-input-border rounded bg-input focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editShowBalance}
                  onChange={(e) => setEditShowBalance(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-content">Show running balance in ledger</span>
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={updateAccount.isPending || !editName}
                  className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingAccount(null)}
                  className="px-4 py-2 border border-border-strong rounded hover:bg-hover"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
