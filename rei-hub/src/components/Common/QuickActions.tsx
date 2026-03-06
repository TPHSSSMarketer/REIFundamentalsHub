import { Plus, UserPlus, MessageSquare } from 'lucide-react'
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
  ]

  return (
    <div className="sticky top-0 z-30 bg-white border-b border-slate-200 px-3 md:px-6 py-2 md:py-3">
      <div className="flex items-center gap-1.5 md:gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 rounded-lg text-white text-sm font-medium whitespace-nowrap transition-colors min-h-[40px] ${action.color}`}
          >
            <action.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{action.label}</span>
            <span className="sm:hidden">{action.label.split(' ').pop()}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
