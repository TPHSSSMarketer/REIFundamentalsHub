import { useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'

interface UpgradePromptProps {
  featureName: string
  requiredPlan: string
}

export default function UpgradePrompt({ featureName, requiredPlan }: UpgradePromptProps) {
  const navigate = useNavigate()

  return (
    <div className="p-6 max-w-md mx-auto mt-16">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
        <Lock className="w-10 h-10 text-slate-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">
          {featureName} is a {requiredPlan} feature
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          Upgrade your plan to unlock {featureName} and all {requiredPlan} features.
        </p>
        <div className="space-y-3">
          <button
            onClick={() => navigate('/pricing')}
            className="w-full rounded-lg bg-primary-600 text-white py-2.5 text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            View Plans
          </button>
          <button
            onClick={() => navigate('/billing')}
            className="w-full rounded-lg bg-slate-100 text-slate-700 py-2.5 text-sm font-medium hover:bg-slate-200 transition-colors"
          >
            View your current plan
          </button>
        </div>
      </div>
    </div>
  )
}
