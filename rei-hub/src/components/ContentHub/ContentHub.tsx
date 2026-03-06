import { useState, useCallback, useEffect } from 'react'
import { Link, Globe, Sparkles, Copy, Check, RefreshCw, BookOpen, Image, Upload, ExternalLink, Loader2, ChevronDown, Share2 } from 'lucide-react'
import DOMPurify from 'dompurify'
import { toast } from 'sonner'
import { aiGenerateWaterfall, aiGenerateImagePrompts, aiScrapeUrl, aiSaveContentToCloud, AiServiceError, ContentWaterfallOutput } from '@/services/aiService'
import PublishHistory, { PublishEntry } from './PublishHistory'
import { getAllSocialStatuses, publishToSocial, type SocialPlatform, type AllSocialStatuses } from '@/services/socialMediaApi'

type PlatformKey = 'facebook' | 'instagram' | 'linkedin' | 'youtube_script' | 'youtube_short' | 'blog_post'

interface SavedContent {
  id: string
  topic: string
  generatedAt: string
  content: ContentWaterfallOutput
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
  const [imagePrompts, setImagePrompts] = useState<string[]>([])
  const [isGeneratingImages, setIsGeneratingImages] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [library, setLibrary] = useState<SavedContent[]>(
    JSON.parse(localStorage.getItem('content_library') || '[]')
  )
  const [publishHistory, setPublishHistory] = useState<PublishEntry[]>([])
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [socialStatuses, setSocialStatuses] = useState<AllSocialStatuses | null>(null)
  const [publishMenuOpen, setPublishMenuOpen] = useState(false)
  const [socialPublishing, setSocialPublishing] = useState<SocialPlatform | null>(null)

