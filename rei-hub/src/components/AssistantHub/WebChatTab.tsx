import { MessageCircle } from 'lucide-react'

export default function WebChatTab() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-md">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center">
            <MessageCircle className="w-8 h-8 text-slate-400" />
          </div>
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Web Chat</h2>
        <p className="text-sm text-slate-600 mb-4">
          Configure your website chat widget to capture leads automatically and engage visitors in real time.
        </p>
        <p className="text-xs text-slate-500 italic">
          Coming soon
        </p>
      </div>
    </div>
  )
}
