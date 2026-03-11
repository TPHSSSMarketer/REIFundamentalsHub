'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Loader2,
  Plus,
  Trash2,
  Save,
  Lock,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Upload,
  FileText,
  X,
  Shield,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  getKnowledgeBase,
  createKnowledgeEntry,
  updateKnowledgeEntry,
  deleteKnowledgeEntry,
  bulkImportKnowledge,
  createPlatformKnowledgeEntry,
  updatePlatformKnowledgeEntry,
  deletePlatformKnowledgeEntry,
  bulkImportPlatformKnowledge,
  type KnowledgeEntry,
  type CreateKnowledgePayload,
  type UpdateKnowledgePayload,
} from '@/services/voiceAiApi'
import { getMe } from '@/services/authApi'

type EntryType = 'account_data' | 'custom_script' | 'objection_handler' | 'training'

const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  training: 'Training',
  account_data: 'Account Data',
  custom_script: 'Custom Script',
  objection_handler: 'Objection Handler',
}

const ENTRY_TYPE_COLORS: Record<EntryType, string> = {
  training: 'bg-green-100 text-green-700',
  account_data: 'bg-blue-100 text-blue-700',
  custom_script: 'bg-purple-100 text-purple-700',
  objection_handler: 'bg-orange-100 text-orange-700',
}

const ACCEPTED_FILE_TYPES = '.pdf,.docx,.txt,.md,.csv'

