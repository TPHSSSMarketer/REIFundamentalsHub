import { ReactNode } from 'react'
import Sidebar from './Sidebar'
import QuickActions from './QuickActions'
import NewDealModal from './NewDealModal'
import NewContactModal from './NewContactModal'
import SMSModal from './SMSModal'
import { useStore } from '@/hooks/useStore'
import { useDemoMode } from '@/hooks/useDemoMode'
import { Beaker, X } from 'lucide-react'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const isSidebarCollapsed = useStore((s) => s.isSidebarCollapsed)
  const { isDemoMode, disableDemoMode } = useDemoMode()

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />

      <main
        className={`transition-all duration-300 ${
          isSidebarCollapsed ? 'ml-16' : 'ml-64'
        }`}
      >
        {/* Demo Mode Banner */}
        {isDemoMode && (
          <div className="bg-gradient-to-r from-purple-500 to-primary-500 text-white px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Beaker className="w-4 h-4" />
              <span className="text-sm font-medium">
                Demo Mode - Using sample data. Connect to GHL for real data.
              </span>
            </div>
            <button
              onClick={disableDemoMode}
              className="p-1 hover:bg-white/20 rounded transition-colors"
              title="Exit demo mode"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Quick Actions Bar */}
        <QuickActions />

        {/* Page Content */}
        <div className="p-6">{children}</div>
      </main>

      {/* Global Modals */}
      <NewDealModal />
      <NewContactModal />
      <SMSModal />
    </div>
  )
}
