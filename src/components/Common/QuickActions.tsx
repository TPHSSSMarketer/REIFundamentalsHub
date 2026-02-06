import { Plus, UserPlus, MessageSquare } from 'lucide-react'
import { useStore } from '@/hooks/useStore'

export default function QuickActions() {
  const { setNewDealModalOpen, setNewContactModalOpen, setSMSModalOpen } = useStore()

  const actions = [
    {
      label: 'New Opportunity',
      icon: Plus,
      onClick: () => setNewDealModalOpen(true),
      color: 'bg-primary-800 hover:bg-primary-700',
    },
    {
      label: 'Add Contact',
      icon: UserPlus,
      onClick: () => setNewContactModalOpen(true),
      color: 'bg-primary-600 hover:bg-primary-500',
    },
    {
      label: 'Send SMS',
      icon: MessageSquare,
      onClick: () => setSMSModalOpen(true),
      color: 'bg-accent-600 hover:bg-accent-700',
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