  useEffect(() => {
    getAllSocialStatuses().then(setSocialStatuses).catch(() => {})
  }, [])

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
    setImagePrompts([])
    try {
      const result = await aiGenerateWaterfall({
        source_text: sourceText,
        topic: topic || sourceText.slice(0, 60),
      })
      setWaterfall(result.content)
      setActiveTab('facebook')

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
    if (!waterfall) return
    await navigator.clipboard.writeText(waterfall[key])
    setCopiedTab(key)
    setTimeout(() => setCopiedTab(null), 2000)
  }, [waterfall])

  const handleGenerateImages = useCallback(async () => {
    if (!waterfall || !topic) {
      toast.error('Generate content first.')
      return
    }
    setIsGeneratingImages(true)
    setImagePrompts([])
    const platformMap: Record<PlatformKey, string> = {
      facebook: 'facebook',
      instagram: 'instagram',
      linkedin: 'linkedin',
      youtube_script: 'youtube_thumbnail',
      youtube_short: 'youtube_thumbnail',
      blog_post: 'facebook',
    }
    const imagePlatform = platformMap[activeTab]
    try {
      const result = await aiGenerateImagePrompts(topic || 'real estate investing', imagePlatform)
      setImagePrompts(result.prompts)
    } catch (err) {
      if (err instanceof AiServiceError && err.status === 503) {
        toast.error('Image prompt generation is coming soon. Check back later.')
      } else if (err instanceof AiServiceError && err.status === 403) {
        toast.error('Image prompts are being upgraded. Check back soon.')
      } else {
        toast.error('Image prompt generation failed.')
      }
    } finally {
      setIsGeneratingImages(false)
    }
  }, [waterfall, topic, activeTab])

  const handleSaveToLibrary = useCallback(async () => {
    if (!waterfall) return
    const newItem: SavedContent = {
      id: Date.now().toString(),
      topic: topic || 'Untitled',
      generatedAt: new Date().toISOString(),
      content: waterfall,
    }
    const updated = [newItem, ...library]
    setLibrary(updated)
    localStorage.setItem('content_library', JSON.stringify(updated))
    toast.success('Saved to library.')
  }, [waterfall, topic, library])

  const handlePublishToWordPress = useCallback(async () => {
    if (!waterfall) return
    const wpUrl = localStorage.getItem('wp_url')
    const wpUsername = localStorage.getItem('wp_username')
    const wpAppPassword = localStorage.getItem('wp_app_password')
    if (!wpUrl || !wpUsername || !wpAppPassword) {
      toast.error('Configure WordPress in Settings first.')
      return
    }
    setIsPublishing(true)
    try {
      const token = btoa(wpUsername + ':' + wpAppPassword)
      const res = await fetch(wpUrl.replace(/\/$/, '') + '/wp-json/wp/v2/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Basic ' + token,
        },
        body: JSON.stringify({
          title: topic || 'New Post',
          content: waterfall.blog_post,
          status: 'draft',
        }),
      })
      if (res.ok) {
        toast.success('Draft published to WordPress!')
      } else {
        toast.error('WordPress publish failed. Check your credentials in Settings.')
      }
    } catch {
      toast.error('WordPress publish failed. Check your credentials in Settings.')
    } finally {
      setIsPublishing(false)
    }
  }, [waterfall, topic])

  const handlePublishToSocial = useCallback(async (platform: SocialPlatform) => {
    if (!waterfall) return
    setPublishMenuOpen(false)
    setSocialPublishing(platform)

    // Map the active ContentHub tab to the matching social content
    const platformContentMap: Record<PlatformKey, string> = {
      facebook: waterfall.facebook,
      instagram: waterfall.instagram,
      linkedin: waterfall.linkedin,
      youtube_script: waterfall.youtube_script,
      youtube_short: waterfall.youtube_short,
      blog_post: waterfall.blog_post,
    }

    // Pick the best content for the target social platform
    let content = ''
    if (platform === 'facebook') content = platformContentMap.facebook
    else if (platform === 'linkedin') content = platformContentMap.linkedin
    else if (platform === 'x') {
      // X has a 280-char limit — use the active tab but truncate
      content = platformContentMap[activeTab].slice(0, 280)
    } else if (platform === 'instagram') content = platformContentMap.instagram

    try {
      const result = await publishToSocial(platform, content)
      if (result.success) {
        const name = platform === 'x' ? 'X' : platform.charAt(0).toUpperCase() + platform.slice(1)
        toast.success(`Published to ${name}!`)
      } else {
        toast.error(result.error || `Failed to publish to ${platform}`)
      }
    } catch {
      toast.error(`Failed to publish to ${platform}. Make sure your account is connected in Settings.`)
    } finally {
      setSocialPublishing(null)
    }
  }, [waterfall, activeTab])

  return (
    <div className="space-y-6">
      {/* Coming Soon Banner */}
      <div className="flex items-center gap-3 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
        <span>AI content generation is being upgraded to native AI. Some features may be temporarily unavailable.</span>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Content Hub</h1>
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
          Library ({library.length})
        </button>
      </div>

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
      {waterfall && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex gap-1 border-b border-slate-200 mb-4 overflow-x-auto">
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

          <div className="flex items-center justify-end gap-2 mb-1">
            <span className="text-xs text-slate-400">
              {waterfall[activeTab].length} chars
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(waterfall[activeTab])
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

          <div className="bg-slate-50 rounded-lg p-4 min-h-[200px]">
            {activeTab === 'blog_post' ? (
              <div
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(waterfall[activeTab]) }}
                className="prose prose-sm max-w-none"
              />
            ) : (
              <pre className="whitespace-pre-wrap text-sm text-slate-700">{waterfall[activeTab]}</pre>
            )}
          </div>

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
              Image Prompts
            </button>
            <button
              onClick={handleSaveToLibrary}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              Save to Library
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
                  {/* WordPress */}
                  <button
                    onClick={() => { setPublishMenuOpen(false); handlePublishToWordPress() }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4 text-slate-500" />
                    <span>WordPress (Draft)</span>
                  </button>

                  <div className="border-t border-slate-100 my-1" />

                  {/* Facebook */}
                  <button
                    onClick={() => handlePublishToSocial('facebook')}
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
                    onClick={() => handlePublishToSocial('linkedin')}
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
                    onClick={() => handlePublishToSocial('x')}
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
                    onClick={() => handlePublishToSocial('instagram')}
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

      {/* Image Prompts Section */}
      {imagePrompts.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Image Prompts for {PLATFORMS.find((p) => p.key === activeTab)?.label}
          </h2>
          <div className="space-y-3">
            {imagePrompts.map((prompt, i) => (
              <div key={i} className="bg-slate-50 rounded-lg p-3 flex justify-between items-start gap-3">
                <p className="text-sm text-slate-700">
                  <span className="font-medium text-slate-800">{i + 1}.</span> {prompt}
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-400">{prompt.length} chars</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(prompt)
                      setCopiedField(`prompt-${i}`)
                      setTimeout(() => setCopiedField(null), 1500)
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {copiedField === `prompt-${i}` ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Publish History */}
      <PublishHistory
        entries={publishHistory}
        onClear={() => setPublishHistory([])}
      />

      {/* Content Library Section */}
      {library.length > 0 && (
        <div id="content-library" className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-lg font-semibold text-slate-800">Content Library</h2>
            <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full">
              {library.length} saved
            </span>
          </div>
          <div className="space-y-3">
            {library.slice(0, 10).map((item) => (
              <div key={item.id} className="bg-slate-50 rounded-lg p-3 flex justify-between items-start">
                <div>
                  <p className="font-medium text-slate-800 text-sm">{item.topic}</p>
                  <p className="text-xs text-slate-500">{new Date(item.generatedAt).toLocaleDateString()}</p>
                </div>
                <button
                  onClick={() => {
                    setWaterfall(item.content)
                    setTopic(item.topic)
                    setActiveTab('facebook')
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs bg-primary-100 text-primary-700 rounded-lg hover:bg-primary-200 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Load
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
