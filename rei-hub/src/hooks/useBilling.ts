import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { getBillingStatus, type BillingStatus } from '@/services/billingApi'

export function useBilling() {
  const { token } = useAuth()
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null)
  const [isLoadingBilling, setIsLoadingBilling] = useState(false)
  const [billingError, setBillingError] = useState<string | null>(null)

  const fetchBilling = useCallback(async () => {
    if (!token) return
    setIsLoadingBilling(true)
    setBillingError(null)
    try {
      const status = await getBillingStatus(token)
      setBillingStatus(status)
    } catch (err: unknown) {
      setBillingError(err instanceof Error ? err.message : 'Failed to load billing status')
    } finally {
      setIsLoadingBilling(false)
    }
  }, [token])

  useEffect(() => {
    fetchBilling()
  }, [fetchBilling])

  return {
    billingStatus,
    isLoadingBilling,
    billingError,
    refetchBilling: fetchBilling,
  }
}
