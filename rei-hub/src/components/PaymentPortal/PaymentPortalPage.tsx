/**
 * TPHS Payment Portal — standalone, full-page, white-labeled payment experience.
 *
 * No REI Hub branding. No sidebar. No navigation bar.
 * Uses TPHS brand colors and logo exclusively.
 *
 * Loads Stripe.js dynamically from the CDN (no npm dependency).
 */

import { useState, useEffect, useRef, useCallback, type CSSProperties, type FormEvent } from 'react'
import { getPortalConfig } from '../../services/loanServicingApi'

// ── Constants ───────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'
const PORTAL_API = `${API_BASE}/api/portal`

const BRAND = {
  navy: '#1B3A6B',
  red: '#CC2229',
  darkGray: '#4A4A4A',
  white: '#FFFFFF',
  lightGray: '#F7F8FA',
  green: '#2E7D32',
} as const

const LOGO_WIDE = '/REIFundamentals_Hub_Logo.png'
const FAVICON = '/REIFundamentals_Hub_favicon.png'

// ── Types ───────────────────────────────────────────────────────────────

interface LookupResult {
  valid: boolean
  buyer_name: string
  property_address: string
  current_balance: number
  monthly_payment: number
  next_due_date: string | null
  days_until_due: number
  is_late: boolean
  days_late: number
  late_fee_due: number
  total_due_now: number
  account_number: string
  payment_methods_accepted: string[]
}

interface StripePayResult {
  success: boolean
  payment_id: string
  amount: number
  confirmation_number: string
  receipt_url: string
  balance_after: number
  card_last_four: string
}

interface ManualPayResult {
  success: boolean
  confirmation_number: string
  message: string
}

type Step = 'lookup' | 'payment' | 'confirmation'

// ── Stripe JS loader ────────────────────────────────────────────────────

let stripePromise: Promise<any> | null = null

function loadStripe(publishableKey: string): Promise<any> {
  if (stripePromise) return stripePromise

  stripePromise = new Promise((resolve, reject) => {
    if ((window as any).Stripe) {
      resolve((window as any).Stripe(publishableKey))
      return
    }
    const script = document.createElement('script')
    script.src = 'https://js.stripe.com/v3/'
    script.onload = () => {
      if ((window as any).Stripe) {
        resolve((window as any).Stripe(publishableKey))
      } else {
        reject(new Error('Stripe.js failed to load'))
      }
    }
    script.onerror = () => reject(new Error('Failed to load Stripe.js'))
    document.head.appendChild(script)
  })

  return stripePromise
}

// ── Utility ─────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

// ── Component ───────────────────────────────────────────────────────────

interface PortalConfig {
  company_name: string
  logo_url: string | null
  primary_color: string
  stripe_publishable_key: string | null
}