export default function KnowledgeBaseTab() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Which section's "new entry" form is open: 'user' | 'platform' | null
  const [showNewForm, setShowNewForm] = useState<'user' | 'platform' | null>(null)

  // Which section's bulk import is open: 'user' | 'platform' | null
  const [showBulkImport, setShowBulkImport] = useState<'user' | 'platform' | null>(null)
  const [bulkFiles, setBulkFiles] = useState<File[]>([])
  const [bulkEntryType, setBulkEntryType] = useState<EntryType>('training')
  const [isImporting, setIsImporting] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Form state
  const [newEntryForm, setNewEntryForm] = useState<CreateKnowledgePayload>({
    name: '',
    entry_type: 'custom_script',
    content: '',
  })

  const [editFormData, setEditFormData] = useState<Record<string, UpdateKnowledgePayload>>({})

  useEffect(() => {
    loadEntries()
    checkAdmin()
  }, [])

  const checkAdmin = async () => {
    try {
      const user = await getMe()
      setIsAdmin(!!user.is_superadmin)
    } catch {
      setIsAdmin(false)
    }
  }

  const loadEntries = async () => {
    setIsLoading(true)
    try {
      const data = await getKnowledgeBase()
      setEntries(data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load knowledge base')
    } finally {
      setIsLoading(false)
    }
  }

  // ── CRUD handlers ──────────────────────────────────────────

  const handleAddEntry = async (isPlatform: boolean) => {
    if (!newEntryForm.name.trim() || !newEntryForm.content.trim()) {
      toast.error('Please fill in all required fields')
      return
    }

    setIsSaving(true)
    try {
      if (isPlatform) {
        await createPlatformKnowledgeEntry(newEntryForm)
      } else {
        await createKnowledgeEntry(newEntryForm)
      }
      toast.success(`${isPlatform ? 'System-wide' : ''} entry created successfully`)
      setNewEntryForm({ name: '', entry_type: 'custom_script', content: '' })
      setShowNewForm(null)
      await loadEntries()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create entry')
    } finally {
      setIsSaving(false)
    }
  }

  const handleExpandEntry = (entryId: string) => {
    if (expandedEntryId === entryId) {
      setExpandedEntryId(null)
    } else {
      setExpandedEntryId(entryId)
      const entry = entries.find(e => e.id === entryId)
      if (entry && !editFormData[entryId]) {
        setEditFormData(prev => ({
          ...prev,
          [entryId]: {
            name: entry.name,
            content: entry.content,
            is_active: entry.is_active,
          },
        }))
      }
    }
  }

  const handleSaveEntry = async (entryId: string, isPlatform: boolean) => {
    setIsSaving(true)
    try {
      const formData = editFormData[entryId]
      if (!formData) return

      if (isPlatform) {
        await updatePlatformKnowledgeEntry(entryId, formData)
      } else {
        await updateKnowledgeEntry(entryId, formData)
      }

      setEntries(prev =>
        prev.map(e =>
          e.id === entryId ? { ...e, ...formData } : e
        )
      )

      toast.success('Entry updated successfully')
      setExpandedEntryId(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save entry')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteEntry = async (entryId: string, isPlatform: boolean) => {
    setIsDeleting(entryId)
    try {
      if (isPlatform) {
        await deletePlatformKnowledgeEntry(entryId)
      } else {
        await deleteKnowledgeEntry(entryId)
      }
      setEntries(prev => prev.filter(e => e.id !== entryId))
      setDeleteConfirm(null)
      toast.success('Entry deleted successfully')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete entry')
    } finally {
      setIsDeleting(null)
    }
  }

  const handleToggleActive = (entryId: string) => {
    const entry = entries.find(e => e.id === entryId)
    if (!entry) return

    setEditFormData(prev => ({
      ...prev,
      [entryId]: {
        ...prev[entryId],
        is_active: !(prev[entryId]?.is_active ?? entry.is_active),
      },
    }))
  }

  // ── Bulk Import Handlers ─────────────────────────────────────

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files ? Array.from(e.target.files) : []
    addFiles(selected)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const addFiles = (newFiles: File[]) => {
    const validExtensions = ['.pdf', '.docx', '.txt', '.md', '.csv', '.markdown', '.text']
    const valid = newFiles.filter(f => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase()
      return validExtensions.includes(ext)
    })
    if (valid.length < newFiles.length) {
      toast.error('Some files were skipped (only PDF, DOCX, TXT, MD, CSV are supported)')
    }
    setBulkFiles(prev => {
      const existing = new Set(prev.map(f => f.name))
      return [...prev, ...valid.filter(f => !existing.has(f.name))]
    })
  }

  const removeFile = (filename: string) => {
    setBulkFiles(prev => prev.filter(f => f.name !== filename))
  }

  const handleBulkImport = async (isPlatform: boolean) => {
    if (bulkFiles.length === 0) {
      toast.error('Please add at least one file')
      return
    }

    setIsImporting(true)
    try {
      const result = isPlatform
        ? await bulkImportPlatformKnowledge(bulkFiles, bulkEntryType)
        : await bulkImportKnowledge(bulkFiles, bulkEntryType)

      if (result.created > 0) {
        toast.success(`Imported ${result.created} file${result.created > 1 ? 's' : ''} successfully`)
      }
      if (result.errors > 0) {
        const errorMsgs = result.results
          .filter((r: any) => r.status === 'error')
          .map((r: any) => `${r.filename}: ${r.message}`)
        toast.error(`${result.errors} file${result.errors > 1 ? 's' : ''} failed:\n${errorMsgs.join('\n')}`)
      }

      setBulkFiles([])
      setShowBulkImport(null)
      await loadEntries()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Bulk import failed')
    } finally {
      setIsImporting(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // ── Derived data ───────────────────────────────────────────

  const platformEntries = entries.filter(e => e.is_platform)
  const userEntries = entries.filter(e => !e.is_platform)

  const groupedUserEntries = {
    training: userEntries.filter(e => e.entry_type === 'training'),
    account_data: userEntries.filter(e => e.entry_type === 'account_data'),
    custom_script: userEntries.filter(e => e.entry_type === 'custom_script'),
    objection_handler: userEntries.filter(e => e.entry_type === 'objection_handler'),
  }

  const groupedPlatformEntries = {
    training: platformEntries.filter(e => e.entry_type === 'training'),
    account_data: platformEntries.filter(e => e.entry_type === 'account_data'),
    custom_script: platformEntries.filter(e => e.entry_type === 'custom_script'),
    objection_handler: platformEntries.filter(e => e.entry_type === 'objection_handler'),
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
          <p className="text-sm text-slate-600">Loading knowledge base...</p>
        </div>
      </div>
    )
  }

  // ── Shared sub-components ──────────────────────────────────

  const renderBulkImportPanel = (isPlatform: boolean) => (
    <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">
          Bulk Import Files {isPlatform ? '(System-Wide)' : ''}
        </h3>
        <button
          onClick={() => { setShowBulkImport(null); setBulkFiles([]) }}
          className="text-slate-500 hover:text-slate-700"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <p className="text-sm text-slate-600">
        Upload PDF, DOCX, TXT, MD, or CSV files. Each file becomes one knowledge entry.
        {isPlatform ? ' These entries will be available to all users.' : ''}
      </p>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Import as type</label>
        <select
          value={bulkEntryType}
          onChange={(e) => setBulkEntryType(e.target.value as EntryType)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {Object.entries(ENTRY_TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleFileDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-primary-500 bg-primary-50'
            : 'border-slate-300 hover:border-primary-400 hover:bg-slate-50'
        }`}
      >
        <Upload className={`w-10 h-10 mx-auto mb-3 ${isDragging ? 'text-primary-500' : 'text-slate-400'}`} />
        <p className="text-sm font-medium text-slate-700">
          {isDragging ? 'Drop files here' : 'Drag & drop files here, or click to browse'}
        </p>
        <p className="text-xs text-slate-500 mt-1">PDF, DOCX, TXT, MD, CSV (max 5 MB each, up to 20 files)</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_FILE_TYPES}
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {bulkFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">
            {bulkFiles.length} file{bulkFiles.length > 1 ? 's' : ''} selected
          </p>
          {bulkFiles.map(file => (
            <div key={file.name} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <span className="text-sm text-slate-700 truncate">{file.name}</span>
                <span className="text-xs text-slate-500 flex-shrink-0">{formatFileSize(file.size)}</span>
              </div>
              <button onClick={() => removeFile(file.name)} className="text-slate-400 hover:text-red-500 flex-shrink-0 ml-2">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => handleBulkImport(isPlatform)}
          disabled={isImporting || bulkFiles.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
        >
          {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {isImporting ? 'Importing...' : `Import ${bulkFiles.length} File${bulkFiles.length !== 1 ? 's' : ''}`}
        </button>
        <button
          onClick={() => { setShowBulkImport(null); setBulkFiles([]) }}
          className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )

  const renderNewEntryForm = (isPlatform: boolean) => (
    <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">
          Add New {isPlatform ? 'System-Wide ' : ''}Entry
        </h3>
        <button onClick={() => setShowNewForm(null)} className="text-slate-500 hover:text-slate-700">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
        <input
          type="text"
          value={newEntryForm.name}
          onChange={(e) => setNewEntryForm(prev => ({ ...prev, name: e.target.value }))}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="Entry name..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Type *</label>
        <select
          value={newEntryForm.entry_type}
          onChange={(e) => setNewEntryForm(prev => ({ ...prev, entry_type: e.target.value as EntryType }))}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {Object.entries(ENTRY_TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Content *</label>
        <textarea
          rows={4}
          value={newEntryForm.content}
          onChange={(e) => setNewEntryForm(prev => ({ ...prev, content: e.target.value }))}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          placeholder="Entry content..."
        />
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => handleAddEntry(isPlatform)}
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Create Entry
        </button>
        <button
          onClick={() => setShowNewForm(null)}
          className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )

  const renderEntryCard = (entry: KnowledgeEntry, canEdit: boolean) => {
    const isPlatform = entry.is_platform

    return (
      <div key={entry.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {/* Collapsed Header */}
        <button
          onClick={() => handleExpandEntry(entry.id)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3 flex-1 text-left">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-slate-800">{entry.name}</h4>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${ENTRY_TYPE_COLORS[entry.entry_type]}`}>
                  {ENTRY_TYPE_LABELS[entry.entry_type]}
                </span>
                {isPlatform && !canEdit && (
                  <span className="flex items-center gap-1 px-2 py-0.5 text-xs text-slate-600">
                    <Lock className="w-3 h-3" /> System
                  </span>
                )}
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                  entry.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                }`}>
                  {entry.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="text-sm text-slate-600 mt-1 line-clamp-1">{entry.content}</p>
            </div>
          </div>
          <div>
            {expandedEntryId === entry.id
              ? <ChevronUp className="w-5 h-5 text-slate-400" />
              : <ChevronDown className="w-5 h-5 text-slate-400" />
            }
          </div>
        </button>

        {/* Expanded Form */}
        {expandedEntryId === entry.id && (
          <div className="border-t border-slate-200 p-4 space-y-4 bg-slate-50">
            {/* Active Toggle */}
            {canEdit && (
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">Active</label>
                <button
                  onClick={() => handleToggleActive(entry.id)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    (editFormData[entry.id]?.is_active ?? entry.is_active)
                      ? 'bg-green-500'
                      : 'bg-slate-300'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    (editFormData[entry.id]?.is_active ?? entry.is_active)
                      ? 'translate-x-6'
                      : 'translate-x-1'
                  }`} />
                </button>
              </div>
            )}

            {/* Content */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Content</label>
              <textarea
                rows={6}
                value={editFormData[entry.id]?.content ?? entry.content}
                onChange={(e) => setEditFormData(prev => ({
                  ...prev,
                  [entry.id]: { ...prev[entry.id], content: e.target.value },
                }))}
                disabled={!canEdit}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none disabled:bg-slate-100 disabled:cursor-not-allowed"
              />
            </div>

            {/* Action Buttons */}
            {canEdit && (
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => handleSaveEntry(entry.id, isPlatform)}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Changes
                </button>
                <button
                  onClick={() => setDeleteConfirm(entry.id)}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            )}
          </div>
        )}

        {/* Delete Confirmation */}
        {deleteConfirm === entry.id && (
          <div className="border-t border-slate-200 p-4 bg-red-50 flex items-center justify-between">
            <p className="text-sm text-red-700">Are you sure you want to delete this entry?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-3 py-1 text-sm border border-red-300 text-red-700 rounded hover:bg-red-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteEntry(entry.id, isPlatform)}
                disabled={isDeleting === entry.id}
                className="flex items-center gap-1 px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isDeleting === entry.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderEntryGroup = (
    grouped: Record<string, KnowledgeEntry[]>,
    canEdit: boolean,
  ) => {
    const hasEntries = Object.values(grouped).some(arr => arr.length > 0)
    if (!hasEntries) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-slate-500">
          <AlertCircle className="w-10 h-10 mb-2 opacity-50" />
          <p className="text-center text-sm">No entries yet</p>
        </div>
      )
    }

    return Object.entries(grouped).map(([typeKey, typeEntries]) => {
      if (typeEntries.length === 0) return null
      const entryType = typeKey as EntryType

      return (
        <div key={typeKey} className="mb-4">
          <h4 className="font-semibold text-slate-700 mb-2 text-sm">
            {ENTRY_TYPE_LABELS[entryType]} ({typeEntries.length})
          </h4>
          <div className="space-y-2">
            {typeEntries.map(entry => renderEntryCard(entry, canEdit))}
          </div>
        </div>
      )
    })
  }

  // ── Main Render ────────────────────────────────────────────

  return (
    <div className="p-6 space-y-8">

      {/* ════════════════════════════════════════════════════════ */}
      {/* ADMIN: System-Wide Training Section                     */}
      {/* ════════════════════════════════════════════════════════ */}
      {isAdmin && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-900">System-Wide Training</h2>
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-100 text-indigo-700">
              Admin
            </span>
          </div>
          <p className="text-sm text-slate-600 mb-4">
            These entries are available to all users. Upload training materials, scripts,
            and objection handlers that every subscriber can access.
          </p>

          {/* Bulk Import Panel (Platform) */}
          {showBulkImport === 'platform' && renderBulkImportPanel(true)}

          {/* New Entry Form (Platform) */}
          {showNewForm === 'platform' && renderNewEntryForm(true)}

          {/* Action Buttons */}
          {showNewForm !== 'platform' && showBulkImport !== 'platform' && (
            <div className="flex gap-3 mb-4">
              <button
                onClick={() => { setShowNewForm('platform'); setShowBulkImport(null) }}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add System Entry
              </button>
              <button
                onClick={() => { setShowBulkImport('platform'); setShowNewForm(null) }}
                className="flex items-center gap-2 px-4 py-2 border border-indigo-600 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Bulk Import
              </button>
            </div>
          )}

          {/* Platform Entries */}
          {renderEntryGroup(groupedPlatformEntries, true)}

          {/* Divider */}
          <div className="border-t border-slate-300 mt-6" />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* USER: Account Knowledge Base                            */}
      {/* ════════════════════════════════════════════════════════ */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 mb-4">
          {isAdmin ? 'User-Level Entries' : 'Knowledge Base'}
        </h2>

        {/* Bulk Import Panel (User) */}
        {showBulkImport === 'user' && renderBulkImportPanel(false)}

        {/* New Entry Form (User) */}
        {showNewForm === 'user' && renderNewEntryForm(false)}

        {/* Action Buttons */}
        {showNewForm !== 'user' && showBulkImport !== 'user' && (
          <div className="flex gap-3 mb-4">
            <button
              onClick={() => { setShowNewForm('user'); setShowBulkImport(null) }}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Entry
            </button>
            <button
              onClick={() => { setShowBulkImport('user'); setShowNewForm(null) }}
              className="flex items-center gap-2 px-4 py-2 border border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Bulk Import
            </button>
          </div>
        )}

        {/* User Entries */}
        {renderEntryGroup(groupedUserEntries, true)}

        {/* Platform entries shown read-only to non-admin users */}
        {!isAdmin && platformEntries.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <Lock className="w-4 h-4 text-slate-500" />
              <h3 className="font-semibold text-slate-700">System Training (Read Only)</h3>
            </div>
            {renderEntryGroup(groupedPlatformEntries, false)}
          </div>
        )}
      </div>
    </div>
  )
}
