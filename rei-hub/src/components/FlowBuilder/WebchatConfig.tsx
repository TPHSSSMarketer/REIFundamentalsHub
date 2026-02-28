import { useState } from 'react'
import { Code2, Copy, Check, ExternalLink } from 'lucide-react'
import { cn } from '@/utils/helpers'
import { useFlows } from '@/hooks/useFlowBuilder'

export default function WebchatConfig() {
  const { data: flows } = useFlows()
  const [selectedFlowId, setSelectedFlowId] = useState<string>('')
  const [copied, setCopied] = useState(false)

  const publishedFlows = (flows || []).filter((f: any) => f.status === 'published')

  const apiBase = import.meta.env.VITE_REI_SERVER_URL || 'https://api.reifundamentalshub.com'

  const embedCode = selectedFlowId
    ? `<script
  src="${apiBase}/chat-widget.js"
  data-flow-id="${selectedFlowId}"
  data-api-url="${apiBase}"
  data-position="bottom-right"
  data-primary-color="#1e40af"
  data-title="Chat with us"
  defer>
</script>`
    : ''

  const handleCopy = () => {
    if (!embedCode) return
    navigator.clipboard.writeText(embedCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
            <Code2 className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Chat Widget Embed Code</h3>
            <p className="text-sm text-slate-500">
              Add this snippet to any website to enable the AI chat widget.
            </p>
          </div>
        </div>

        {/* Flow selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Select a Published Flow
          </label>
          {!publishedFlows.length ? (
            <p className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
              No published flows yet. Publish a flow first to generate an embed code.
            </p>
          ) : (
            <select
              value={selectedFlowId}
              onChange={(e) => setSelectedFlowId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
            >
              <option value="">Choose a flow...</option>
              {publishedFlows.map((flow: any) => (
                <option key={flow.id} value={flow.id}>
                  {flow.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Embed code */}
        {embedCode && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-slate-700">Embed Code</label>
              <button
                onClick={handleCopy}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  copied
                    ? 'bg-green-100 text-green-700'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="bg-slate-900 text-green-400 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">
              {embedCode}
            </pre>

            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>How to use:</strong> Paste this code just before the closing{' '}
                <code className="bg-blue-100 px-1 rounded text-xs">&lt;/body&gt;</code> tag on any
                webpage where you want the chat widget to appear.
              </p>
            </div>
          </div>
        )}

        {/* Customization options info */}
        <div className="mt-6 border-t border-slate-100 pt-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Customization Options</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-50 rounded-lg px-3 py-2">
              <span className="font-mono text-primary-600">data-position</span>
              <p className="text-slate-500 mt-0.5">bottom-right, bottom-left</p>
            </div>
            <div className="bg-slate-50 rounded-lg px-3 py-2">
              <span className="font-mono text-primary-600">data-primary-color</span>
              <p className="text-slate-500 mt-0.5">Any hex color</p>
            </div>
            <div className="bg-slate-50 rounded-lg px-3 py-2">
              <span className="font-mono text-primary-600">data-title</span>
              <p className="text-slate-500 mt-0.5">Widget header text</p>
            </div>
            <div className="bg-slate-50 rounded-lg px-3 py-2">
              <span className="font-mono text-primary-600">data-greeting</span>
              <p className="text-slate-500 mt-0.5">Initial bot message</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
