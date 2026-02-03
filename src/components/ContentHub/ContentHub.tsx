import { useState } from 'react'
import {
  PenTool,
  MessageSquare,
  Mail,
  FileText,
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  Save,
} from 'lucide-react'
import { toast } from 'sonner'

type ContentType = 'sms' | 'email' | 'script' | 'social'

interface ContentTemplate {
  id: string
  name: string
  type: ContentType
  content: string
}

const contentTypes = [
  { id: 'sms', label: 'SMS', icon: MessageSquare, color: 'bg-warning-100 text-warning-600' },
  { id: 'email', label: 'Email', icon: Mail, color: 'bg-primary-100 text-primary-600' },
  { id: 'script', label: 'Call Script', icon: FileText, color: 'bg-success-100 text-success-600' },
  { id: 'social', label: 'Social Post', icon: PenTool, color: 'bg-purple-100 text-purple-600' },
]

const savedTemplates: ContentTemplate[] = [
  { id: '1', name: 'Initial Outreach', type: 'sms', content: 'Hi {name}, I noticed your property at {address}...' },
  { id: '2', name: 'Follow-up Email', type: 'email', content: 'Subject: Quick question about your property...' },
  { id: '3', name: 'Cold Call Intro', type: 'script', content: 'Hi, is this {name}? Great! My name is...' },
]

export default function ContentHub() {
  const [selectedType, setSelectedType] = useState<ContentType>('sms')
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
      sms: `Hi {first_name}, I came across your property at {address} and wanted to reach out. I'm a local investor and I help homeowners like you get cash offers quickly. Would you be open to a quick chat? Reply STOP to opt out.`,
      email: `Subject: Cash Offer for Your Property at {address}\n\nHi {first_name},\n\nI hope this message finds you well. I'm reaching out because I'm actively looking to purchase properties in your area.\n\nI noticed your property at {address} and wanted to see if you'd consider a cash offer. Here's what I can provide:\n\n• Fair cash offer within 24 hours\n• Close on your timeline\n• No repairs needed - I buy as-is\n• No agent commissions or fees\n\nWould you be open to a brief conversation?\n\nBest regards`,
      script: `OPENING:\n"Hi, is this {first_name}? Great! My name is [Your Name], and I'm a local real estate investor. I noticed your property at {address} and wanted to reach out."\n\nQUALIFYING QUESTIONS:\n1. "Are you the owner of this property?"\n2. "Have you thought about selling?"\n3. "What would need to happen for you to consider an offer?"\n\nVALUE PROPOSITION:\n"I buy properties as-is for cash. No repairs, no commissions, and we can close whenever works for you."\n\nCLOSE:\n"I'd love to see the property and make you a fair offer. Would tomorrow or the next day work better for a quick visit?"`,
      social: `🏠 Attention Homeowners!\n\nLooking to sell your property FAST?\n\nI'm a local investor buying homes in ANY condition:\n\n✅ Cash offers in 24 hours\n✅ Close in as little as 7 days\n✅ No repairs needed\n✅ No agent fees or commissions\n✅ We handle ALL paperwork\n\nWhether you're facing foreclosure, inherited a property, or just need to move quickly - I can help!\n\nDM me "CASH" or comment below to learn more! 👇\n\n#RealEstate #WeBuyHouses #CashOffer #HomeSeller`,
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
        <p className="text-slate-600">Generate marketing content with AI assistance</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Content Generator */}
        <div className="lg:col-span-2 space-y-4">
          {/* Content Type Selection */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h2 className="text-sm font-medium text-slate-700 mb-3">Content Type</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
              placeholder="e.g., Write a friendly SMS to follow up with a motivated seller who mentioned they're behind on payments..."
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
              <p className="text-xs text-slate-500 mt-2">
                Variables like {'{first_name}'} and {'{address}'} will be replaced automatically when sending.
              </p>
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
