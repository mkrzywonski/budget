import { useState } from 'react'
import { useAccounts, useCreateAccount } from '../hooks/useAccounts'
import { Link } from 'react-router-dom'

export default function Dashboard() {
  const { data: accounts, isLoading } = useAccounts()
  const createAccount = useCreateAccount()

  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [accountType, setAccountType] = useState('checking')
  const [institution, setInstitution] = useState('')

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

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
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
            <Link
              key={account.id}
              to={`/accounts/${account.id}`}
              className="block bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
            >
              <h3 className="font-semibold text-lg">{account.name}</h3>
              <p className="text-sm text-gray-500 capitalize">{account.account_type}</p>
              {account.institution && (
                <p className="text-sm text-gray-400">{account.institution}</p>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-lg">
          <p className="text-gray-500 mb-4">No accounts yet</p>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">New Account</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Checking Account"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type
                </label>
                <select
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                >
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="cash">Cash</option>
                  <option value="investment">Investment</option>
                  <option value="loan">Loan</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Institution (optional)
                </label>
                <input
                  type="text"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="Bank of America"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
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
                  className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
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
