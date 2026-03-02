import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
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
  Phone,
  Calendar,
  Landmark,
  Scale,
  BarChart3,
  Menu,
  X,
  MoreHorizontal,
  Globe,
  LifeBuoy,
  GitBranch,
  LogOut,
} from 'lucide-react'
import { useStore } from '@/hooks/useStore'
import { useBilling } from '@/hooks/useBilling'
import { getCurrentUser, logout } from '@/services/auth'
import { cn } from '@/utils/helpers'
// ThemeToggle lives in Settings page

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/pipeline', icon: Kanban, label: 'Pipeline' },
  { to: '/contacts', icon: Users, label: 'Contacts' },
  { to: '/markets', icon: MapPin, label: 'Markets' },
  { to: '/portfolio', icon: Building2, label: 'Portfolio' },
  { to: '/proof-of-funds', icon: ShieldCheck, label: 'Proof of Funds' },
  { to: '/documents', icon: FileText, label: 'Documents' },
  { to: '/email-marketing', icon: Mail, label: 'Email Marketing' },
  { to: '/lead-capture', icon: Globe, label: 'Lead Capture' },
  { to: '/phone', icon: Phone, label: 'Phone' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/assistanthub', icon: Headphones, label: 'AssistantHub' },
  { to: '/contenthub', icon: PenTool, label: 'ContentHub' },
  { to: '/flow-builder', icon: GitBranch, label: 'Flow Builder' },
  { to: '/billing', icon: CreditCard, label: 'Billing' },
  { to: '/help', icon: LifeBuoy, label: 'Help' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

const bottomNavItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/pipeline', icon: Kanban, label: 'Pipeline' },
  { to: '/contacts', icon: Users, label: 'Contacts' },
  { to: '/phone', icon: Phone, label: 'Phone' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
]

export default function Sidebar() {
  const { isSidebarCollapsed, toggleSidebar, isMobileDrawerOpen, setMobileDrawerOpen } = useStore()
  const { billingStatus } = useBilling()
  const [isAdmin, setIsAdmin] = useState(false)
  const [showLoanServicing, setShowLoanServicing] = useState(false)
  const [showBankNegotiation, setShowBankNegotiation] = useState(false)
  const location = useLocation()

  useEffect(() => {
    getCurrentUser().then((user) => {
      if (user && user.is_superadmin) setIsAdmin(true)
      if (user && (user.loan_servicing_enabled || user.is_superadmin)) setShowLoanServicing(true)
      if (user && (user.bank_negotiation_enabled || user.is_superadmin)) setShowBankNegotiation(true)
    })
  }, [])

  // Close drawer on route change
  useEffect(() => {
    setMobileDrawerOpen(false)
  }, [location.pathname, setMobileDrawerOpen])

  return (
    <>
      {/* ── Mobile Header Bar ── */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 z-50 md:hidden">
        <div className="flex items-center gap-2">
          <img
            src="/REIFundamentals_Hub_Logo.png"
            alt="REI Fundamentals Hub"
            className="h-9 object-contain"
          />
        </div>
        <button
          onClick={() => setMobileDrawerOpen(!isMobileDrawerOpen)}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          {isMobileDrawerOpen ? <X className="w-6 h-6 text-slate-600" /> : <Menu className="w-6 h-6 text-slate-600" />}
        </button>
      </header>

      {/* ── Mobile Drawer Overlay ── */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMobileDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <aside
            className="absolute top-0 left-0 h-full w-72 bg-white shadow-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-14 flex items-center justify-between px-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <img
                  src="/REIFundamentals_Hub_Logo.png"
                  alt="REI Fundamentals Hub"
                  className="h-9 object-contain"
                />
              </div>
              <button
                onClick={() => setMobileDrawerOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <nav className="p-2 space-y-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-3 rounded-lg transition-colors min-h-[44px]',
                      isActive
                        ? 'bg-primary-50 text-primary-600'
                        : 'text-slate-600 hover:bg-slate-100'
                    )
                  }
                >
                  <item.icon className="w-5 h-5 shrink-0" />
                  <span className="font-medium">{item.label}</span>
                </NavLink>
              ))}
              {showLoanServicing && (
                <NavLink
                  to="/loan-servicing"
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-3 rounded-lg transition-colors min-h-[44px]',
                      isActive
                        ? 'bg-primary-50 text-primary-600'
                        : 'text-slate-600 hover:bg-slate-100'
                    )
                  }
                >
                  <Landmark className="w-5 h-5 shrink-0" />
                  <span className="font-medium">Loan Servicing</span>
                </NavLink>
              )}
              {showBankNegotiation && (
                <NavLink
                  to="/bank-negotiation"
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-3 rounded-lg transition-colors min-h-[44px]',
                      isActive
                        ? 'bg-primary-50 text-primary-600'
                        : 'text-slate-600 hover:bg-slate-100'
                    )
                  }
                >
                  <Scale className="w-5 h-5 shrink-0" />
                  <span className="font-medium">Bank Negotiation</span>
                </NavLink>
              )}
              {isAdmin && (
                <NavLink
                  to="/admin"
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-3 rounded-lg transition-colors mt-4 border-t border-slate-100 pt-4 min-h-[44px]',
                      isActive
                        ? 'bg-primary-50 text-primary-600'
                        : 'text-slate-600 hover:bg-slate-100'
                    )
                  }
                >
                  <Shield className="w-5 h-5 shrink-0" />
                  <span className="font-medium">Admin</span>
                </NavLink>
              )}
            </nav>
            <div className="p-4 border-t border-slate-200 mt-4">
              {billingStatus?.plan && (
                <span className="block text-center text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 mb-1">{billingStatus.plan}</span>
              )}
              <p className="text-xs text-primary-800 font-semibold text-center">REI Fundamentals Hub</p>
              <button
                onClick={() => logout()}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Log Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Mobile Bottom Nav Bar ── */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 flex items-center justify-around z-50 md:hidden">
        {bottomNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center gap-0.5 min-w-[56px] min-h-[44px] rounded-lg px-1 py-1 transition-colors',
                isActive ? 'text-primary-600' : 'text-slate-400'
              )
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-tight">{item.label}</span>
          </NavLink>
        ))}
        <button
          onClick={() => setMobileDrawerOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 min-w-[56px] min-h-[44px] rounded-lg px-1 py-1 text-slate-400"
        >
          <MoreHorizontal className="w-5 h-5" />
          <span className="text-[10px] font-medium leading-tight">More</span>
        </button>
      </nav>

      {/* ── Desktop Sidebar ── */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-full bg-white border-r border-slate-200 transition-all duration-300 z-40 hidden md:flex md:flex-col',
          isSidebarCollapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Logo */}
        <div className={cn('flex items-center justify-between px-4 border-b border-slate-200', isSidebarCollapsed ? 'h-16' : 'py-4')}>
          <div className="flex items-center gap-2 min-w-0">
            {isSidebarCollapsed ? (
              <img
                src="/REIFundamentals_Hub_favicon.png"
                alt="REI Fundamentals Hub"
                className="w-10 h-10 object-contain rounded"
              />
            ) : (
              <img
                src="/REIFundamentals_Hub_Logo.png"
                alt="REI Fundamentals Hub"
                className="w-full max-h-24 object-contain"
              />
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
        <nav className="p-2 space-y-1 flex-1 overflow-y-auto">
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

          {showLoanServicing && (
            <NavLink
              to="/loan-servicing"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                  isActive
                    ? 'bg-primary-50 text-primary-600'
                    : 'text-slate-600 hover:bg-slate-100'
                )
              }
            >
              <Landmark className="w-5 h-5 shrink-0" />
              {!isSidebarCollapsed && (
                <span className="font-medium">Loan Servicing</span>
              )}
            </NavLink>
          )}

          {showBankNegotiation && (
            <NavLink
              to="/bank-negotiation"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                  isActive
                    ? 'bg-primary-50 text-primary-600'
                    : 'text-slate-600 hover:bg-slate-100'
                )
              }
            >
              <Scale className="w-5 h-5 shrink-0" />
              {!isSidebarCollapsed && (
                <span className="font-medium">Bank Negotiation</span>
              )}
            </NavLink>
          )}

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
        <div className="border-t border-slate-200">
          {!isSidebarCollapsed && (
            <div className="px-4 pt-3">
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
          <div className={isSidebarCollapsed ? 'p-2 space-y-1' : 'px-4 pb-3 pt-2 space-y-1'}>
            <button
              onClick={() => logout()}
              className={cn(
                'flex items-center gap-2 rounded-lg text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors',
                isSidebarCollapsed
                  ? 'w-full justify-center p-2.5'
                  : 'w-full px-3 py-2 justify-center'
              )}
              title="Log Out"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              {!isSidebarCollapsed && <span>Log Out</span>}
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
