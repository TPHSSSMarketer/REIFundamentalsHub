import { useState, useEffect, useCallback } from 'react'
import { Search, TrendingUp, TrendingDown, Clock, Filter, ChevronDown, ChevronUp, MessageSquare, ThumbsUp, Eye, Share2, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import {
  listLibrary,
  searchContent,
  updatePerformance,
  getPublishHistory,
  type ContentEntry,
  type PublishRecord,
} from '@/services/contentHubApi'

const RATING_COLORS: Record<string, string> = {
  worked: 'bg-green-100 text-green-700 border-green-300',
  flopped: 'bg-red-100 text-red-700 border-red-300',
  pending: 'bg-yellow-100 text-yellow-700 border-yellow-300',
}

const TYPE_LABELS: Record<string, string> = {
  source_article: 'Source',
  waterfall: 'Waterfall',
  inspiration: 'Inspiration',
}

export default function ContentLibrary() {
  const [entries, setEntries] = useState<ContentEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [filterRating, setFilterRating] = useState('')
  const [filterType, setFilterType] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [publishHistory, setPublishHistory] = useState<Record<string, PublishRecord[]>>({})

  const loadLibrary = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await listLibrary({
        rating: filterRating || undefined,
        content_type: filterType || undefined,
      })
      setEntries(result.entries)
    } catch {
      toast.error('Failed to load content library')
    } finally {
      setIsLoading(false)
    }
  }, [filterRating, filterType])

  useEffect(() => {
    loadLibrary()
  }, [loadLibrary])

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      loadLibrary()
      return
    }
    setIsSearching(true)
    try {
      const result = await searchContent(searchQuery.trim())
      setEntries(result.results)
    } catch {
      toast.error('Search failed')
    } finally {
      setIsSearching(false)
    }
  }, [searchQuery, loadLibrary])

  const handleRate = useCallback(async (entryId: string, rating: 'worked' | 'flopped') => {
    try {
      await updatePerformance(entryId, rating)
      toast.success(`Marked as "${rating}"`)
      setEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, rating } : e))
      )
    } catch {
      toast.error('Failed to update rating')
    }
  }, [])

  const toggleExpand = useCallback(async (entryId: string) => {
    if (expandedId === entryId) {
      setExpandedId(null)
      return
    }
    setExpandedId(entryId)
    // Load publish history if not cached
    if (!publishHistory[entryId]) {
      try {
        const result = await getPublishHistory(entryId)
        setPublishHistory((prev) => ({ ...prev, [entryId]: result.records }))
      } catch {
        // Not critical
      }
    }
  }, [expandedId, publishHistory])

  if (entries.length === 0 && !isLoading && !searchQuery) {
    return null // Don't show empty library section
  }

  return (
    <div id="content-library" className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
        Content Library
        <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full">
          {entries.length} saved
        </span>
      </h2>

      {/* Search Bar */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Search your content (e.g. 'wholesaling LinkedIn posts')..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <button
          onClick={handleSearch}
          disabled={isSearching}
          className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm flex items-center gap-1"
        >
          <Search className="w-4 h-4" />
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Filter Row */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <Filter className="w-3 h-3" /> Filters:
        </div>
        {['', 'worked', 'flopped', 'pending'].map((r) => (
          <button
            key={`r-${r}`}
            onClick={() => setFilterRating(r)}
            className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
              filterRating === r
                ? 'bg-primary-100 text-primary-700 border-primary-300'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {r === '' ? 'All' : r === 'worked' ? 'Worked' : r === 'flopped' ? 'Flopped' : 'Pending'}
          </button>
        ))}
        <span className="text-slate-300">|</span>
        {['', 'source_article', 'waterfall', 'inspiration'].map((t) => (
          <button
            key={`t-${t}`}
            onClick={() => setFilterType(t)}
            className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
              filterType === t
                ? 'bg-primary-100 text-primary-700 border-primary-300'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {t === '' ? 'All Types' : TYPE_LABELS[t] || t}
          </button>
        ))}
      </div>

      {/* Content Cards */}
      {isLoading ? (
        <div className="text-center py-8 text-slate-400 text-sm">Loading library...</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm">
          {searchQuery ? 'No results found. Try a different search.' : 'No content saved yet. Generate some content above!'}
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="border border-slate-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
              {/* Header Row */}
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      entry.content_type === 'waterfall' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      entry.content_type === 'source_article' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                      'bg-slate-50 text-slate-600 border-slate-200'
                    }`}>
                      {TYPE_LABELS[entry.content_type] || entry.content_type}
                    </span>
                    {entry.rating && (
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${RATING_COLORS[entry.rating] || ''}`}>
                        {entry.rating === 'worked' && <TrendingUp className="w-3 h-3 inline mr-0.5" />}
                        {entry.rating === 'flopped' && <TrendingDown className="w-3 h-3 inline mr-0.5" />}
                        {entry.rating}
                      </span>
                    )}
                    {entry.similarity !== undefined && (
                      <span className="text-xs text-slate-400">
                        {Math.round(entry.similarity * 100)}% match
                      </span>
                    )}
                  </div>
                  <h3 className="font-medium text-slate-800 text-sm truncate">{entry.topic}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(entry.created_at).toLocaleDateString()}
                    {entry.source_url && (
                      <> · <a href={entry.source_url} target="_blank" rel="noreferrer" className="text-primary-500 hover:underline">Source <ExternalLink className="w-3 h-3 inline" /></a></>
                    )}
                  </p>
                </div>

                {/* Rating Buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleRate(entry.id, 'worked')}
                    title="Mark as worked"
                    className={`p-1.5 rounded text-xs transition-colors ${
                      entry.rating === 'worked' ? 'bg-green-100 text-green-700' : 'text-slate-400 hover:text-green-600 hover:bg-green-50'
                    }`}
                  >
                    <TrendingUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleRate(entry.id, 'flopped')}
                    title="Mark as flopped"
                    className={`p-1.5 rounded text-xs transition-colors ${
                      entry.rating === 'flopped' ? 'bg-red-100 text-red-700' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                    }`}
                  >
                    <TrendingDown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggleExpand(entry.id)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {expandedId === entry.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Tags */}
              {entry.tags.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {entry.tags.map((tag) => (
                    <span key={tag} className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Expanded Content */}
              {expandedId === entry.id && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  {/* Waterfall Content Preview */}
                  {entry.content && Object.keys(entry.content).length > 0 && (
                    <div className="space-y-2 mb-3">
                      {Object.entries(entry.content).map(([platform, text]) => (
                        <details key={platform} className="text-sm">
                          <summary className="cursor-pointer text-slate-600 hover:text-slate-800 font-medium text-xs">
                            {platform.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                          </summary>
                          <p className="mt-1 text-xs text-slate-500 whitespace-pre-wrap pl-3 border-l-2 border-slate-200">
                            {typeof text === 'string' ? text.slice(0, 400) : JSON.stringify(text).slice(0, 400)}
                            {typeof text === 'string' && text.length > 400 && '...'}
                          </p>
                        </details>
                      ))}
                    </div>
                  )}

                  {/* Publish History */}
                  {publishHistory[entry.id] && publishHistory[entry.id].length > 0 && (
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs font-medium text-slate-600 mb-2">Publish History</p>
                      {publishHistory[entry.id].map((rec) => (
                        <div key={rec.id} className="flex justify-between items-center text-xs py-1">
                          <span className="font-medium text-slate-700 capitalize">{rec.platform}</span>
                          <div className="flex gap-3 text-slate-500">
                            {rec.likes > 0 && <span className="flex items-center gap-0.5"><ThumbsUp className="w-3 h-3" /> {rec.likes}</span>}
                            {rec.comments > 0 && <span className="flex items-center gap-0.5"><MessageSquare className="w-3 h-3" /> {rec.comments}</span>}
                            {rec.shares > 0 && <span className="flex items-center gap-0.5"><Share2 className="w-3 h-3" /> {rec.shares}</span>}
                            {rec.views > 0 && <span className="flex items-center gap-0.5"><Eye className="w-3 h-3" /> {rec.views}</span>}
                            <span className="text-slate-400">{new Date(rec.published_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {entry.performance_notes && (
                    <p className="text-xs text-slate-500 italic mt-2">Notes: {entry.performance_notes}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
