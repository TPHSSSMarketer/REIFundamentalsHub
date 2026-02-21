import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Kanban,
  Users,
  MapPin,
  Building2,
  Headphones,
  PenTool,
  CreditCard,
  Settings,
  ChevronLeft,
  Home,
  Shield,
  ShieldCheck,
  FileText,
  Mail,
} from 'lucide-react'
import { useStore } from '@/hooks/useStore'
import { useBilling } from '@/hooks/useBilling'
import { getCurrentUser } from '@/services/auth'
import { cn } from '@/utils/helpers'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/pipeline', icon: Kanban, label: 'Pipeline' },
  { to: '/contacts', icon: Users, label: 'Contacts' },
  { to: '/markets', icon: MapPin, label: 'Markets' },
  { to: '/portfolio', icon: Building2, label: 'Portfolio' },
  { to: '/proof-of-funds', icon: ShieldCheck, label: 'Proof of Funds' },
  { to: '/documents', icon: FileText, label: 'Documents' },
  { to: '/email-marketing', icon: Mail, label: 'Email Marketing' },
  { to: '/assistanthub', icon: Headphones, label: 'AssistantHub' },
  { to: '/contenthub', icon: PenTool, label: 'ContentHub' },
  { to: '/billing', icon: CreditCard, label: 'Billing' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function Sidebar() {
  const { isSidebarCollapsed, toggleSidebar } = useStore()
  const { billingStatus } = useBilling()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    getCurrentUser().then((user) => {
      if (user && user.is_admin) setIsAdmin(true)
    })
  }, [])

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-full bg-white border-r border-slate-200 transition-all duration-300 z-40',
        isSidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-800 rounded-lg flex items-center justify-center">
            <Home className="w-5 h-5 text-white" />
          </div>
          {!isSidebarCollapsed && (
            <div className="flex flex-col">
              <span className="font-bold text-primary-800 text-sm leading-tight">REI Fundamentals</span>
              <span className="text-[10px] text-accent-600 font-medium leading-tight">Power Up Your Real Estate Business</span>
            </div>
          )}
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

        {isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors mt-4 border-t border-slate-100 pt-4',
                isActive
                  ? 'bg-primary-50 text-primary-600'
                  : 'text-slate-600 hover:bg-slate-100'
              )
            }
          >
            <Shield className="w-5 h-5 shrink-0" />
            {!isSidebarCollapsed && (
              <span className="font-medium">Admin</span>
            )}
          </NavLink>
        )}
      </nav>

      {/* Footer */}
      {!isSidebarCollapsed && (
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-200">
          {billingStatus?.plan && (
            <span className="block text-center text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 mb-1">{billingStatus.plan}</span>
          )}
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
