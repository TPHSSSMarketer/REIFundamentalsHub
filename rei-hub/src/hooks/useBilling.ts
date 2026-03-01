import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { getBillingStatus, type BillingStatus } from '@/services/billingApi'

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

let cachedStatus: BillingStatus | null = null
let cacheTimestamp = 0

export function useBilling() {
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(cachedStatus)
  const [isLoadingBilling, setIsLoadingBilling] = useState(false)
  const [billingError, setBillingError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const fetchBilling = useCallback(async (bypassCache = false) => {
    const now = Date.now()
    if (!bypassCache && cachedStatus && now - cacheTimestamp < CACHE_TTL_MS) {
      setBillingStatus(cachedStatus)
      return
    }

    setIsLoadingBilling(true)
    setBillingError(null)
    try {
      const status = await getBillingStatus()
      cachedStatus = status
      cacheTimestamp = Date.now()
      if (mountedRef.current) {
        setBillingStatus(status)
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setBillingError(err instanceof Error ? err.message : 'Failed to load billing status')
      }
    } finally {
      if (mountedRef.current) {
        setIsLoadingBilling(false)
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    fetchBilling()
    return () => { mountedRef.current = false }
  }, [fetchBilling])

  const canAccess = useCallback((feature: string): boolean => {
    if (billingStatus === null || isLoadingBilling) return true // fail open
    return billingStatus.can_access[feature] === true
  }, [billingStatus, isLoadingBilling])

  const isTrialActive = billingStatus?.is_trial_active ?? false
  const daysRemainingInTrial = billingStatus?.days_remaining_in_trial ?? null

  return {
    status: billingStatus,
    billingStatus,
    loading: isLoadingBilling,
    isLoadingBilling,
    error: billingError,
    billingError,
    canAccess,
    isTrialActive,
    daysRemainingInTrial,
    refetch: () => fetchBilling(true),
    refetchBilling: () => fetchBilling(true),
  }
}
