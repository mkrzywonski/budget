import { useState, useCallback, useEffect } from 'react'
import { format } from 'date-fns'
import clsx from 'clsx'
import {
  usePreviewCSV,
  usePreviewOFX,
  useCommitImport,
  useSaveProfile,
  useImportProfiles,
  CSVPreviewResponse,
  ColumnMappings,
  AmountConfig,
} from '../hooks/useImport'
import { formatCurrency } from '../utils/format'

interface ImportModalProps {
  accountId: number
  accountName: string
  onClose: () => void
  onSuccess: () => void
}

type Step = 'upload' | 'mapping' | 'preview' | 'complete'

export default function ImportModal({
  accountId,
  accountName,
  onClose,
  onSuccess
}: ImportModalProps) {
  const [step, setStep] = useState<Step>('upload')
  const [fileContent, setFileContent] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileType, setFileType] = useState<'csv' | 'ofx'>('csv')
  const [delimiter, setDelimiter] = useState(',')
  const [skipRows, setSkipRows] = useState(0)
  const [hasHeader, setHasHeader] = useState(true)

  const [preview, setPreview] = useState<CSVPreviewResponse | null>(null)
  const [mappings, setMappings] = useState<ColumnMappings>({ date: 0 })
  const [amountConfig, setAmountConfig] = useState<AmountConfig>({
    type: 'single',
    column: 1,
    negate: false
  })

  const [acceptedDuplicates, setAcceptedDuplicates] = useState<Set<number>>(new Set())
  const [excludedNew, setExcludedNew] = useState<Set<number>>(new Set())
  const [saveSettings, setSaveSettings] = useState(false)
  const [useSavedSettings, setUseSavedSettings] = useState(false)

  const { data: profiles } = useImportProfiles(accountId)
  const savedProfile = profiles?.[0] ?? null
  const previewMutation = usePreviewCSV()
  const previewOFXMutation = usePreviewOFX()
  const commitMutation = useCommitImport()
  const saveProfileMutation = useSaveProfile()

  // Default to using saved settings when they exist
  useEffect(() => {
    if (savedProfile) {
      setUseSavedSettings(true)
      setDelimiter(savedProfile.delimiter || ',')
      setSkipRows(savedProfile.skip_rows || 0)
      setHasHeader(savedProfile.has_header)
    }
  }, [savedProfile])

  const handleUseSavedSettings = (use: boolean) => {
    setUseSavedSettings(use)
    if (use && savedProfile) {
      setDelimiter(savedProfile.delimiter || ',')
      setSkipRows(savedProfile.skip_rows || 0)
      setHasHeader(savedProfile.has_header)
    } else {
      setDelimiter(',')
      setSkipRows(0)
      setHasHeader(true)
    }
  }

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    const ext = file.name.split('.').pop()?.toLowerCase()
    setFileType(ext === 'ofx' || ext === 'qfx' ? 'ofx' : 'csv')

    const reader = new FileReader()
    reader.onload = (event) => {
      setFileContent(event.target?.result as string)
    }
    reader.readAsText(file)
  }, [])

  const handlePreview = async () => {
    if (!fileContent) return

    if (fileType === 'ofx') {
      const result = await previewOFXMutation.mutateAsync({
        content: fileContent,
        account_id: accountId,
      })
      setPreview(result)
      setStep('preview')
      return
    }

    const useProfile = useSavedSettings && savedProfile

    const result = await previewMutation.mutateAsync({
      content: fileContent,
      account_id: accountId,
      delimiter,
      skip_rows: skipRows,
      has_header: hasHeader,
      ...(useProfile && {
        column_mappings: savedProfile!.column_mappings as unknown as ColumnMappings,
        amount_config: savedProfile!.amount_config,
        ...(savedProfile!.date_format && { date_format: savedProfile!.date_format }),
      }),
    })

    setPreview(result)

    // Use detected mappings if available
    if (result.detected_mappings) {
      setMappings(result.detected_mappings)
      if (result.detected_mappings.amount !== undefined) {
        setAmountConfig({
          type: 'single',
          column: result.detected_mappings.amount,
          negate: false
        })
      }
    }

    // If using saved settings or auto-matched, skip to preview
    if (result.matched_profile_id || useProfile) {
      setStep('preview')
    } else {
      setStep('mapping')
    }
  }

  const reParse = async (newDelimiter: string, newSkipRows: number, newHasHeader: boolean) => {
    if (!fileContent) return

    const result = await previewMutation.mutateAsync({
      content: fileContent,
      account_id: accountId,
      delimiter: newDelimiter,
      skip_rows: newSkipRows,
      has_header: newHasHeader,
    })

    setPreview(result)
    if (result.detected_mappings) {
      setMappings(result.detected_mappings)
      if (result.detected_mappings.amount !== undefined) {
        setAmountConfig({
          type: 'single',
          column: result.detected_mappings.amount,
          negate: false
        })
      }
    }
  }

  const handleDelimiterChange = (v: string) => {
    setDelimiter(v)
    reParse(v, skipRows, hasHeader)
  }

  const handleSkipRowsChange = (v: number) => {
    setSkipRows(v)
    reParse(delimiter, v, hasHeader)
  }

  const handleHasHeaderChange = (v: boolean) => {
    setHasHeader(v)
    reParse(delimiter, skipRows, v)
  }

  const handleApplyMappings = async () => {
    if (!fileContent) return

    const result = await previewMutation.mutateAsync({
      content: fileContent,
      account_id: accountId,
      delimiter,
      skip_rows: skipRows,
      has_header: hasHeader,
      column_mappings: mappings,
      amount_config: amountConfig
    })

    setPreview(result)
    setStep('preview')
  }

  const handleToggleDuplicate = (rowIndex: number) => {
    setAcceptedDuplicates(prev => {
      const next = new Set(prev)
      if (next.has(rowIndex)) {
        next.delete(rowIndex)
      } else {
        next.add(rowIndex)
      }
      return next
    })
  }

  const handleToggleNew = (rowIndex: number) => {
    setExcludedNew(prev => {
      const next = new Set(prev)
      if (next.has(rowIndex)) {
        next.delete(rowIndex)
      } else {
        next.add(rowIndex)
      }
      return next
    })
  }

  const handleSelectAllNew = () => {
    setExcludedNew(new Set())
  }

  const handleDeselectAllNew = () => {
    if (!preview) return
    setExcludedNew(new Set(preview.new_transactions.map(tx => tx.row_index)))
  }

  const handleAcceptAllDuplicates = () => {
    if (!preview) return
    const indices = preview.duplicates.map(d => d.parsed.row_index)
    setAcceptedDuplicates(new Set(indices))
  }

  const handleRejectAllDuplicates = () => {
    setAcceptedDuplicates(new Set())
  }

  const handleCommit = async () => {
    if (!preview) return

    // Combine selected new transactions with accepted duplicates
    const allTransactions = [
      ...preview.new_transactions.filter(tx => !excludedNew.has(tx.row_index)),
      ...preview.duplicates
        .filter(d => acceptedDuplicates.has(d.parsed.row_index))
        .map(d => d.parsed)
    ]

    await commitMutation.mutateAsync({
      account_id: accountId,
      batch_id: preview.batch_id,
      transactions: allTransactions,
      accepted_duplicate_indices: Array.from(acceptedDuplicates),
      source: fileType === 'ofx' ? 'import_qfx' : 'import_csv'
    })

    // Save import settings if requested
    if (saveSettings && preview.headers) {
      await saveProfileMutation.mutateAsync({
        account_id: accountId,
        headers: preview.headers,
        column_mappings: mappings,
        amount_config: amountConfig,
        delimiter,
        skip_rows: skipRows,
        has_header: hasHeader
      })
    }

    setStep('complete')
  }

  const handleDone = () => {
    onSuccess()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-overlay flex items-center justify-center p-4 z-50">
      <div className="bg-surface rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold">Import Transactions</h2>
            <p className="text-sm text-content-secondary">{accountName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-content-tertiary hover:text-content-secondary text-2xl"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {step === 'upload' && (
            <UploadStep
              fileName={fileName}
              fileType={fileType}
              onFileSelect={handleFileSelect}
              hasSavedSettings={!!savedProfile}
              useSavedSettings={useSavedSettings}
              onUseSavedSettingsChange={handleUseSavedSettings}
            />
          )}

          {step === 'mapping' && preview && (
            <MappingStep
              headers={preview.headers}
              mappings={mappings}
              amountConfig={amountConfig}
              onMappingsChange={setMappings}
              onAmountConfigChange={setAmountConfig}
              delimiter={delimiter}
              skipRows={skipRows}
              onDelimiterChange={handleDelimiterChange}
              onSkipRowsChange={handleSkipRowsChange}
              isParsing={previewMutation.isPending}
              rawPreviewLines={fileContent.split('\n').slice(0, 10)}
              hasHeader={hasHeader}
              onHasHeaderChange={handleHasHeaderChange}
            />
          )}

          {step === 'preview' && preview && (
            <PreviewStep
              preview={preview}
              acceptedDuplicates={acceptedDuplicates}
              onToggleDuplicate={handleToggleDuplicate}
              onAcceptAll={handleAcceptAllDuplicates}
              onRejectAll={handleRejectAllDuplicates}
              excludedNew={excludedNew}
              onToggleNew={handleToggleNew}
              onSelectAllNew={handleSelectAllNew}
              onDeselectAllNew={handleDeselectAllNew}
              saveSettings={saveSettings}
              onSaveSettingsChange={setSaveSettings}
              showSaveSettings={fileType === 'csv' && !useSavedSettings}
            />
          )}

          {step === 'complete' && commitMutation.data && (
            <CompleteStep result={commitMutation.data} />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-between">
          <div>
            {step !== 'upload' && step !== 'complete' && (
              <button
                onClick={() => setStep(step === 'preview' ? (fileType === 'ofx' ? 'upload' : 'mapping') : 'upload')}
                className="px-4 py-2 border border-border-strong rounded hover:bg-hover"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {step === 'upload' && (
              <button
                onClick={handlePreview}
                disabled={!fileContent || previewMutation.isPending || previewOFXMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {previewMutation.isPending || previewOFXMutation.isPending ? 'Processing...' : 'Continue'}
              </button>
            )}
            {step === 'mapping' && (
              <button
                onClick={handleApplyMappings}
                disabled={previewMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {previewMutation.isPending ? 'Processing...' : 'Preview Import'}
              </button>
            )}
            {step === 'preview' && (
              <button
                onClick={handleCommit}
                disabled={commitMutation.isPending}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                {commitMutation.isPending ? 'Importing...' : `Import ${(preview?.new_count ?? 0) - excludedNew.size + acceptedDuplicates.size} Transactions`}
              </button>
            )}
            {step === 'complete' && (
              <button
                onClick={handleDone}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Step Components

function UploadStep({
  fileName,
  fileType,
  onFileSelect,
  hasSavedSettings,
  useSavedSettings,
  onUseSavedSettingsChange
}: {
  fileName: string
  fileType: 'csv' | 'ofx'
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  hasSavedSettings: boolean
  useSavedSettings: boolean
  onUseSavedSettingsChange: (v: boolean) => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-content mb-2">
          Select File
        </label>
        <div className="border-2 border-dashed border-input-border rounded-lg p-8 text-center">
          <input
            type="file"
            accept=".csv,.txt,.ofx,.qfx"
            onChange={onFileSelect}
            className="hidden"
            id="csv-upload"
          />
          <label
            htmlFor="csv-upload"
            className="cursor-pointer text-blue-600 hover:text-blue-700"
          >
            {fileName || 'Click to select a file'}
          </label>
          <p className="text-xs text-content-tertiary mt-2">CSV, OFX, or QFX</p>
        </div>
      </div>

      {hasSavedSettings && fileType === 'csv' && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={useSavedSettings}
            onChange={(e) => onUseSavedSettingsChange(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm text-content">Use saved import settings</span>
        </label>
      )}
    </div>
  )
}

function MappingStep({
  headers,
  mappings,
  amountConfig,
  onMappingsChange,
  onAmountConfigChange,
  delimiter,
  skipRows,
  onDelimiterChange,
  onSkipRowsChange,
  isParsing,
  rawPreviewLines,
  hasHeader,
  onHasHeaderChange
}: {
  headers: string[]
  mappings: ColumnMappings
  amountConfig: AmountConfig
  onMappingsChange: (m: ColumnMappings) => void
  onAmountConfigChange: (c: AmountConfig) => void
  delimiter: string
  skipRows: number
  onDelimiterChange: (v: string) => void
  onSkipRowsChange: (v: number) => void
  isParsing: boolean
  rawPreviewLines: string[]
  hasHeader: boolean
  onHasHeaderChange: (v: boolean) => void
}) {
  const columnOptions = headers.map((h, i) => (
    <option key={i} value={i}>{h}</option>
  ))

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-content mb-2">File Preview</label>
        <pre className="bg-surface-secondary border border-border rounded p-3 text-xs font-mono overflow-x-auto max-h-40 leading-relaxed">
          {rawPreviewLines.map((line, i) => (
            <div key={i} className={clsx(i < skipRows && 'text-content-tertiary line-through')}>
              <span className="text-content-tertiary select-none mr-3">{i + 1}</span>{line}
            </div>
          ))}
        </pre>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-content mb-1">
            Delimiter
          </label>
          <select
            value={delimiter}
            onChange={(e) => onDelimiterChange(e.target.value)}
            className="w-full px-3 py-2 border border-input-border rounded bg-input"
          >
            <option value=",">Comma (,)</option>
            <option value=";">Semicolon (;)</option>
            <option value="\t">Tab</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-content mb-1">
            Skip Rows
          </label>
          <input
            type="number"
            min="0"
            value={skipRows}
            onChange={(e) => onSkipRowsChange(Number(e.target.value))}
            className="w-full px-3 py-2 border border-input-border rounded bg-input"
          />
        </div>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={hasHeader}
          onChange={(e) => onHasHeaderChange(e.target.checked)}
          className="rounded"
        />
        <span className="text-sm text-content">First row is a header</span>
      </label>

      {isParsing && (
        <p className="text-sm text-content-secondary">Re-detecting columns...</p>
      )}

      <div className="border-t pt-4">
      <p className="text-sm text-content-secondary mb-4">
        Map columns from your CSV file to transaction fields.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-content mb-1">
            Date Column *
          </label>
          <select
            value={mappings.date}
            onChange={(e) => onMappingsChange({ ...mappings, date: Number(e.target.value) })}
            className="w-full px-3 py-2 border border-input-border rounded bg-input"
          >
            {columnOptions}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-content mb-1">
            Payee/Description Column
          </label>
          <select
            value={mappings.payee ?? ''}
            onChange={(e) => onMappingsChange({
              ...mappings,
              payee: e.target.value ? Number(e.target.value) : undefined
            })}
            className="w-full px-3 py-2 border border-input-border rounded bg-input"
          >
            <option value="">— None —</option>
            {columnOptions}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-content mb-1">
            Memo Column
          </label>
          <select
            value={mappings.memo ?? ''}
            onChange={(e) => onMappingsChange({
              ...mappings,
              memo: e.target.value ? Number(e.target.value) : undefined
            })}
            className="w-full px-3 py-2 border border-input-border rounded bg-input"
          >
            <option value="">— None —</option>
            {columnOptions}
          </select>
        </div>
      </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="font-medium mb-4">Amount Configuration</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-content mb-1">
              Amount Type
            </label>
            <select
              value={amountConfig.type}
              onChange={(e) => onAmountConfigChange({
                ...amountConfig,
                type: e.target.value as 'single' | 'split'
              })}
              className="w-full px-3 py-2 border border-input-border rounded bg-input"
            >
              <option value="single">Single Amount Column</option>
              <option value="split">Separate Debit/Credit Columns</option>
            </select>
          </div>

          {amountConfig.type === 'single' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-content mb-1">
                  Amount Column
                </label>
                <select
                  value={amountConfig.column ?? 1}
                  onChange={(e) => onAmountConfigChange({
                    ...amountConfig,
                    column: Number(e.target.value)
                  })}
                  className="w-full px-3 py-2 border border-input-border rounded bg-input"
                >
                  {columnOptions}
                </select>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={amountConfig.negate}
                  onChange={(e) => onAmountConfigChange({
                    ...amountConfig,
                    negate: e.target.checked
                  })}
                  className="rounded"
                />
                <span className="text-sm text-content">
                  Negate amounts (expenses are positive in file)
                </span>
              </label>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-content mb-1">
                  Debit Column (expenses)
                </label>
                <select
                  value={amountConfig.debit_column ?? 0}
                  onChange={(e) => onAmountConfigChange({
                    ...amountConfig,
                    debit_column: Number(e.target.value)
                  })}
                  className="w-full px-3 py-2 border border-input-border rounded bg-input"
                >
                  {columnOptions}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1">
                  Credit Column (income)
                </label>
                <select
                  value={amountConfig.credit_column ?? 1}
                  onChange={(e) => onAmountConfigChange({
                    ...amountConfig,
                    credit_column: Number(e.target.value)
                  })}
                  className="w-full px-3 py-2 border border-input-border rounded bg-input"
                >
                  {columnOptions}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PreviewStep({
  preview,
  acceptedDuplicates,
  onToggleDuplicate,
  onAcceptAll,
  onRejectAll,
  excludedNew,
  onToggleNew,
  onSelectAllNew,
  onDeselectAllNew,
  saveSettings,
  onSaveSettingsChange,
  showSaveSettings
}: {
  preview: CSVPreviewResponse
  acceptedDuplicates: Set<number>
  onToggleDuplicate: (idx: number) => void
  onAcceptAll: () => void
  onRejectAll: () => void
  excludedNew: Set<number>
  onToggleNew: (idx: number) => void
  onSelectAllNew: () => void
  onDeselectAllNew: () => void
  saveSettings: boolean
  onSaveSettingsChange: (v: boolean) => void
  showSaveSettings: boolean
}) {
  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex gap-4 text-sm">
        <div className="bg-green-50 text-green-700 px-3 py-2 rounded">
          {preview.new_count} new transactions
        </div>
        {preview.duplicate_count > 0 && (
          <div className="bg-yellow-50 text-yellow-700 px-3 py-2 rounded">
            {preview.duplicate_count} potential duplicates
          </div>
        )}
        {preview.error_count > 0 && (
          <div className="bg-red-50 text-red-700 px-3 py-2 rounded">
            {preview.error_count} errors
          </div>
        )}
      </div>

      {preview.matched_profile_id && (
        <div className="bg-blue-50 text-blue-700 px-3 py-2 rounded text-sm">
          Using saved import settings
        </div>
      )}

      {/* Duplicates section */}
      {preview.duplicates.length > 0 && (
        <div>
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium">Potential Duplicates</h3>
            <div className="space-x-2">
              <button
                onClick={onAcceptAll}
                className="text-sm text-green-600 hover:underline"
              >
                Accept All
              </button>
              <button
                onClick={onRejectAll}
                className="text-sm text-red-600 hover:underline"
              >
                Reject All
              </button>
            </div>
          </div>
          <div className="border rounded max-h-48 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-secondary sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left w-12">Import?</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Payee</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.duplicates.map((dup) => (
                  <tr
                    key={dup.fingerprint}
                    className={clsx(
                      'hover:bg-hover',
                      acceptedDuplicates.has(dup.parsed.row_index) && 'bg-green-50'
                    )}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={acceptedDuplicates.has(dup.parsed.row_index)}
                        onChange={() => onToggleDuplicate(dup.parsed.row_index)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-3 py-2">
                      {format(new Date(dup.parsed.posted_date), 'MM/dd/yyyy')}
                    </td>
                    <td className="px-3 py-2">{dup.parsed.payee_raw || '—'}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatCurrency(dup.parsed.amount_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New transactions preview */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-medium">New Transactions</h3>
          <div className="space-x-2">
            <button
              onClick={onSelectAllNew}
              className="text-sm text-green-600 hover:underline"
            >
              Select All
            </button>
            <button
              onClick={onDeselectAllNew}
              className="text-sm text-red-600 hover:underline"
            >
              Deselect All
            </button>
          </div>
        </div>
        <div className="border rounded max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-secondary sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left w-12">Import?</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Payee</th>
                <th className="px-3 py-2 text-left">Memo</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {preview.new_transactions.slice(0, 50).map((tx) => (
                <tr
                  key={tx.row_index}
                  className={clsx(
                    'hover:bg-hover',
                    excludedNew.has(tx.row_index) && 'opacity-50'
                  )}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={!excludedNew.has(tx.row_index)}
                      onChange={() => onToggleNew(tx.row_index)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-3 py-2">
                    {format(new Date(tx.posted_date), 'MM/dd/yyyy')}
                  </td>
                  <td className="px-3 py-2">{tx.payee_raw || '—'}</td>
                  <td className="px-3 py-2 text-content-secondary truncate max-w-xs">
                    {tx.memo || ''}
                  </td>
                  <td className={clsx(
                    'px-3 py-2 text-right font-mono',
                    tx.amount_cents >= 0 ? 'text-green-600' : 'text-red-600'
                  )}>
                    {formatCurrency(tx.amount_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.new_transactions.length > 50 && (
            <div className="px-3 py-2 text-sm text-content-secondary bg-surface-secondary">
              ... and {preview.new_transactions.length - 50} more
            </div>
          )}
        </div>
      </div>

      {/* Save settings option */}
      {showSaveSettings && (
        <div className="border-t pt-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={saveSettings}
              onChange={(e) => onSaveSettingsChange(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-content">
              Save these import settings for next time
            </span>
          </label>
        </div>
      )}

      {/* Errors */}
      {preview.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded p-3">
          <h4 className="font-medium text-red-700 mb-1">Parsing Errors</h4>
          <ul className="text-sm text-red-600 list-disc list-inside">
            {preview.errors.slice(0, 5).map((err, i) => (
              <li key={i}>{err}</li>
            ))}
            {preview.errors.length > 5 && (
              <li>... and {preview.errors.length - 5} more</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

function CompleteStep({ result }: { result: { imported_count: number; skipped_count: number } }) {
  return (
    <div className="text-center py-8">
      <div className="text-6xl mb-4">✓</div>
      <h3 className="text-xl font-semibold mb-2">Import Complete</h3>
      <p className="text-content-secondary">
        Successfully imported {result.imported_count} transactions.
        {result.skipped_count > 0 && ` (${result.skipped_count} skipped as duplicates)`}
      </p>
    </div>
  )
}
