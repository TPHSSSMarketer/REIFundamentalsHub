import { useState } from 'react'
import { Copy, Check, Trash2, Clock } from 'lucide-react'

export interface PublishEntry {
  id: string
  type: 'social' | 'script' | 'blog'
  label: string
  content: string
  createdAt: string
}

interface PublishHistoryProps {
  entries: PublishEntry[]
  onClear: () => void
}

const TYPE_STYLES: Record<PublishEntry['type'], string> = {
  social: 'bg-blue-100 text-blue-700',
  script: 'bg-purple-100 text-purple-700',
  blog: 'bg-amber-100 text-amber-700',
}

const TYPE_LABELS: Record<PublishEntry['type'], string> = {
  social: 'Social',
  script: 'Script',
  blog: 'Blog',
}

export default function PublishHistory({ entries, onClear }: PublishHistoryProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-800">Publish History</h2>
        </div>
        <p className="text-sm text-slate-500">
          No content generated yet. Generate your first waterfall above to see history here.
        </p>
      </div>
    )
  }

  const handleCopy = async (entry: PublishEntry) => {
    await navigator.clipboard.writeText(entry.content)
    setCopiedId(entry.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-800">Publish History</h2>
          <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full">
            {entries.length}
          </span>
        </div>
        <button
          onClick={onClear}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          Clear all
        </button>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center justify-between gap-3 py-2 px-3 bg-slate-50 rounded-lg"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={`shrink-0 px-2 py-0.5 text-xs font-medium rounded-full ${TYPE_STYLES[entry.type]}`}
              >
                {TYPE_LABELS[entry.type]}
              </span>
              <div className="min-w-0">
                <p className="text-sm text-slate-700 truncate">{entry.label}</p>
                <p className="text-xs text-slate-400">
                  {new Date(entry.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleCopy(entry)}
              className="shrink-0 p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {copiedId === entry.id ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
