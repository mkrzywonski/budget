import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  usePayees,
  useCreatePayee,
  useUpdatePayee,
  useDeletePayee,
  useRematchPayees,
  usePayeeMatches,
  usePreviewPayeeMatches
} from '../hooks/usePayees'
import { Payee, MatchPattern } from '../api/client'

const MATCH_TYPES = [
  { value: 'starts_with', label: 'Starts with' },
  { value: 'contains', label: 'Contains' },
  { value: 'exact', label: 'Exact' },
  { value: 'regex', label: 'Regex' }
] as const

const EMPTY_PATTERN: MatchPattern = { type: 'starts_with', pattern: '' }

export default function Payees() {
  const location = useLocation()
  const navigate = useNavigate()
  const { data: payees, isLoading } = usePayees()
  const createMutation = useCreatePayee()
  const updateMutation = useUpdatePayee()
  const deleteMutation = useDeletePayee()
  const rematchMutation = useRematchPayees()

  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [rematchResult, setRematchResult] = useState<number | null>(null)

  useEffect(() => {
    const state = location.state as { editPayeeId?: number } | null
    if (state?.editPayeeId) {
      setEditingId(state.editPayeeId)
      setShowAdd(false)
      navigate('/payees', { replace: true, state: {} })
    }
  }, [location.state, navigate])

  const handleRematch = async () => {
    const result = await rematchMutation.mutateAsync()
    setRematchResult(result.updated_count)
    setTimeout(() => setRematchResult(null), 5000)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-semibold">Payees</h1>
          <div className="flex items-center gap-3">
            {rematchResult !== null && (
              <span className="text-sm text-green-600">
                Updated {rematchResult} transaction{rematchResult !== 1 ? 's' : ''}
              </span>
            )}
            <button
              onClick={handleRematch}
              disabled={rematchMutation.isPending}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            >
              {rematchMutation.isPending ? 'Matching...' : 'Re-match All Transactions'}
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Add Payee
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="text-gray-500">Loading payees...</div>
        ) : (
          <div className="space-y-3">
            {showAdd && (
              <PayeeForm
                onSave={async (name, patterns) => {
                  await createMutation.mutateAsync({ name, match_patterns: patterns })
                  setShowAdd(false)
                }}
                onCancel={() => setShowAdd(false)}
                isSaving={createMutation.isPending}
              />
            )}

            {(!payees || payees.length === 0) && !showAdd && (
              <div className="text-center py-12 text-gray-500">
                No payees defined yet. Add one to start matching transaction names.
              </div>
            )}

            {payees?.map((payee) =>
              editingId === payee.id ? (
                <PayeeForm
                  key={payee.id}
                  payee={payee}
                  onSave={async (name, patterns) => {
                    await updateMutation.mutateAsync({
                      id: payee.id,
                      name,
                      match_patterns: patterns
                    })
                    setEditingId(null)
                  }}
                  onCancel={() => setEditingId(null)}
                  isSaving={updateMutation.isPending}
                />
              ) : (
                <PayeeCard
                  key={payee.id}
                  payee={payee}
                  onEdit={() => setEditingId(payee.id)}
                  onDelete={() => deleteMutation.mutate(payee.id)}
                />
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// --- Read-only payee card ---

function PayeeCard({
  payee,
  onEdit,
  onDelete
}: {
  payee: Payee
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="bg-white border rounded-lg p-4 group">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-medium text-lg">{payee.name}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {payee.match_patterns.map((p, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-sm rounded"
              >
                <span className="text-gray-500 text-xs font-medium uppercase">
                  {p.type.replace('_', ' ')}
                </span>
                <span className="font-mono text-gray-700">{p.pattern}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="invisible group-hover:visible flex gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-400 hover:text-red-600 rounded"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      <PayeeMatches payeeId={payee.id} />
    </div>
  )
}

function PayeeMatches({ payeeId }: { payeeId: number }) {
  const { data: matches, isLoading } = usePayeeMatches(payeeId)

  return (
    <div className="mt-3 pt-3 border-t">
      <div className="text-xs text-gray-500 mb-2">Matched raw payees</div>
      {isLoading ? (
        <div className="text-xs text-gray-400">Loading matches...</div>
      ) : !matches || matches.length === 0 ? (
        <div className="text-xs text-gray-400">No matches yet</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {matches.map((value) => (
            <span
              key={value}
              className="inline-flex items-center px-2 py-1 bg-gray-100 text-xs rounded font-mono text-gray-700"
            >
              {value}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Add/Edit payee form ---

function PayeeForm({
  payee,
  onSave,
  onCancel,
  isSaving
}: {
  payee?: Payee
  onSave: (name: string, patterns: MatchPattern[]) => Promise<void>
  onCancel: () => void
  isSaving: boolean
}) {
  const [name, setName] = useState(payee?.name || '')
  const [patterns, setPatterns] = useState<MatchPattern[]>(
    payee?.match_patterns?.length ? payee.match_patterns : [{ ...EMPTY_PATTERN }]
  )
  const [previewMatches, setPreviewMatches] = useState<string[] | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const previewMutation = usePreviewPayeeMatches()

  const updatePattern = (index: number, field: keyof MatchPattern, value: string) => {
    setPatterns((prev) =>
      prev.map((p, i) =>
        i === index ? { ...p, [field]: value } : p
      )
    )
  }

  const addPattern = () => {
    setPatterns((prev) => [...prev, { ...EMPTY_PATTERN }])
  }

  const removePattern = (index: number) => {
    setPatterns((prev) => prev.filter((_, i) => i !== index))
  }

  const hasAnyPattern = patterns.some((p) => p.pattern.trim().length > 0)

  useEffect(() => {
    if (!hasAnyPattern) {
      setPreviewMatches(null)
      return
    }

    const handle = setTimeout(async () => {
      setIsPreviewing(true)
      try {
        const results = await previewMutation.mutateAsync({
          name: name || 'Preview',
          match_patterns: patterns
        })
        setPreviewMatches(results)
      } catch (error) {
        console.error('Failed to preview matches', error)
        setPreviewMatches(null)
      } finally {
        setIsPreviewing(false)
      }
    }, 300)

    return () => clearTimeout(handle)
  }, [name, patterns, hasAnyPattern])

  const handleSubmit = () => {
    if (!name.trim()) return
    const validPatterns = patterns.filter((p) => p.pattern.trim())
    if (validPatterns.length === 0) return
    onSave(name.trim(), validPatterns)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div className="bg-white border-2 border-blue-200 rounded-lg p-4">
      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Display Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g., Institute for Justice"
            className="w-full px-3 py-2 border border-gray-300 rounded"
            autoFocus
          />
        </div>

        {/* Match patterns */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Match Patterns
          </label>
          <div className="space-y-2">
            {patterns.map((p, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select
                  value={p.type}
                  onChange={(e) => updatePattern(i, 'type', e.target.value)}
                  className="px-2 py-2 border border-gray-300 rounded text-sm w-36"
                >
                  {MATCH_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={p.pattern}
                  onChange={(e) => updatePattern(i, 'pattern', e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Pattern to match..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded font-mono text-sm"
                />
                {patterns.length > 1 && (
                  <button
                    onClick={() => removePattern(i)}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                    title="Remove pattern"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={addPattern}
            className="mt-2 text-sm text-blue-600 hover:text-blue-700"
          >
            + Add another pattern
          </button>
        </div>

        <div className="border-t pt-3">
          <div className="text-xs text-gray-500 mb-2">Preview matching payees</div>
          {!hasAnyPattern ? (
            <div className="text-xs text-gray-400">Enter a pattern to see matches</div>
          ) : isPreviewing ? (
            <div className="text-xs text-gray-400">Matching...</div>
          ) : !previewMatches || previewMatches.length === 0 ? (
            <div className="text-xs text-gray-400">No matches</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {previewMatches.map((value) => (
                <span
                  key={value}
                  className="inline-flex items-center px-2 py-1 bg-gray-100 text-xs rounded font-mono text-gray-700"
                >
                  {value}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving || !name.trim() || !patterns.some((p) => p.pattern.trim())}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : payee ? 'Save Changes' : 'Create Payee'}
          </button>
        </div>
      </div>
    </div>
  )
}