export default function PaymentPortalPage() {
  const [step, setStep] = useState<Step>('lookup')
  const [portalConfig, setPortalConfig] = useState<PortalConfig | null>(null)
  const [portalLoading, setPortalLoading] = useState(true)

  // Lookup state
  const [accountNumber, setAccountNumber] = useState('')
  const [accountNumberValid, setAccountNumberValid] = useState(true)
  const [propertyAddress, setPropertyAddress] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState('')
  const [account, setAccount] = useState<LookupResult | null>(null)

  // Payment state
  const [payTab, setPayTab] = useState<'card' | 'manual'>('card')
  const [payAmount, setPayAmount] = useState('')
  const [cardReady, setCardReady] = useState(false)
  const [payLoading, setPayLoading] = useState(false)
  const [payError, setPayError] = useState('')

  // Manual payment state
  const [manualMethod, setManualMethod] = useState<'check' | 'wire'>('check')
  const [manualAmount, setManualAmount] = useState('')
  const [manualRef, setManualRef] = useState('')
  const [manualNotes, setManualNotes] = useState('')
  const [manualLoading, setManualLoading] = useState(false)

  // Confirmation state
  const [confirmation, setConfirmation] = useState<{
    confirmation_number: string
    amount: number
    account_number: string
    property_address: string
    card_last_four?: string
    balance_after?: number
    receipt_url?: string
    payment_method: string
    message?: string
    date: string
  } | null>(null)

  // Stripe refs
  const stripeRef = useRef<any>(null)
  const elementsRef = useRef<any>(null)
  const cardElementRef = useRef<any>(null)
  const cardMountRef = useRef<HTMLDivElement | null>(null)

  // Load portal config from URL param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const businessId = params.get('business')
    if (businessId) {
      getPortalConfig(businessId)
        .then((cfg: any) => {
          if (cfg && cfg.company_name) {
            setPortalConfig({
              company_name: cfg.company_name,
              logo_url: cfg.logo_url || null,
              primary_color: cfg.primary_color || '#1B3A6B',
              stripe_publishable_key: cfg.stripe_publishable_key || null,
            })
          }
        })
        .catch(() => { /* use defaults */ })
        .finally(() => setPortalLoading(false))
    } else {
      setPortalLoading(false)
    }
  }, [])

  // Derived branding values
  const brandName = portalConfig?.company_name || 'TriPoint Home Solutions'
  const brandColor = portalConfig?.primary_color || BRAND.navy
  const brandLogoUrl = portalConfig?.logo_url || null

  // Set favicon on mount
  useEffect(() => {
    const link: HTMLLinkElement =
      document.querySelector("link[rel~='icon']") || document.createElement('link')
    link.rel = 'icon'
    link.href = FAVICON
    document.title = `${brandName} — Payment Portal`
    return () => {
      document.title = 'REIFundamentals Hub'
    }
  }, [brandName])

  // Initialize Stripe Elements when entering the payment step
  const initStripe = useCallback(async () => {
    try {
      // Fetch the publishable key from portal config endpoint or use env
      const pk = import.meta.env.VITE_STRIPE_CONNECT_PUBLISHABLE_KEY || ''
      if (!pk) {
        setPayError('Payment processing is not configured. Please contact support.')
        return
      }
      const stripe = await loadStripe(pk)
      stripeRef.current = stripe
      const elements = stripe.elements()
      elementsRef.current = elements

      const cardElement = elements.create('card', {
        style: {
          base: {
            fontSize: '16px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            color: BRAND.darkGray,
            '::placeholder': { color: '#9CA3AF' },
          },
          invalid: { color: BRAND.red },
        },
      })
      cardElementRef.current = cardElement

      if (cardMountRef.current) {
        cardElement.mount(cardMountRef.current)
      }

      cardElement.on('change', (event: any) => {
        setCardReady(event.complete)
        if (event.error) {
          setPayError(event.error.message)
        } else {
          setPayError('')
        }
      })
    } catch {
      setPayError('Failed to load payment form. Please refresh and try again.')
    }
  }, [])

  useEffect(() => {
    if (step === 'payment') {
      initStripe()
    }
    return () => {
      if (cardElementRef.current) {
        try { cardElementRef.current.unmount() } catch { /* noop */ }
        cardElementRef.current = null
      }
      elementsRef.current = null
    }
  }, [step, initStripe])

  // ── Handlers ──────────────────────────────────────────────────────

  async function handleLookup(e: FormEvent) {
    e.preventDefault()
    setLookupError('')
    setLookupLoading(true)

    try {
      const params = new URLSearchParams({
        account_number: accountNumber.trim(),
        property_address: propertyAddress.trim(),
      })
      const res = await fetch(`${PORTAL_API}/lookup?${params}`)
      if (res.status === 429) {
        setLookupError('Too many attempts. Please wait a minute and try again.')
        return
      }
      if (!res.ok) {
        setLookupError('Something went wrong. Please try again.')
        return
      }
      const data: LookupResult = await res.json()
      if (!data.valid) {
        setLookupError('Account not found. Please check your account number and property address.')
        return
      }
      setAccount(data)
      setPayAmount(data.total_due_now.toFixed(2))
      setManualAmount(data.total_due_now.toFixed(2))
      setStep('payment')
    } catch {
      setLookupError('Unable to connect. Please check your internet connection.')
    } finally {
      setLookupLoading(false)
    }
  }

  async function handleStripePay(e: FormEvent) {
    e.preventDefault()
    if (!stripeRef.current || !cardElementRef.current || !account) return

    const amountNum = parseFloat(payAmount)
    if (isNaN(amountNum) || amountNum < account.monthly_payment) {
      setPayError(`Minimum payment is ${formatCurrency(account.monthly_payment)}.`)
      return
    }

    setPayError('')
    setPayLoading(true)

    try {
      const { paymentMethod, error } = await stripeRef.current.createPaymentMethod({
        type: 'card',
        card: cardElementRef.current,
      })

      if (error) {
        setPayError(error.message || 'Card error. Please check your details.')
        return
      }

      const res = await fetch(`${PORTAL_API}/pay/stripe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_number: account.account_number,
          amount_cents: Math.round(amountNum * 100),
          payment_method_id: paymentMethod.id,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setPayError(data.detail || 'Payment failed. Please try again.')
        return
      }

      const result = data as StripePayResult
      setConfirmation({
        confirmation_number: result.confirmation_number,
        amount: result.amount,
        account_number: account.account_number,
        property_address: account.property_address,
        card_last_four: result.card_last_four,
        balance_after: result.balance_after,
        receipt_url: result.receipt_url,
        payment_method: `Card ending in ${result.card_last_four}`,
        date: new Date().toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
      })
      setStep('confirmation')
    } catch {
      setPayError('Unable to process payment. Please try again.')
    } finally {
      setPayLoading(false)
    }
  }

  async function handleManualPay(e: FormEvent) {
    e.preventDefault()
    if (!account) return

    const amountNum = parseFloat(manualAmount)
    if (isNaN(amountNum) || amountNum <= 0) {
      setPayError('Please enter a valid amount.')
      return
    }

    setPayError('')
    setManualLoading(true)

    try {
      const res = await fetch(`${PORTAL_API}/pay/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_number: account.account_number,
          amount: amountNum,
          payment_method: manualMethod,
          reference_number: manualRef,
          notes: manualNotes,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setPayError(data.detail || 'Failed to submit notification.')
        return
      }

      const result = data as ManualPayResult
      setConfirmation({
        confirmation_number: result.confirmation_number,
        amount: amountNum,
        account_number: account.account_number,
        property_address: account.property_address,
        payment_method: manualMethod === 'check' ? 'Check' : 'Wire Transfer',
        message: result.message,
        date: new Date().toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
      })
      setStep('confirmation')
    } catch {
      setPayError('Unable to submit. Please try again.')
    } finally {
      setManualLoading(false)
    }
  }

  function handleStartOver() {
    setStep('lookup')
    setAccount(null)
    setConfirmation(null)
    setAccountNumber('')
    setPropertyAddress('')
    setPayAmount('')
    setPayError('')
    setLookupError('')
    setCardReady(false)
    setManualAmount('')
    setManualRef('')
    setManualNotes('')
  }

  // ── Render ────────────────────────────────────────────────────────

  if (portalLoading) {
    return (
      <div style={{ ...styles.page, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 40, height: 40, border: '4px solid #1B3A6B', borderTopColor: 'transparent', borderRadius: '50%', animation: 'tphs-spin 0.6s linear infinite' }} />
        <style>{`@keyframes tphs-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={{ ...styles.header, backgroundColor: brandColor }}>
        <div style={styles.headerInner}>
          {brandLogoUrl ? (
            <img
              src={brandLogoUrl}
              alt={brandName}
              style={styles.logo}
            />
          ) : !portalConfig ? (
            <img
              src={LOGO_WIDE}
              alt={brandName}
              style={styles.logo}
            />
          ) : (
            <span style={{ color: BRAND.white, fontSize: 20, fontWeight: 700 }}>{brandName}</span>
          )}
          <p style={styles.tagline}>Secure Payment Portal</p>
        </div>
      </header>

      {/* Main content */}
      <main style={styles.main}>
        <div style={styles.container}>
          {step === 'lookup' && (
            <div style={styles.card}>
              <h1 style={styles.heading}>Make a Payment</h1>
              <p style={styles.subheading}>Enter your account details to get started</p>

              <form onSubmit={handleLookup}>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>
                    Account Number <span style={styles.required}>*</span>
                  </label>
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={(e) => {
                      const v = e.target.value.toUpperCase()
                      setAccountNumber(v)
                      setAccountNumberValid(
                        v === '' || /^CFD-[A-Z]{2}-\d{4}-\d{5}$/.test(v)
                      )
                    }}
                    placeholder="CFD-NY-2025-00147"
                    required
                    maxLength={20}
                    style={{
                      ...styles.input,
                      borderColor: !accountNumberValid ? BRAND.red : undefined,
                    }}
                  />
                  <p style={styles.helper}>
                    {!accountNumberValid
                      ? 'Format: CFD-XX-YYYY-NNNNN'
                      : 'Found on your monthly statement'}
                  </p>
                </div>

                <div style={styles.fieldGroup}>
                  <label style={styles.label}>
                    Property Address <span style={styles.required}>*</span>
                  </label>
                  <input
                    type="text"
                    value={propertyAddress}
                    onChange={(e) => setPropertyAddress(e.target.value)}
                    placeholder="123 Main Street"
                    required
                    style={styles.input}
                  />
                  <p style={styles.helper}>Street address of the property</p>
                </div>

                {lookupError && <div style={styles.errorBox}>{lookupError}</div>}

                <button
                  type="submit"
                  disabled={lookupLoading || !accountNumber.trim() || !propertyAddress.trim()}
                  style={{
                    ...styles.btnPrimary,
                    opacity: lookupLoading ? 0.7 : 1,
                  }}
                >
                  {lookupLoading ? (
                    <span style={styles.spinner} />
                  ) : (
                    'Find My Account'
                  )}
                </button>
              </form>
            </div>
          )}

          {step === 'payment' && account && (
            <>
              {/* Account summary */}
              <div style={styles.card}>
                <div style={styles.accountFoundHeader}>
                  <span style={styles.checkIcon}>&#10003;</span>
                  <span style={styles.accountFoundText}>Account Found</span>
                </div>

                <div style={styles.accountDetails}>
                  <p style={styles.detailRow}>
                    <span style={styles.detailLabel}>Property:</span>{' '}
                    {account.property_address}
                  </p>
                  <p style={styles.detailRow}>
                    <span style={styles.detailLabel}>Account:</span>{' '}
                    {account.account_number}
                  </p>
                  <p style={styles.detailRow}>
                    Welcome back, <strong>{account.buyer_name}</strong>
                  </p>
                </div>

                {/* Payment summary box */}
                <div style={styles.summaryBox}>
                  <div style={styles.summaryRow}>
                    <span>Monthly Payment</span>
                    <span>{formatCurrency(account.monthly_payment)}</span>
                  </div>
                  <div style={styles.summaryRow}>
                    <span>Next Due</span>
                    <span>{formatDate(account.next_due_date)}</span>
                  </div>

                  {account.is_late && (
                    <div style={styles.lateBanner}>
                      <span>&#9888;&#65039; Payment Overdue ({account.days_late} days)</span>
                      <div style={styles.summaryRow}>
                        <span>Late Fee</span>
                        <span>{formatCurrency(account.late_fee_due)}</span>
                      </div>
                      <div style={{ ...styles.summaryRow, fontWeight: 700 }}>
                        <span>Total Due</span>
                        <span>{formatCurrency(account.total_due_now)}</span>
                      </div>
                    </div>
                  )}

                  <div
                    style={{
                      ...styles.summaryRow,
                      borderTop: '1px solid rgba(255,255,255,0.2)',
                      paddingTop: 12,
                      marginTop: 8,
                    }}
                  >
                    <span>Current Balance</span>
                    <span>{formatCurrency(account.current_balance)}</span>
                  </div>
                </div>
              </div>

              {/* Payment method tabs */}
              <div style={styles.card}>
                <div style={styles.tabs}>
                  <button
                    type="button"
                    onClick={() => { setPayTab('card'); setPayError('') }}
                    style={payTab === 'card' ? styles.tabActive : styles.tab}
                  >
                    &#128179; Pay by Card
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPayTab('manual'); setPayError('') }}
                    style={payTab === 'manual' ? styles.tabActive : styles.tab}
                  >
                    &#127974; Check / Wire
                  </button>
                </div>

                {payTab === 'card' && (
                  <form onSubmit={handleStripePay} style={{ marginTop: 20 }}>
                    <div style={styles.fieldGroup}>
                      <label style={styles.label}>Payment Amount</label>
                      <div style={styles.amountInputWrap}>
                        <span style={styles.amountPrefix}>$</span>
                        <input
                          type="number"
                          step="0.01"
                          min={1}
                          max={10000}
                          value={payAmount}
                          onChange={(e) => {
                            const v = e.target.value
                            if (v === '' || parseFloat(v) >= 0) setPayAmount(v)
                          }}
                          style={{ ...styles.input, paddingLeft: 28 }}
                        />
                      </div>
                      <p style={styles.helper}>
                        Minimum payment: {formatCurrency(account.monthly_payment)}
                      </p>
                    </div>

                    <div style={styles.fieldGroup}>
                      <label style={styles.label}>Card Details</label>
                      <div ref={cardMountRef} style={styles.stripeElement} />
                    </div>

                    {payError && <div style={styles.errorBox}>{payError}</div>}

                    <button
                      type="submit"
                      disabled={payLoading || !cardReady}
                      style={{
                        ...styles.btnPrimary,
                        opacity: payLoading || !cardReady ? 0.7 : 1,
                      }}
                    >
                      {payLoading ? (
                        <span style={styles.spinner} />
                      ) : (
                        `Pay ${formatCurrency(parseFloat(payAmount) || 0)}`
                      )}
                    </button>

                    <div style={styles.securityNote}>
                      <span>&#128274;</span> Secured by Stripe
                      <p style={styles.securitySmall}>
                        Your card information is encrypted and never stored on our servers.
                      </p>
                    </div>
                  </form>
                )}

                {payTab === 'manual' && (
                  <div style={{ marginTop: 20 }}>
                    <div style={styles.instructionCard}>
                      <h3 style={styles.instructionTitle}>Mail check payable to:</h3>
                      <p style={styles.instructionText}>
                        <strong>{brandName}</strong>
                        <br />
                        (Address on your monthly statement)
                      </p>

                      <h3 style={{ ...styles.instructionTitle, marginTop: 16 }}>
                        Include on memo line:
                      </h3>
                      <p style={styles.instructionText}>
                        Account Number: <strong>{account.account_number}</strong>
                      </p>

                      <h3 style={{ ...styles.instructionTitle, marginTop: 16 }}>
                        For wire transfers, contact:
                      </h3>
                      <p style={styles.instructionText}>
                        info@tripointhomesolutions.com
                      </p>
                    </div>

                    <div style={{ ...styles.divider }} />

                    <h3 style={styles.subheading}>Let us know you've sent a payment</h3>

                    <form onSubmit={handleManualPay}>
                      <div style={styles.fieldGroup}>
                        <label style={styles.label}>Amount</label>
                        <div style={styles.amountInputWrap}>
                          <span style={styles.amountPrefix}>$</span>
                          <input
                            type="number"
                            step="0.01"
                            min={1}
                            max={10000}
                            value={manualAmount}
                            onChange={(e) => {
                              const v = e.target.value
                              if (v === '' || parseFloat(v) >= 0) setManualAmount(v)
                            }}
                            required
                            style={{ ...styles.input, paddingLeft: 28 }}
                          />
                        </div>
                      </div>

                      <div style={styles.fieldGroup}>
                        <label style={styles.label}>Payment Method</label>
                        <div style={styles.radioGroup}>
                          <label style={styles.radioLabel}>
                            <input
                              type="radio"
                              name="manualMethod"
                              value="check"
                              checked={manualMethod === 'check'}
                              onChange={() => setManualMethod('check')}
                            />{' '}
                            Check
                          </label>
                          <label style={styles.radioLabel}>
                            <input
                              type="radio"
                              name="manualMethod"
                              value="wire"
                              checked={manualMethod === 'wire'}
                              onChange={() => setManualMethod('wire')}
                            />{' '}
                            Wire Transfer
                          </label>
                        </div>
                      </div>

                      <div style={styles.fieldGroup}>
                        <label style={styles.label}>Reference / Check Number</label>
                        <input
                          type="text"
                          value={manualRef}
                          onChange={(e) => setManualRef(e.target.value)}
                          placeholder="Optional"
                          style={styles.input}
                        />
                      </div>

                      <div style={styles.fieldGroup}>
                        <label style={styles.label}>Notes</label>
                        <textarea
                          value={manualNotes}
                          onChange={(e) => setManualNotes(e.target.value)}
                          placeholder="Optional"
                          rows={3}
                          style={{ ...styles.input, resize: 'vertical' as const }}
                        />
                      </div>

                      {payError && <div style={styles.errorBox}>{payError}</div>}

                      <button
                        type="submit"
                        disabled={manualLoading}
                        style={{
                          ...styles.btnPrimary,
                          opacity: manualLoading ? 0.7 : 1,
                        }}
                      >
                        {manualLoading ? (
                          <span style={styles.spinner} />
                        ) : (
                          'Submit Payment Notification'
                        )}
                      </button>
                    </form>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleStartOver}
                style={styles.linkBtn}
              >
                &larr; Look up a different account
              </button>
            </>
          )}

          {step === 'confirmation' && confirmation && (
            <div style={styles.card}>
              <div style={styles.confirmIcon}>&#10003;</div>
              <h1 style={{ ...styles.heading, color: BRAND.green }}>
                {confirmation.message ? 'Notification Received' : 'Payment Successful!'}
              </h1>

              {confirmation.message && (
                <p style={{ ...styles.subheading, marginBottom: 20 }}>
                  {confirmation.message}
                </p>
              )}

              <div style={styles.receiptCard}>
                <div style={styles.receiptRow}>
                  <span>Confirmation #</span>
                  <strong>{confirmation.confirmation_number}</strong>
                </div>
                <div style={styles.receiptRow}>
                  <span>Date</span>
                  <span>{confirmation.date}</span>
                </div>
                <div style={styles.receiptRow}>
                  <span>Amount</span>
                  <strong>{formatCurrency(confirmation.amount)}</strong>
                </div>
                <div style={styles.receiptRow}>
                  <span>Account</span>
                  <span>{confirmation.account_number}</span>
                </div>
                <div style={styles.receiptRow}>
                  <span>Property</span>
                  <span>{confirmation.property_address}</span>
                </div>
                <div style={styles.receiptRow}>
                  <span>Payment Method</span>
                  <span>{confirmation.payment_method}</span>
                </div>
                {confirmation.balance_after !== undefined && (
                  <div style={styles.receiptRow}>
                    <span>New Balance</span>
                    <strong>{formatCurrency(confirmation.balance_after)}</strong>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' as const }}>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={styles.btnSecondary}
                >
                  Print Receipt
                </button>
                <button
                  type="button"
                  onClick={handleStartOver}
                  style={styles.btnPrimary}
                >
                  Make Another Payment
                </button>
              </div>

              {confirmation.receipt_url && (
                <p style={{ ...styles.helper, marginTop: 16 }}>
                  <a
                    href={confirmation.receipt_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: BRAND.navy }}
                  >
                    View Stripe Receipt &rarr;
                  </a>
                </p>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <p>&copy; {brandName}</p>
        <p style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>
          Powered by Stripe
        </p>
      </footer>

      {/* Print-only styles */}
      <style>{`
        @media print {
          header, footer, button { display: none !important; }
        }
        @keyframes tphs-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

// ── Inline styles ───────────────────────────────────────────────────────

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: BRAND.lightGray,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    color: BRAND.darkGray,
    margin: 0,
    padding: 0,
  },

  // Header
  header: {
    backgroundColor: BRAND.navy,
    padding: '12px 20px',
    textAlign: 'center',
  },
  headerInner: {
    maxWidth: 480,
    margin: '0 auto',
  },
  logo: {
    maxHeight: 44,
    width: 'auto',
    objectFit: 'contain' as const,
  },
  tagline: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    margin: '4px 0 0',
    letterSpacing: 1,
  },

  // Main
  main: {
    flex: 1,
    padding: '24px 16px',
  },
  container: {
    maxWidth: 480,
    margin: '0 auto',
  },

  // Card
  card: {
    backgroundColor: BRAND.white,
    borderRadius: 12,
    boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04)',
    padding: 24,
    marginBottom: 16,
  },

  // Typography
  heading: {
    fontSize: 22,
    fontWeight: 700,
    color: BRAND.navy,
    margin: '0 0 4px',
    textAlign: 'center' as const,
  },
  subheading: {
    fontSize: 14,
    color: '#6B7280',
    margin: '0 0 20px',
    textAlign: 'center' as const,
  },

  // Form
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    display: 'block',
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 6,
    color: BRAND.darkGray,
  },
  required: {
    color: BRAND.red,
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    fontSize: 16,
    border: '1px solid #D1D5DB',
    borderRadius: 8,
    outline: 'none',
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.15s',
  },
  helper: {
    fontSize: 12,
    color: '#9CA3AF',
    margin: '4px 0 0',
  },

  // Buttons
  btnPrimary: {
    width: '100%',
    padding: '14px 20px',
    fontSize: 16,
    fontWeight: 600,
    color: BRAND.white,
    backgroundColor: BRAND.navy,
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btnSecondary: {
    flex: 1,
    padding: '14px 20px',
    fontSize: 14,
    fontWeight: 600,
    color: BRAND.navy,
    backgroundColor: BRAND.white,
    border: `2px solid ${BRAND.navy}`,
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 48,
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    color: BRAND.navy,
    fontSize: 14,
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: '8px 0',
    display: 'block',
    textAlign: 'center' as const,
    width: '100%',
  },

  // Error
  errorBox: {
    backgroundColor: '#FEF2F2',
    border: `1px solid ${BRAND.red}`,
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: 14,
    color: BRAND.red,
    marginBottom: 16,
  },

  // Account found header
  accountFoundHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  checkIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: '50%',
    backgroundColor: BRAND.green,
    color: BRAND.white,
    fontSize: 16,
    fontWeight: 700,
  },
  accountFoundText: {
    fontSize: 18,
    fontWeight: 700,
    color: BRAND.green,
  },

  // Account details
  accountDetails: {
    marginBottom: 16,
  },
  detailRow: {
    fontSize: 14,
    margin: '4px 0',
    color: BRAND.darkGray,
  },
  detailLabel: {
    fontWeight: 600,
    color: '#6B7280',
  },

  // Summary box
  summaryBox: {
    backgroundColor: BRAND.navy,
    color: BRAND.white,
    borderRadius: 8,
    padding: 16,
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 0',
    fontSize: 14,
  },
  lateBanner: {
    backgroundColor: BRAND.red,
    borderRadius: 6,
    padding: '10px 12px',
    marginTop: 8,
    fontSize: 14,
    fontWeight: 600,
  },

  // Tabs
  tabs: {
    display: 'flex',
    gap: 0,
    borderBottom: '2px solid #E5E7EB',
  },
  tab: {
    flex: 1,
    padding: '12px 8px',
    fontSize: 14,
    fontWeight: 500,
    color: '#6B7280',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    marginBottom: -2,
    minHeight: 48,
  },
  tabActive: {
    flex: 1,
    padding: '12px 8px',
    fontSize: 14,
    fontWeight: 600,
    color: BRAND.navy,
    background: 'none',
    border: 'none',
    borderBottom: `2px solid ${BRAND.navy}`,
    cursor: 'pointer',
    marginBottom: -2,
    minHeight: 48,
  },

  // Stripe element
  stripeElement: {
    padding: '12px 14px',
    border: '1px solid #D1D5DB',
    borderRadius: 8,
    backgroundColor: BRAND.white,
  },
  amountInputWrap: {
    position: 'relative' as const,
  },
  amountPrefix: {
    position: 'absolute' as const,
    left: 12,
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: 16,
    color: '#6B7280',
    pointerEvents: 'none' as const,
  },

  // Security note
  securityNote: {
    textAlign: 'center' as const,
    fontSize: 13,
    color: '#6B7280',
    marginTop: 16,
  },
  securitySmall: {
    fontSize: 11,
    color: '#9CA3AF',
    margin: '4px 0 0',
  },

  // Manual payment instructions
  instructionCard: {
    backgroundColor: BRAND.lightGray,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  instructionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#6B7280',
    margin: '0 0 4px',
  },
  instructionText: {
    fontSize: 14,
    margin: '0',
    color: BRAND.darkGray,
  },
  divider: {
    borderTop: '1px solid #E5E7EB',
    margin: '20px 0',
  },

  // Radio
  radioGroup: {
    display: 'flex',
    gap: 20,
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 14,
    cursor: 'pointer',
    minHeight: 48,
  },

  // Confirmation
  confirmIcon: {
    width: 64,
    height: 64,
    borderRadius: '50%',
    backgroundColor: BRAND.green,
    color: BRAND.white,
    fontSize: 32,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  },
  receiptCard: {
    backgroundColor: BRAND.lightGray,
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
  },
  receiptRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    fontSize: 14,
    borderBottom: '1px solid #E5E7EB',
  },

  // Spinner
  spinner: {
    display: 'inline-block',
    width: 20,
    height: 20,
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: BRAND.white,
    borderRadius: '50%',
    animation: 'tphs-spin 0.6s linear infinite',
  },

  // Footer
  footer: {
    textAlign: 'center' as const,
    padding: '16px 20px',
    fontSize: 13,
    color: '#6B7280',
    borderTop: '1px solid #E5E7EB',
  },
}
