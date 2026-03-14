import { useEffect, useRef, useState } from 'react'
import { Building2, ChevronDown, Plus, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useBusinessStore, type Business } from '@/hooks/useBusinessStore'
import { listBusinesses, createBusiness, switchBusiness } from '@/services/businessApi'
import { cn } from '@/utils/helpers'

interface BusinessSelectorProps {
  isCollapsed?: boolean
}

export default function BusinessSelector({ isCollapsed = false }: BusinessSelectorProps) {
  const { currentBusiness, setCurrentBusiness, businesses, setBusinesses } = useBusinessStore()
  const [isOpen, setIsOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newBusinessName, setNewBusinessName] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch businesses on mount
  useEffect(() => {
    const fetchBusinesses = async () => {
      try {
        const data = await listBusinesses()
        setBusinesses(data.businesses)
        // If no current business is set, set the primary one or first one
        if (!currentBusiness && data.businesses.length > 0) {
          const primary = data.businesses.find((b) => b.is_primary) || data.businesses[0]
          setCurrentBusiness(primary)
        }
      } catch (error) {
        console.error('Failed to fetch businesses:', error)
        toast.error('Failed to load businesses')
      } finally {
        setIsLoading(false)
      }
    }
    fetchBusinesses()
  }, [setBusinesses, setCurrentBusiness, currentBusiness])

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSwitchBusiness = async (business: Business) => {
    try {
      const updated = await switchBusiness(business.id)
      setCurrentBusiness(updated)
      setIsOpen(false)
      toast.success(`Switched to ${business.name}`)
    } catch (error) {
      console.error('Failed to switch business:', error)
      toast.error('Failed to switch business')
    }
  }

  const handleCreateBusiness = async () => {
    if (!newBusinessName.trim()) {
      toast.error('Business name is required')
      return
    }

    try {
      const newBusiness = await createBusiness({
        name: newBusinessName.trim(),
      })
      setBusinesses([...businesses, newBusiness])
      setCurrentBusiness(newBusiness)
      setNewBusinessName('')
      setIsCreating(false)
      setIsOpen(false)
      toast.success(`Created business: ${newBusiness.name}`)
    } catch (error) {
      console.error('Failed to create business:', error)
      toast.error('Failed to create business')
    }
  }

  // Truncate long names for display
  const truncateName = (name: string, maxLength: number = 20) => {
    return name.length > maxLength ? name.substring(0, maxLength) + '...' : name
  }

  // Show setup prompt if no businesses
  if (isLoading) {
    return (
      <div className={cn(
        'flex items-center justify-center rounded-lg bg-slate-50 text-slate-500',
        isCollapsed ? 'w-14 h-14' : 'w-full h-12'
      )}>
        <div className="text-xs">Loading...</div>
      </div>
    )
  }

  if (businesses.length === 0) {
    return (
      <div className={cn(
        'rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-3 text-center',
        isCollapsed ? 'w-14' : 'w-full'
      )}>
        {isCollapsed ? (
          <Building2 className="w-6 h-6 text-slate-400 mx-auto" />
        ) : (
          <>
            <Building2 className="w-5 h-5 text-slate-400 mx-auto mb-2" />
            <p className="text-xs font-medium text-slate-600">
              Set Up Your First Business
            </p>
          </>
        )}
      </div>
    )
  }

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center justify-between rounded-lg border border-slate-200 bg-white transition-colors hover:bg-slate-50',
          isCollapsed
            ? 'w-14 h-14 justify-center p-0'
            : 'w-full px-3 py-2.5'
        )}
        title={currentBusiness?.name || 'Select a business'}
      >
        {isCollapsed ? (
          <Building2 className="w-5 h-5 text-slate-600" />
        ) : (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="font-medium text-slate-900 truncate text-sm">
                {currentBusiness ? truncateName(currentBusiness.name) : 'No business'}
              </span>
            </div>
            <ChevronDown
              className={cn(
                'w-4 h-4 text-slate-400 shrink-0 transition-transform',
                isOpen && 'rotate-180'
              )}
            />
          </>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden min-w-max">
          {/* Business List */}
          <div className="max-h-48 overflow-y-auto">
            {businesses.map((business) => (
              <button
                key={business.id}
                onClick={() => handleSwitchBusiness(business)}
                className={cn(
                  'w-full text-left px-3 py-2.5 flex items-center gap-2 transition-colors border-b border-slate-100 last:border-b-0',
                  currentBusiness?.id === business.id
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-slate-700 hover:bg-slate-50'
                )}
              >
                {currentBusiness?.id === business.id && (
                  <Check className="w-4 h-4 shrink-0 text-primary-600" />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">
                    {truncateName(business.name, 25)}
                  </p>
                  {business.description && (
                    <p className="text-xs text-slate-500 truncate">
                      {business.description}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-slate-200" />

          {/* Create New Business Form or Button */}
          {isCreating ? (
            <div className="p-3 space-y-2">
              <input
                type="text"
                placeholder="Business name"
                value={newBusinessName}
                onChange={(e) => setNewBusinessName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateBusiness()
                  } else if (e.key === 'Escape') {
                    setIsCreating(false)
                    setNewBusinessName('')
                  }
                }}
                autoFocus
                className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreateBusiness}
                  className="flex-1 px-2 py-1.5 bg-primary-600 text-white text-xs font-medium rounded hover:bg-primary-700 transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setIsCreating(false)
                    setNewBusinessName('')
                  }}
                  className="flex-1 px-2 py-1.5 border border-slate-200 text-slate-700 text-xs font-medium rounded hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsCreating(true)}
              className="w-full px-3 py-2.5 flex items-center gap-2 text-slate-600 hover:bg-slate-50 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Create New Business
            </button>
          )}
        </div>
      )}
    </div>
  )
}
