import { ReactNode } from 'react'
import Sidebar from './Sidebar'
import QuickActions from './QuickActions'
import NewDealModal from './NewDealModal'
import NewContactModal from './NewContactModal'
import SMSModal from './SMSModal'
import { useStore } from '@/hooks/useStore'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const isSidebarCollapsed = useStore((s) => s.isSidebarCollapsed)

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />

      <main
        className={`transition-all duration-300 ${
          isSidebarCollapsed ? 'ml-16' : 'ml-64'
        }`}
      >
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
