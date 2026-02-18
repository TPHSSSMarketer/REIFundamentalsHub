import { useState } from 'react'
import {
  PenTool,
  Globe,
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  Save,
} from 'lucide-react'
import { toast } from 'sonner'

type ContentType = 'social' | 'website'

interface ContentTemplate {
  id: string
  name: string
  type: ContentType
  content: string
}

const contentTypes = [
  { id: 'social', label: 'Social Post', icon: PenTool, color: 'bg-purple-100 text-purple-600' },
  { id: 'website', label: 'Website Post', icon: Globe, color: 'bg-primary-100 text-primary-600' },
]

const savedTemplates: ContentTemplate[] = [
  { id: '1', name: 'We Buy Houses Post', type: 'social', content: 'Looking to sell your property FAST? We buy houses in ANY condition...' },
  { id: '2', name: 'Blog: Selling Tips', type: 'website', content: '5 Tips for Selling Your Home Fast in Today\'s Market...' },
  { id: '3', name: 'Cash Offer Promo', type: 'social', content: 'Get a fair cash offer for your home in 24 hours...' },
]

export default function ContentHub() {
  const [selectedType, setSelectedType] = useState<ContentType>('social')
  const [prompt, setPrompt] = useState('')
  const [generatedContent, setGeneratedContent] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  const generateContent = async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a prompt')
      return
    }

    setIsGenerating(true)

    // Simulate AI generation
    await new Promise((resolve) => setTimeout(resolve, 1500))

    const templates: Record<ContentType, string> = {
      social: `🏠 Attention Homeowners!\n\nLooking to sell your property FAST?\n\nI'm a local investor buying homes in ANY condition:\n\n✅ Cash offers in 24 hours\n✅ Close in as little as 7 days\n✅ No repairs needed\n✅ No agent fees or commissions\n✅ We handle ALL paperwork\n\nWhether you're facing foreclosure, inherited a property, or just need to move quickly - I can help!\n\nDM me "CASH" or comment below to learn more! 👇\n\n#RealEstate #WeBuyHouses #CashOffer #HomeSeller`,
      website: `<h2>Sell Your Home Fast for Cash - No Repairs, No Hassle</h2>\n\n<p>Are you a homeowner looking to sell quickly? Whether you're dealing with an inherited property, facing foreclosure, going through a divorce, or simply need to relocate fast, we can help.</p>\n\n<h3>Why Choose Us?</h3>\n<ul>\n<li><strong>Fair Cash Offers</strong> - We provide competitive cash offers within 24 hours of viewing your property.</li>\n<li><strong>Close on Your Timeline</strong> - Need to close in 7 days? 30 days? We work around YOUR schedule.</li>\n<li><strong>No Repairs Needed</strong> - We buy houses as-is. Don't spend a dime on repairs or renovations.</li>\n<li><strong>Zero Fees</strong> - No agent commissions, no closing costs, no hidden fees.</li>\n</ul>\n\n<h3>How It Works</h3>\n<ol>\n<li>Contact us with your property details</li>\n<li>We schedule a quick walkthrough</li>\n<li>Receive a fair, no-obligation cash offer</li>\n<li>Close on your timeline and get paid</li>\n</ol>\n\n<p><strong>Ready to get started?</strong> Fill out our form or call us today for your free, no-obligation cash offer.</p>`,
    }

    setGeneratedContent(templates[selectedType])
    setIsGenerating(false)
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedContent)
    setCopied(true)
    toast.success('Copied to clipboard!')
    setTimeout(() => setCopied(false), 2000)
  }

  const saveTemplate = () => {
    toast.success('Template saved!')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">ContentHub</h1>
        <p className="text-slate-600">
          Powered by <span className="font-semibold text-primary-700">AdFuel</span> — Generate social media and website content with AI
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Content Generator */}
        <div className="lg:col-span-2 space-y-4">
          {/* Content Type Selection */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h2 className="text-sm font-medium text-slate-700 mb-3">Content Type</h2>
            <div className="grid grid-cols-2 gap-2">
              {contentTypes.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setSelectedType(type.id as ContentType)}
                  className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                    selectedType === type.id
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className={`p-1.5 rounded ${type.color}`}>
                    <type.icon className="w-4 h-4" />
                  </div>
                  <span className="font-medium text-sm text-slate-700">{type.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Prompt Input */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h2 className="text-sm font-medium text-slate-700 mb-3">What do you want to create?</h2>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                selectedType === 'social'
                  ? 'e.g., Write a Facebook post targeting motivated sellers in the Dallas area...'
                  : 'e.g., Write a landing page section about our cash home buying process...'
              }
              className="w-full h-24 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
            <div className="flex justify-end mt-3">
              <button
                onClick={generateContent}
                disabled={isGenerating}
                className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Content
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Generated Content */}
          {generatedContent && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-slate-700">Generated Content</h2>
                <div className="flex gap-2">
                  <button
                    onClick={copyToClipboard}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={saveTemplate}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-100 text-primary-700 rounded-lg hover:bg-primary-200 transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    Save
                  </button>
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans">
                  {generatedContent}
                </pre>
              </div>
              {selectedType === 'website' && (
                <p className="text-xs text-slate-500 mt-2">
                  HTML content can be pasted directly into your website editor.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Saved Templates */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 h-fit">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Saved Templates</h2>
          <div className="space-y-3">
            {savedTemplates.map((template) => {
              const typeInfo = contentTypes.find((t) => t.id === template.type)
              return (
                <button
                  key={template.id}
                  onClick={() => {
                    setSelectedType(template.type)
                    setGeneratedContent(template.content)
                  }}
                  className="w-full flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:border-primary-300 hover:bg-primary-50 transition-colors text-left"
                >
                  {typeInfo && (
                    <div className={`p-1.5 rounded shrink-0 ${typeInfo.color}`}>
                      <typeInfo.icon className="w-4 h-4" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-medium text-slate-800 text-sm">{template.name}</h3>
                    <p className="text-xs text-slate-500 truncate">{template.content}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
