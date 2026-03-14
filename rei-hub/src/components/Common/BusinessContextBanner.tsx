/**
 * BusinessContextBanner — shows which business is active in the current module.
 *
 * Displayed at the top of modules that are business-aware (LeadCenter, AI Studio).
 * If the current business is disabled for this module, shows a warning with a link
 * to Settings to enable it.
 */

import { useState, useEffect } from 'react'
import { Building2, AlertTriangle, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useBusinessStore } from '@/hooks/useBusinessStore'
import { getModuleSettings, type ModuleBusinessSetting } from '@/services/businessApi'

interface BusinessContextBannerProps {
  /** Module identifier: 'lead_center' | 'ai_studio' | 'content_hub' */
  module: string
  /** Display label for the module, e.g. "LeadCenter" */
  moduleLabel: string
}

export default function BusinessContextBanner({ module, moduleLabel }: BusinessContextBannerProps) {
  const navigate = useNavigate()
  const { currentBusiness, businesses } = useBusinessStore()
  const [settings, setSettings] = useState<ModuleBusinessSetting[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getModuleSettings()
      .then((res) => {
        setSettings(res.settings || [])
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  // Don't show anything if no businesses are set up yet
  if (!currentBusiness || businesses.length === 0) return null

  // Check if current business is enabled for this module
  const currentSetting = settings.find(
    (s) => s.business_id === currentBusiness.id && s.module === module
  )
  const isEnabled = !loaded || !currentSetting || currentSetting.is_enabled

  // Find which businesses ARE enabled for this module
  const enabledBusinessNames = businesses
    .filter((b) => {
      const setting = settings.find((s) => s.business_id === b.id && s.module === module)
      return !setting || setting.is_enabled
    })
    .map((b) => b.name)

  if (!isEnabled) {
    return (
      <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-800">
            {currentBusiness.name} is not enabled for {moduleLabel}
          </p>
          <p className="text-xs text-amber-600 mt-1">
            {enabledBusinessNames.length > 0
              ? `Active businesses: ${enabledBusinessNames.join(', ')}. Switch to one of those, or enable ${currentBusiness.name} in Settings.`
              : `No businesses are enabled for ${moduleLabel}. Enable one in Settings > Businesses > Module Access.`
            }
          </p>
          <button
            onClick={() => navigate('/settings?tab=businesses')}
            className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Go to Module Access Settings
          </button>
        </div>
      </div>
    )
  }

  // Show a subtle indicator of which business is active
  return (
    <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
      <Building2 className="w-4 h-4" />
      <span>
        Using <span className="font-medium text-slate-700">{currentBusiness.name}</span> profile
      </span>
    </div>
  )
}
