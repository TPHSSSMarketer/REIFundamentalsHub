import { Plus, UserPlus, MessageSquare, Search } from 'lucide-react'
import { useStore } from '@/hooks/useStore'

export default function QuickActions() {
  const { setNewDealModalOpen, setNewContactModalOpen, setSMSModalOpen, setCommandPaletteOpen } = useStore()

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

        {/* Search / Command Palette Button */}
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 rounded-lg text-slate-600 text-sm font-medium whitespace-nowrap transition-colors min-h-[40px] bg-slate-100 hover:bg-slate-200 ml-auto"
        >
          <Search className="w-4 h-4" />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-white border border-slate-200 rounded ml-1">
            Ctrl K
          </kbd>
        </button>
      </div>
    </div>
  )
}
