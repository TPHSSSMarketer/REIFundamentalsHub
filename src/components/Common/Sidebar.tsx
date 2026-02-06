import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Kanban,
  Users,
  Headphones,
  PenTool,
  CalendarCheck,
  Calculator,
  Hammer,
  Map,
  Settings,
  ChevronLeft,
} from 'lucide-react'
import { useStore } from '@/hooks/useStore'
import { cn } from '@/utils/helpers'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/pipeline', icon: Kanban, label: 'Pipeline' },
  { to: '/contacts', icon: Users, label: 'Contacts' },
  { to: '/assistanthub', icon: Headphones, label: 'AssistantHub' },
  { to: '/contenthub', icon: PenTool, label: 'ContentHub' },
  { to: '/scheduler', icon: CalendarCheck, label: 'Smart Scheduler' },
  { to: '/deal-analyzer', icon: Calculator, label: 'Deal Analyzer' },
  { to: '/repair-estimator', icon: Hammer, label: 'Repair Estimator' },
  { to: '/market-map', icon: Map, label: 'Market Heatmap' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function Sidebar() {
  const { isSidebarCollapsed, toggleSidebar } = useStore()

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-full bg-white border-r border-slate-200 transition-all duration-300 z-40',
        isSidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="h-36 flex items-center justify-between px-3 border-b border-slate-200">
        <div className="flex items-center min-w-0">
          <img
            src="/logo.png"
            alt="REI Fundamentals Hub"
            className={cn(
              'object-contain',
              isSidebarCollapsed ? 'w-12 h-12' : 'h-[125px] max-w-[220px]'
            )}
          />
        </div>
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <ChevronLeft
            className={cn(
              'w-5 h-5 text-slate-500 transition-transform',
              isSidebarCollapsed && 'rotate-180'
            )}
          />
        </button>
      </div>

      {/* Navigation */}
      <nav className="p-2 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                isActive
                  ? 'bg-primary-50 text-primary-600'
                  : 'text-slate-600 hover:bg-slate-100'
              )
            }
          >
            <item.icon className="w-5 h-5 shrink-0" />
            {!isSidebarCollapsed && (
              <span className="font-medium">{item.label}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      {!isSidebarCollapsed && (
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-200">
          <p className="text-xs text-primary-800 font-semibold text-center">
            REI Fundamentals Hub
          </p>
          <p className="text-[10px] text-slate-400 text-center mt-0.5">
            Power Up Your Real Estate Business
          </p>
        </div>
      )}
    </aside>
  )
}
