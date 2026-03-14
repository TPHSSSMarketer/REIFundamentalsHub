import { useState, useCallback, useEffect } from 'react'
import { Link, Globe, Sparkles, Copy, Check, BookOpen, Image, Upload, ExternalLink, Loader2, ChevronDown, Share2, RefreshCw, X as XIcon, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { aiGenerateWaterfall, aiScrapeUrl, AiServiceError, ContentWaterfallOutput } from '@/services/aiService'
import { generateContentImages, getContentImageUrl, type ContentImageResult } from '@/services/aiApi'
import { recordPublish } from '@/services/contentHubApi'
import PublishHistory, { PublishEntry } from './PublishHistory'
import ContentLibrary from './ContentLibrary'
import { getAllSocialStatuses, publishToSocial, type SocialPlatform, type AllSocialStatuses } from '@/services/socialMediaApi'
import { getWordPressCredentials, getWordPressStatus } from '@/services/wordPressApi'
import { useBusinessStore } from '@/hooks/useBusinessStore'
import {
  listAudienceSegments,
  listContentTypes,
  listWordPressSites,
  type AudienceSegment,
  type ContentType as BizContentType,
  type BusinessWordPressSite,
} from '@/services/businessApi'

type PlatformKey = 'facebook' | 'instagram' | 'linkedin' | 'youtube_script' | 'youtube_short' | 'blog_post'

/** Publish confirmation state — shown in a modal before actually publishing */
interface PublishConfirmState {
  target: 'wordpress' | SocialPlatform
  platformLabel: string
  content: string
  imageUrl?: string
}

const PLATFORMS: { key: PlatformKey; label: string; emoji: string }[] = [
  { key: 'facebook', label: 'Facebook', emoji: '📘' },
  { key: 'instagram', label: 'Instagram', emoji: '📸' },
  { key: 'linkedin', label: 'LinkedIn', emoji: '💼' },
  { key: 'youtube_script', label: 'YT Script', emoji: '🎬' },
  { key: 'youtube_short', label: 'YT Short', emoji: '⚡' },
  { key: 'blog_post', label: 'Blog Post', emoji: '✍️' },
]

export default function ContentHub() {
  const [sourceMode, setSourceMode] = useState<'text' | 'url'>('text')
  const [sourceText, setSourceText] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [topic, setTopic] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isScraping, setIsScraping] = useState(false)
  const [waterfall, setWaterfall] = useState<ContentWaterfallOutput | null>(null)
  const [activeTab, setActiveTab] = useState<PlatformKey>('facebook')
  const [copiedTab, setCopiedTab] = useState<PlatformKey | null>(null)
  const [generatedImages, setGeneratedImages] = useState<Record<string, ContentImageResult>>({})
  const [isGeneratingImages, setIsGeneratingImages] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [contentEntryId, setContentEntryId] = useState<string | null>(null)
  const [editedWaterfall, setEditedWaterfall] = useState<ContentWaterfallOutput | null>(null)
  const [regeneratingPlatform, setRegeneratingPlatform] = useState<string | null>(null)
  const [publishConfirm, setPublishConfirm] = useState<PublishConfirmState | null>(null)
  const [publishHistory, setPublishHistory] = useState<PublishEntry[]>([])
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [socialStatuses, setSocialStatuses] = useState<AllSocialStatuses | null>(null)
  const [publishMenuOpen, setPublishMenuOpen] = useState(false)
  const [socialPublishing, setSocialPublishing] = useState<SocialPlatform | null>(null)
  const [selectedTone, setSelectedTone] = useState<string | null>(null)

  // Business context
  const { currentBusiness } = useBusinessStore()
  const [audiences, setAudiences] = useState<AudienceSegment[]>([])
  const [contentTypes, setContentTypes] = useState<BizContentType[]>([])
  const [wpSites, setWpSites] = useState<BusinessWordPressSite[]>([])
  const [selectedAudience, setSelectedAudience] = useState<string | null>(null)
  const [selectedContentType, setSelectedContentType] = useState<string | null>(null)
  const [selectedWpSite, setSelectedWpSite] = useState<string | null>(null)

  useEffect(() => {
    getAllSocialStatuses().then(setSocialStatuses).catch(() => {})
    // Preload WordPress status to improve UX
    getWordPressStatus().catch(() => {})
  }, [])

  // Load audience segments, content types, and WordPress sites when business changes
  useEffect(() => {
    if (!currentBusiness) {
      setAudiences([])
      setContentTypes([])
      setWpSites([])
      return
    }
    listAudienceSegments(currentBusiness.id)
      .then((res) => setAudiences(res.audiences || []))
      .catch(() => {})
    listContentTypes(currentBusiness.id)
      .then((res) => setContentTypes(res.content_types || []))
      .catch(() => {})
    listWordPressSites(currentBusiness.id)
      .then((res) => setWpSites(res.sites || []))
      .catch(() => {})
    // Reset selections when business changes
    setSelectedAudience(null)
    setSelectedContentType(null)
    setSelectedWpSite(null)
  }, [currentBusiness?.id])

  const handleScrapeUrl = useCallback(async () => {
    setIsScraping(true)
    try {
      const result = await aiScrapeUrl(sourceUrl)
      setSourceText(result.text)
      setSourceMode('text')
      toast.success('URL scraped — content loaded as text.')
    } catch (err) {
      if (err instanceof AiServiceError && err.status === 503) {
        toast.error('URL scraping is coming soon. Paste the content manually.')
      } else if (err instanceof AiServiceError && err.status === 403) {
        toast.error('URL scraping is being upgraded. Check back soon.')
      } else {
        toast.error('Could not fetch that URL. Paste the content manually.')
      }
    } finally {
      setIsScraping(false)
    }
  }, [sourceUrl])

  const handleGenerate = useCallback(async () => {
    if (sourceMode === 'text' && !sourceText.trim()) {
      toast.error('Add source content first.')
      return
    }
    setIsGenerating(true)
    setWaterfall(null)
    setEditedWaterfall(null)
    setGeneratedImages({})
    setContentEntryId(null)
    try {
      const result = await aiGenerateWaterfall({
        source_text: sourceText,
        topic: topic || sourceText.slice(0, 60),
        tone_override: selectedTone || audiences.find((a) => a.id === selectedAudience)?.tone || undefined,
      })
      setWaterfall(result.content)
      setEditedWaterfall({ ...result.content })
      setActiveTab('facebook')
      if (result.content_entry_id) setContentEntryId(result.content_entry_id)

      // Append entries to publish history
      const platformTypeMap: Record<PlatformKey, PublishEntry['type']> = {
        facebook: 'social',
        instagram: 'social',
        linkedin: 'social',
        youtube_script: 'script',
        youtube_short: 'script',
        blog_post: 'blog',
      }
      const newEntries: PublishEntry[] = PLATFORMS.map((p) => ({
        id: crypto.randomUUID(),
        type: platformTypeMap[p.key],
        label: (result.content[p.key] || '').slice(0, 60),
        content: result.content[p.key] || '',
        createdAt: new Date().toISOString(),
      }))
      setPublishHistory((prev) => [...newEntries, ...prev].slice(0, 50))
    } catch (err) {
      if (err instanceof AiServiceError && err.status === 503) {
        toast.error('Content generation is coming soon. Check back later.')
      } else if (err instanceof AiServiceError && err.status === 403) {
        toast.error('Content generation is being upgraded. Check back soon.')
      } else {
        toast.error('Content generation failed. Please try again later.')
      }
    } finally {
      setIsGenerating(false)
    }
  }, [sourceMode, sourceText, topic])

  const handleCopy = useCallback(async (key: PlatformKey) => {
    if (!editedWaterfall) return
    await navigator.clipboard.writeText(editedWaterfall[key])
    setCopiedTab(key)
    setTimeout(() => setCopiedTab(null), 2000)
  }, [editedWaterfall])

  const handleGenerateImages = useCallback(async () => {
    if (!waterfall || !topic) {
      toast.error('Generate content first.')
      return
    }
    setIsGeneratingImages(true)
    setGeneratedImages({})
    try {
      const result = await generateContentImages(topic || 'real estate investing')
      setGeneratedImages(result.images || {})
      const successCount = Object.values(result.images || {}).filter((img) => img.id).length
      if (successCount > 0) {
        toast.success(`Generated ${successCount} platform images!`)
      } else {
        toast.error('No images were generated. Check your NVIDIA API key in Admin > Credentials.')
      }
    } catch (err) {
      if (err instanceof AiServiceError && err.status === 403) {
        toast.error('AI credit limit reached. Upgrade your plan for more.')
      } else {
        toast.error('Image generation failed. Please try again.')
      }
    } finally {
      setIsGeneratingImages(false)
    }
  }, [waterfall, topic])

  const handleRegenerateImage = useCallback(async (platform: string) => {
    if (!topic) return
    setRegeneratingPlatform(platform)
    try {
      const result = await generateContentImages(topic, [platform])
      if (result.images?.[platform]) {
        setGeneratedImages((prev) => ({ ...prev, [platform]: result.images[platform] }))
        toast.success(`Regenerated ${platform.replace(/_/g, ' ')} image!`)
      } else {
        toast.error(`Failed to regenerate ${platform} image.`)
      }
    } catch {
      toast.error('Image regeneration failed. Please try again.')
    } finally {
      setRegeneratingPlatform(null)
    }
  }, [topic])

  const handlePublishToWordPress = useCallback(async () => {
    if (!editedWaterfall) return
    setIsPublishing(true)
    try {
      let wpUrl: string, wpUsername: string, wpAppPassword: string

      if (selectedWpSite && wpSites.length > 0) {
        // Use the selected business WordPress site
        const site = wpSites.find((s) => s.id === selectedWpSite)
        if (!site) {
          toast.error('Selected WordPress site not found.')
          return
        }
        wpUrl = site.wp_url
        wpUsername = site.wp_username
        wpAppPassword = site.wp_app_password
      } else if (wpSites.length === 1) {
        // Auto-use the only site
        wpUrl = wpSites[0].wp_url
        wpUsername = wpSites[0].wp_username
        wpAppPassword = wpSites[0].wp_app_password
      } else {
        // Fall back to legacy single-site credentials
        const credentials = await getWordPressCredentials()
        wpUrl = credentials.wp_url
        wpUsername = credentials.wp_username
        wpAppPassword = credentials.wp_app_password
      }

      const token = btoa(wpUsername + ':' + wpAppPassword)
      const res = await fetch(wpUrl.replace(/\/$/, '') + '/wp-json/wp/v2/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Basic ' + token,
        },
        body: JSON.stringify({
          title: topic || 'New Post',
          content: editedWaterfall.blog_post,
          status: 'draft',
        }),
      })
      if (res.ok) {
        const siteName = wpSites.find((s) => s.id === selectedWpSite)?.label || 'WordPress'
        toast.success(`Draft published to ${siteName}!`)
      } else {
        toast.error('WordPress publish failed. Check your credentials in Settings > Businesses.')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'WordPress publish failed'
      if (msg.includes('not configured')) {
        toast.error('Configure WordPress in Settings > Businesses first.')
      } else {
        toast.error(msg + '. Check your credentials in Settings > Businesses.')
      }
    } finally {
      setIsPublishing(false)
    }
  }, [editedWaterfall, topic, selectedWpSite, wpSites])

  // Resolve content + image for a given social platform (used by confirmation + actual publish)
  const resolvePublishData = useCallback((platform: SocialPlatform) => {
    if (!editedWaterfall) return { content: '', imageUrl: undefined as string | undefined }
    const map: Record<PlatformKey, string> = {
      facebook: editedWaterfall.facebook,
      instagram: editedWaterfall.instagram,
      linkedin: editedWaterfall.linkedin,
      youtube_script: editedWaterfall.youtube_script,
      youtube_short: editedWaterfall.youtube_short,
      blog_post: editedWaterfall.blog_post,
    }
    let content = ''
    if (platform === 'facebook') content = map.facebook
    else if (platform === 'linkedin') content = map.linkedin
    else if (platform === 'x') content = map[activeTab].slice(0, 280)
    else if (platform === 'instagram') content = map.instagram

    const imgMapping: Record<SocialPlatform, string> = { facebook: 'facebook', instagram: 'instagram', linkedin: 'linkedin', x: 'facebook' }
    const imgKey = imgMapping[platform] || platform
    const imgData = generatedImages[imgKey]
    const imageUrl = imgData?.id ? getContentImageUrl(imgData.id) : undefined
    return { content, imageUrl }
  }, [editedWaterfall, activeTab, generatedImages])

  // Show confirmation modal instead of publishing directly
  const handleRequestPublish = useCallback((target: 'wordpress' | SocialPlatform) => {
    setPublishMenuOpen(false)
    if (target === 'wordpress') {
      if (!editedWaterfall) return
      setPublishConfirm({
        target: 'wordpress',
        platformLabel: 'WordPress (Draft)',
        content: editedWaterfall.blog_post,
        imageUrl: undefined,
      })
    } else {
      const { content, imageUrl } = resolvePublishData(target)
      const name = target === 'x' ? 'X (Twitter)' : target.charAt(0).toUpperCase() + target.slice(1)
      setPublishConfirm({ target, platformLabel: name, content, imageUrl })
    }
  }, [editedWaterfall, resolvePublishData])

  // Actually publish after user confirms
  const handleConfirmedPublish = useCallback(async () => {
    if (!publishConfirm || !editedWaterfall) return
    const { target } = publishConfirm

    if (target === 'wordpress') {
      setPublishConfirm(null)
      handlePublishToWordPress()
      return
    }

    // Social publish
    const platform = target as SocialPlatform
    setSocialPublishing(platform)
    setPublishConfirm(null)
    const { content, imageUrl } = resolvePublishData(platform)

    try {
      const result = await publishToSocial(platform, content, imageUrl)
      if (result.success) {
        const name = platform === 'x' ? 'X' : platform.charAt(0).toUpperCase() + platform.slice(1)
        toast.success(`Published to ${name}!`)
        if (contentEntryId) {
          try {
            await recordPublish({
              content_entry_id: contentEntryId,
              platform,
              platform_post_id: result.post_id || undefined,
              status: 'success',
            })
          } catch { /* non-critical */ }
        }
      } else {
        toast.error(result.error || `Failed to publish to ${platform}`)
      }
    } catch {
      toast.error(`Failed to publish to ${platform}. Make sure your account is connected in Settings.`)
    } finally {
      setSocialPublishing(null)
    }
  }, [publishConfirm, editedWaterfall, resolvePublishData, contentEntryId, handlePublishToWordPress])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">ContentHub</h1>
          <p className="text-slate-600">Generate a content waterfall for all your platforms</p>
        </div>
        <button
          onClick={() => {
            const el = document.getElementById('content-library')
            if (el) el.scrollIntoView({ behavior: 'smooth' })
          }}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
        >
          <BookOpen className="w-4 h-4" />
          Library
        </button>
      </div>

      {/* Business Context Selectors */}
      {currentBusiness && (audiences.length > 0 || contentTypes.length > 0) && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-medium text-slate-700">Creating content for:</span>
            <span className="text-sm font-semibold text-primary-600">{currentBusiness.name}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {audiences.length > 0 && (
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Target Audience</label>
                <select
                  value={selectedAudience || ''}
                  onChange={(e) => setSelectedAudience(e.target.value || null)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">All Audiences</option>
                  {audiences.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}
            {contentTypes.length > 0 && (
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Content Type</label>
                <select
                  value={selectedContentType || ''}
                  onChange={(e) => setSelectedContentType(e.target.value || null)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Any Type</option>
                  {contentTypes.map((ct) => (
                    <option key={ct.id} value={ct.id}>{ct.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Source Input Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setSourceMode('text')}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              sourceMode === 'text'
                ? 'bg-primary-100 text-primary-700'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Upload className="w-4 h-4" />
            Paste Text
          </button>
          <button
            onClick={() => setSourceMode('url')}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              sourceMode === 'url'
                ? 'bg-primary-100 text-primary-700'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Link className="w-4 h-4" />
            Paste URL
          </button>
        </div>

        {sourceMode === 'text' ? (
          <textarea
            rows={5}
            placeholder="Paste your source content here — a blog post, a story about a deal, notes from a seller call..."
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          />
        ) : (
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="https://..."
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button
              onClick={handleScrapeUrl}
              disabled={isScraping}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {isScraping ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Fetching...
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4" />
                  Fetch Content
                </>
              )}
            </button>
          </div>
        )}

        <div className="mt-4">
          <label className="text-sm font-medium text-slate-700 mb-1 block">Topic (optional)</label>
          <input
            type="text"
            placeholder="e.g. How to sell your house fast in Houston"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* Tone Override */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <label className="text-sm font-medium text-slate-700 mb-2 block">Content Tone (optional override)</label>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {[
              { value: 'Professional & Educational', label: 'Professional' },
              { value: 'Casual & Conversational', label: 'Casual' },
              { value: 'Motivational & Inspiring', label: 'Motivational' },
              { value: 'Direct & No-Nonsense', label: 'Direct' },
            ].map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => setSelectedTone(selectedTone === preset.value ? null : preset.value)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  selectedTone === preset.value
                    ? 'bg-primary-500 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Or type a custom tone..."
            value={
              selectedTone && !['Professional & Educational', 'Casual & Conversational', 'Motivational & Inspiring', 'Direct & No-Nonsense'].includes(selectedTone)
                ? selectedTone
                : ''
            }
            onChange={(e) => setSelectedTone(e.target.value || null)}
            className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          />
          <p className="text-xs text-slate-400 mt-1">Leave blank to use your default profile tone from Settings</p>
        </div>

        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate Content Waterfall
            </>
          )}
        </button>

      </div>

      {/* Waterfall Output Section */}
      {editedWaterfall && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1 border-b border-slate-200 overflow-x-auto flex-1">
              {PLATFORMS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setActiveTab(p.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap transition-colors ${
                    activeTab === p.key
                      ? 'border-b-2 border-primary-500 text-primary-600 font-medium'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  <span>{p.emoji}</span>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-green-600 font-medium">Editable - tweak before publishing</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">
                {editedWaterfall[activeTab].length} chars
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(editedWaterfall[activeTab])
                  setCopiedField('waterfall')
                  setTimeout(() => setCopiedField(null), 1500)
                }}
                className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {copiedField === 'waterfall' ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <textarea
            rows={10}
            value={editedWaterfall[activeTab]}
            onChange={(e) =>
              setEditedWaterfall((prev) =>
                prev ? { ...prev, [activeTab]: e.target.value } : prev
              )
            }
            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm text-slate-700 resize-y min-h-[200px] font-sans"
          />

          <div className="flex gap-2 flex-wrap mt-4">
            <button
              onClick={() => handleCopy(activeTab)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
            >
              {copiedTab === activeTab ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiedTab === activeTab ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={handleGenerateImages}
              disabled={isGeneratingImages}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              {isGeneratingImages ? <Loader2 className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
              Generate Images
            </button>
            {/* Publish Dropdown */}
            <div className="relative">
              <button
                onClick={() => setPublishMenuOpen(!publishMenuOpen)}
                disabled={isPublishing || socialPublishing !== null}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50"
              >
                {(isPublishing || socialPublishing) ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Share2 className="w-4 h-4" />
                )}
                Publish
                <ChevronDown className="w-3 h-3 ml-1" />
              </button>

              {publishMenuOpen && (
                <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-20">
                  {/* WordPress - show each site if multiple, or legacy single option */}
                  {wpSites.length > 1 ? (
                    <>
                      {wpSites.map((site) => (
                        <button
                          key={site.id}
                          onClick={() => {
                            setSelectedWpSite(site.id)
                            handleRequestPublish('wordpress')
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <ExternalLink className="w-4 h-4 text-slate-500" />
                          <span>WordPress: {site.label}</span>
                        </button>
                      ))}
                    </>
                  ) : (
                    <button
                      onClick={() => handleRequestPublish('wordpress')}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4 text-slate-500" />
                      <span>WordPress (Draft)</span>
                    </button>
                  )}

                  <div className="border-t border-slate-100 my-1" />

                  {/* Facebook */}
                  <button
                    onClick={() => handleRequestPublish('facebook')}
                    disabled={!socialStatuses?.facebook.connected}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="w-4 h-4 flex items-center justify-center text-blue-600 font-bold text-xs">f</span>
                    <span>Facebook</span>
                    {socialStatuses?.facebook.connected ? (
                      <span className="ml-auto text-xs text-green-600">Connected</span>
                    ) : (
                      <span className="ml-auto text-xs text-slate-400">Not connected</span>
                    )}
                  </button>

                  {/* LinkedIn */}
                  <button
                    onClick={() => handleRequestPublish('linkedin')}
                    disabled={!socialStatuses?.linkedin.connected}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="w-4 h-4 flex items-center justify-center text-blue-700 font-bold text-xs">in</span>
                    <span>LinkedIn</span>
                    {socialStatuses?.linkedin.connected ? (
                      <span className="ml-auto text-xs text-green-600">Connected</span>
                    ) : (
                      <span className="ml-auto text-xs text-slate-400">Not connected</span>
                    )}
                  </button>

                  {/* X (Twitter) */}
                  <button
                    onClick={() => handleRequestPublish('x')}
                    disabled={!socialStatuses?.x.connected}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="w-4 h-4 flex items-center justify-center text-slate-900 font-bold text-xs">X</span>
                    <span>X (Twitter)</span>
                    {socialStatuses?.x.connected ? (
                      <span className="ml-auto text-xs text-green-600">Connected</span>
                    ) : (
                      <span className="ml-auto text-xs text-slate-400">Not connected</span>
                    )}
                  </button>

                  {/* Instagram */}
                  <button
                    onClick={() => handleRequestPublish('instagram')}
                    disabled={!socialStatuses?.instagram.connected}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="w-4 h-4 flex items-center justify-center text-pink-600 font-bold text-xs">IG</span>
                    <span>Instagram</span>
                    {socialStatuses?.instagram.connected ? (
                      <span className="ml-auto text-xs text-green-600">Connected</span>
                    ) : (
                      <span className="ml-auto text-xs text-slate-400">Not connected</span>
                    )}
                  </button>

                  {(!socialStatuses?.facebook.connected && !socialStatuses?.linkedin.connected && !socialStatuses?.x.connected && !socialStatuses?.instagram.connected) && (
                    <>
                      <div className="border-t border-slate-100 my-1" />
                      <a
                        href="/settings"
                        className="block px-4 py-2 text-xs text-primary-600 hover:underline"
                      >
                        Connect accounts in Settings
                      </a>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Generated Images Section */}
      {Object.keys(generatedImages).length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Image className="w-5 h-5 text-primary-500" />
            Generated Images
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Object.entries(generatedImages).map(([platform, imgData]) => {
              const platLabel = platform.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
              return (
                <div key={platform} className="bg-slate-50 rounded-lg overflow-hidden border border-slate-200">
                  {imgData.id ? (
                    <img
                      src={getContentImageUrl(imgData.id)}
                      alt={`${platLabel} image`}
                      className="w-full object-cover"
                      style={{ aspectRatio: `${imgData.width}/${imgData.height}` }}
                    />
                  ) : (
                    <div
                      className="w-full bg-slate-100 flex items-center justify-center text-slate-400 text-xs"
                      style={{ aspectRatio: `${imgData.width}/${imgData.height}` }}
                    >
                      {imgData.error || 'No image'}
                    </div>
                  )}
                  <div className="p-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-slate-700">{platLabel}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{imgData.width}x{imgData.height}</p>
                      </div>
                      <button
                        onClick={() => handleRegenerateImage(platform)}
                        disabled={regeneratingPlatform === platform}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-colors disabled:opacity-50"
                        title="Regenerate this image"
                      >
                        {regeneratingPlatform === platform ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                        Redo
                      </button>
                    </div>
                    {imgData.prompt && (
                      <details className="mt-1">
                        <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">
                          Prompt
                        </summary>
                        <p className="text-xs text-slate-500 mt-1">{imgData.prompt}</p>
                      </details>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Publish History */}
      <PublishHistory
        entries={publishHistory}
        onClear={() => setPublishHistory([])}
      />

      {/* Content Library — database-backed with semantic search */}
      <ContentLibrary />

      {/* ── Publish Confirmation Modal ── */}
      {publishConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-primary-500" />
                <h3 className="text-lg font-semibold text-slate-800">Review Before Publishing</h3>
              </div>
              <button
                onClick={() => setPublishConfirm(null)}
                className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Publishing to</span>
                <p className="text-sm font-semibold text-slate-800 mt-1">{publishConfirm.platformLabel}</p>
              </div>

              <div>
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Content preview</span>
                <div className="mt-1 bg-slate-50 rounded-lg p-3 max-h-48 overflow-y-auto">
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{publishConfirm.content}</p>
                </div>
                <p className="text-xs text-slate-400 mt-1">{publishConfirm.content.length} characters</p>
              </div>

              {publishConfirm.imageUrl && (
                <div>
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Image</span>
                  <img
                    src={publishConfirm.imageUrl}
                    alt="Publish preview"
                    className="mt-1 rounded-lg max-h-40 object-cover border border-slate-200"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 p-4 border-t border-slate-200">
              <button
                onClick={() => setPublishConfirm(null)}
                className="flex-1 px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmedPublish}
                disabled={isPublishing || socialPublishing !== null}
                className="flex-1 px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50"
              >
                {(isPublishing || socialPublishing) ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Publishing...
                  </span>
                ) : (
                  'Confirm Publish'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
