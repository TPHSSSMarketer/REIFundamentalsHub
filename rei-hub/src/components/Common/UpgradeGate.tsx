import { type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useBilling } from '@/hooks/useBilling'

interface UpgradeGateProps {
  feature: string
  requiredPlan: string
  children: ReactNode
}

export default function UpgradeGate({ feature, requiredPlan, children }: UpgradeGateProps) {
  const { canAccess } = useBilling()
  const navigate = useNavigate()

  if (canAccess(feature)) {
    return <>{children}</>
  }

  return (
    <div className="relative">
      {/* Blurred / dimmed children */}
      <div className="pointer-events-none select-none blur-sm opacity-40" aria-hidden="true">
        {children}
      </div>

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-slate-900/50 flex items-center justify-center z-10">
        {/* Upgrade card */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8 text-center max-w-sm mx-4">
          <Lock className="w-10 h-10 text-slate-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            Upgrade to {requiredPlan} to unlock this feature
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            This feature requires the {requiredPlan} plan or higher.
          </p>
          <button
            onClick={() => navigate('/billing')}
            className="w-full rounded-lg bg-primary-600 text-white py-2.5 text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            View Plans
          </button>
        </div>
      </div>
    </div>
  )
}
