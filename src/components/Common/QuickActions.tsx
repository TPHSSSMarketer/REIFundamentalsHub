import {
  Plus,
  UserPlus,
  MessageSquare,
  Package,
  Mic,
  PenTool,
} from 'lucide-react'
import { useStore } from '@/hooks/useStore'

export default function QuickActions() {
  const { setNewDealModalOpen, setNewContactModalOpen, setSMSModalOpen } = useStore()

  const actions = [
    {
      label: 'New Opportunity',
      icon: Plus,
      onClick: () => setNewDealModalOpen(true),
      color: 'bg-primary-500 hover:bg-primary-600',
    },
    {
      label: 'Add Contact',
      icon: UserPlus,
      onClick: () => setNewContactModalOpen(true),
      color: 'bg-success-500 hover:bg-success-600',
    },
    {
      label: 'Send SMS',
      icon: MessageSquare,
      onClick: () => setSMSModalOpen(true),
      color: 'bg-warning-500 hover:bg-warning-600',
    },
    {
      label: 'Track Package',
      icon: Package,
      onClick: () => window.open('/integrations#usps', '_self'),
      color: 'bg-slate-500 hover:bg-slate-600',
    },
    {
      label: 'Voice Agent',
      icon: Mic,
      onClick: () => window.open('/integrations#voicehub', '_self'),
      color: 'bg-purple-500 hover:bg-purple-600',
    },
    {
      label: 'Create Content',
      icon: PenTool,
      onClick: () => window.open('/integrations#contenthub', '_self'),
      color: 'bg-pink-500 hover:bg-pink-600',
    },
  ]

  return (
    <div className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 py-3">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium whitespace-nowrap transition-colors ${action.color}`}
          >
            <action.icon className="w-4 h-4" />
            {action.label}
          </button>
        ))}
      </div>
    </div>
  )
}
