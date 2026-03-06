import { useState, useMemo, useCallback } from 'react'
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  Star,
  TrendingUp,
  TrendingDown,
  Save,
  Loader2,
  BarChart3,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency, cn } from '@/utils/helpers'
import { getAuthHeader } from '@/services/auth'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

// ── Types ──────────────────────────────────────────────────────────

type AnalysisMode = 'subject_to' | 'cash' | 'owner_finance' | 'lease_option' | 'blend'

interface DealAnalyzerProps {
  dealId: string
  preferences: any
  dealData?: {
    purchasePrice?: number
    arv?: number
    rehabEstimate?: number
    monthlyRent?: number
    listPrice?: number
  }
}

interface ModeResult {
  totalInvestment: number
  profit: number
  roi: number
  monthlyCashFlow: number
  annualCashFlow: number
  capRate: number
  cashOnCash: number
  maxOffer: number
  meetsRule: boolean
  rating: number
}

// ── Amortization helper ──────────────────────────────────────────

function calcMonthlyPayment(principal: number, annualRate: number, years: number): number {
  if (principal <= 0 || years <= 0) return 0
  if (annualRate <= 0) return principal / (years * 12)
  const r = annualRate / 12
  const n = years * 12
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
}

function calcAmortizationSchedule(
  principal: number,
  annualRate: number,
  years: number
): { month: number; payment: number; principal: number; interest: number; balance: number }[] {
  const schedule: { month: number; payment: number; principal: number; interest: number; balance: number }[] = []
  if (principal <= 0 || years <= 0) return schedule
  const monthlyPayment = calcMonthlyPayment(principal, annualRate, years)
  const r = annualRate / 12
  let balance = principal
  const n = years * 12
  for (let i = 1; i <= n; i++) {
    const interest = balance * r
    const principalPaid = monthlyPayment - interest
    balance = Math.max(0, balance - principalPaid)
    schedule.push({
      month: i,
      payment: monthlyPayment,
      principal: principalPaid,
      interest,
      balance,
    })
  }
  return schedule
}

function rateAnalysis(roi: number, meetsRule: boolean, capRate: number, profit: number): number {
  let rating = 0
  if (roi >= 30) rating += 2
  else if (roi >= 15) rating += 1
  if (meetsRule) rating += 1
  if (capRate >= 8) rating += 1
  if (profit > 0) rating += 1
  return Math.min(rating, 5)
}

// ── Mode tabs config ─────────────────────────────────────────────

const MODE_TABS: { id: AnalysisMode; label: string }[] = [
  { id: 'subject_to', label: 'Subject To' },
  { id: 'cash', label: 'Cash Purchase' },
  { id: 'owner_finance', label: 'Owner Financing' },
  { id: 'lease_option', label: 'Lease Option' },
  { id: 'blend', label: 'Blend' },
]

// ── Shared input component ───────────────────────────────────────

function NumInput({
  label,
  value,
  onChange,
  step,
  prefix,
  suffix,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  step?: string
  prefix?: string
  suffix?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
            {prefix}
          </span>
        )}
        <input
          type="number"
          step={step || 'any'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500',
            prefix ? 'pl-7 pr-3' : 'px-3',
            suffix ? 'pr-8' : ''
          )}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

function Stars({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            'w-5 h-5',
            i < count ? 'fill-yellow-400 text-yellow-400' : 'text-slate-200'
          )}
        />
      ))}
    </div>
  )
}

function ResultCard({
  label,
  value,
  positive,
  neutral,
}: {
  label: string
  value: string
  positive?: boolean
  neutral?: boolean
}) {
  const bg = neutral ? 'bg-slate-50' : positive ? 'bg-green-50' : 'bg-red-50'
  const text = neutral ? 'text-slate-800' : positive ? 'text-green-700' : 'text-red-700'
  const labelColor = neutral ? 'text-slate-500' : positive ? 'text-green-600' : 'text-red-600'
  return (
    <div className={cn('p-3 rounded-lg', bg)}>
      <p className={cn('text-xs', labelColor)}>{label}</p>
      <p className={cn('text-sm font-semibold', text)}>{value}</p>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────

export default function DealAnalyzer({ dealId, preferences, dealData }: DealAnalyzerProps) {
  const prefs = preferences || {}

  // Active mode
  const [activeMode, setActiveMode] = useState<AnalysisMode>('subject_to')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showComparison, setShowComparison] = useState(false)

  // ── Shared inputs (seeded from deal data) ──────────────────────
  const [purchasePrice, setPurchasePrice] = useState(
    dealData?.purchasePrice?.toString() || ''
  )
  const [arv, setArv] = useState(dealData?.arv?.toString() || '')
  const [rehab, setRehab] = useState(dealData?.rehabEstimate?.toString() || '')
  const [monthlyRent, setMonthlyRent] = useState(
    dealData?.monthlyRent?.toString() || ''
  )

  // ── General settings ───────────────────────────────────────────
  const [arvMultiplier, setArvMultiplier] = useState(
    ((prefs.arv_multiplier ?? 0.70) * 100).toString()
  )
  const [closingCostsPct, setClosingCostsPct] = useState(
    ((prefs.default_closing_costs_pct ?? 0.03) * 100).toString()
  )
  const [agentCommPct, setAgentCommPct] = useState(
    ((prefs.default_agent_commission_pct ?? 0.06) * 100).toString()
  )
  const [holdingMonths, setHoldingMonths] = useState(
    (prefs.default_holding_months ?? 6).toString()
  )
  const [monthlyHoldingCost, setMonthlyHoldingCost] = useState(
    (prefs.default_monthly_holding_cost ?? 1000).toString()
  )
  const [minProfit, setMinProfit] = useState(
    (prefs.min_profit ?? 20000).toString()
  )
  const [minRoiPct, setMinRoiPct] = useState(
    ((prefs.min_roi_pct ?? 0.15) * 100).toString()
  )

  // ── Subject-To inputs ──────────────────────────────────────────
  const [sub2ExistingBalance, setSub2ExistingBalance] = useState('')
  const [sub2ExistingRate, setSub2ExistingRate] = useState(
    ((prefs.sub2_default_interest_rate ?? 0.04) * 100).toString()
  )
  const [sub2ExistingPayment, setSub2ExistingPayment] = useState('')
  const [sub2RemainingYears, setSub2RemainingYears] = useState('25')
  const [sub2RentalIncome, setSub2RentalIncome] = useState(
    (prefs.sub2_default_rental_income ?? 1500).toString()
  )
  const [sub2VacancyPct, setSub2VacancyPct] = useState(
    ((prefs.sub2_default_vacancy_pct ?? 0.08) * 100).toString()
  )
  const [sub2MgmtPct, setSub2MgmtPct] = useState(
    ((prefs.sub2_default_mgmt_pct ?? 0.10) * 100).toString()
  )
  const [sub2Insurance, setSub2Insurance] = useState('150')
  const [sub2Taxes, setSub2Taxes] = useState('200')

  // ── Cash Purchase inputs ───────────────────────────────────────
  // (uses shared inputs + settings)

  // ── Owner Financing inputs ─────────────────────────────────────
  const [ofRate, setOfRate] = useState(
    ((prefs.of_default_interest_rate ?? 0.06) * 100).toString()
  )
  const [ofTermYears, setOfTermYears] = useState(
    (prefs.of_default_term_years ?? 30).toString()
  )
  const [ofDownPct, setOfDownPct] = useState(
    ((prefs.of_default_down_pct ?? 0.10) * 100).toString()
  )
  const [ofBalloonYears, setOfBalloonYears] = useState('')

  // ── Lease Option inputs ────────────────────────────────────────
  const [loOptionFee, setLoOptionFee] = useState('')
  const [loMonthlyLease, setLoMonthlyLease] = useState('')
  const [loOptionTermYears, setLoOptionTermYears] = useState(
    (prefs.lo_default_option_term_years ?? 3).toString()
  )
  const [loMonthlyCreditPct, setLoMonthlyCreditPct] = useState(
    ((prefs.lo_default_monthly_credit_pct ?? 0.20) * 100).toString()
  )
  const [loStrikePrice, setLoStrikePrice] = useState('')

  // ── Blend inputs ───────────────────────────────────────────────
  const [blendCashPct, setBlendCashPct] = useState(
    ((prefs.blend_cash_pct ?? 0.50) * 100).toString()
  )

  // ── Parse helper ───────────────────────────────────────────────
  const p = (v: string) => parseFloat(v) || 0
  const pInt = (v: string) => parseInt(v) || 0

  // ── Subject-To Calculation ─────────────────────────────────────
  const subjectToResult = useMemo((): ModeResult => {
    const pp = p(purchasePrice)
    const arvVal = p(arv)
    const rehabVal = p(rehab)
    const existBal = p(sub2ExistingBalance)
    const existRate = p(sub2ExistingRate) / 100
    const remYrs = pInt(sub2RemainingYears)
    const rental = p(sub2RentalIncome)
    const vacPct = p(sub2VacancyPct) / 100
    const mgmtPct = p(sub2MgmtPct) / 100
    const insurance = p(sub2Insurance)
    const taxes = p(sub2Taxes)
    const closePct = p(closingCostsPct) / 100
    const holdMo = pInt(holdingMonths)
    const holdCost = p(monthlyHoldingCost)

    // Out of pocket: closing costs + rehab (taking over existing mortgage)
    const closingCosts = pp * closePct
    const cashToClose = closingCosts + rehabVal
    const holdingCosts = holdMo * holdCost

    // Existing mortgage payment
    const existingPayment = p(sub2ExistingPayment) ||
      calcMonthlyPayment(existBal, existRate, remYrs)

    // Net rental income
    const effectiveRent = rental * (1 - vacPct)
    const mgmt = rental * mgmtPct
    const totalExpenses = existingPayment + insurance + taxes + mgmt
    const monthlyCF = effectiveRent - totalExpenses
    const annualCF = monthlyCF * 12

    const totalInvestment = cashToClose + holdingCosts
    const maxOffer = arvVal * (p(arvMultiplier) / 100) - rehabVal
    const meetsRule = pp <= maxOffer

    // Equity capture: ARV - existing balance - rehab
    const equityCapture = arvVal - existBal - rehabVal - closingCosts
    const profit = equityCapture
    const roi = totalInvestment > 0 ? (profit / totalInvestment) * 100 : 0
    const capRate = totalInvestment > 0 ? (annualCF / totalInvestment) * 100 : 0
    const cashOnCash = totalInvestment > 0 ? (annualCF / totalInvestment) * 100 : 0

    return {
      totalInvestment,
      profit,
      roi,
      monthlyCashFlow: monthlyCF,
      annualCashFlow: annualCF,
      capRate,
      cashOnCash,
      maxOffer,
      meetsRule,
      rating: rateAnalysis(roi, meetsRule, capRate, profit),
    }
  }, [purchasePrice, arv, rehab, sub2ExistingBalance, sub2ExistingRate,
    sub2ExistingPayment, sub2RemainingYears, sub2RentalIncome, sub2VacancyPct,
    sub2MgmtPct, sub2Insurance, sub2Taxes, closingCostsPct, holdingMonths,
    monthlyHoldingCost, arvMultiplier])

  // ── Cash Purchase Calculation ──────────────────────────────────
  const cashResult = useMemo((): ModeResult => {
    const pp = p(purchasePrice)
    const arvVal = p(arv)
    const rehabVal = p(rehab)
    const rent = p(monthlyRent)
    const closePct = p(closingCostsPct) / 100
    const commPct = p(agentCommPct) / 100
    const holdMo = pInt(holdingMonths)
    const holdCost = p(monthlyHoldingCost)

    const closingCosts = pp * closePct
    const holdingCosts = holdMo * holdCost
    const sellingCosts = arvVal * commPct
    const totalInvestment = pp + rehabVal + closingCosts + holdingCosts

    const profit = arvVal - totalInvestment - sellingCosts
    const roi = totalInvestment > 0 ? (profit / totalInvestment) * 100 : 0
    const maxOffer = arvVal * (p(arvMultiplier) / 100) - rehabVal
    const meetsRule = pp <= maxOffer

    const annualRent = rent * 12
    const capRate = totalInvestment > 0 ? (annualRent / totalInvestment) * 100 : 0
    const cashOnCash = totalInvestment > 0
      ? ((annualRent - holdCost * 12) / totalInvestment) * 100
      : 0
    const monthlyCF = rent - holdCost

    return {
      totalInvestment,
      profit,
      roi,
      monthlyCashFlow: monthlyCF,
      annualCashFlow: annualRent - holdCost * 12,
      capRate,
      cashOnCash,
      maxOffer,
      meetsRule,
      rating: rateAnalysis(roi, meetsRule, capRate, profit),
    }
  }, [purchasePrice, arv, rehab, monthlyRent, closingCostsPct, agentCommPct,
    holdingMonths, monthlyHoldingCost, arvMultiplier])

  // ── Owner Financing Calculation ────────────────────────────────
  const ownerFinanceResult = useMemo((): ModeResult => {
    const pp = p(purchasePrice)
    const arvVal = p(arv)
    const rehabVal = p(rehab)
    const rent = p(monthlyRent)
    const rate = p(ofRate) / 100
    const term = pInt(ofTermYears)
    const downPct = p(ofDownPct) / 100
    const closePct = p(closingCostsPct) / 100
    const holdMo = pInt(holdingMonths)
    const holdCost = p(monthlyHoldingCost)

    const downPayment = pp * downPct
    const loanAmount = pp - downPayment
    const closingCosts = pp * closePct
    const holdingCosts = holdMo * holdCost

    const monthlyPayment = calcMonthlyPayment(loanAmount, rate, term)
    const cashToClose = downPayment + closingCosts + rehabVal
    const totalInvestment = cashToClose + holdingCosts

    const monthlyCF = rent - monthlyPayment - holdCost
    const annualCF = monthlyCF * 12

    const maxOffer = arvVal * (p(arvMultiplier) / 100) - rehabVal
    const meetsRule = pp <= maxOffer

    // Total interest over life
    const totalPaid = monthlyPayment * term * 12
    const totalInterest = totalPaid - loanAmount

    // Profit from flip scenario
    const flipProfit = arvVal - pp - rehabVal - closingCosts - holdingCosts
    const roi = totalInvestment > 0 ? (flipProfit / totalInvestment) * 100 : 0
    const capRate = totalInvestment > 0 ? (annualCF / totalInvestment) * 100 : 0
    const cashOnCash = totalInvestment > 0 ? (annualCF / totalInvestment) * 100 : 0

    return {
      totalInvestment,
      profit: flipProfit,
      roi,
      monthlyCashFlow: monthlyCF,
      annualCashFlow: annualCF,
      capRate,
      cashOnCash,
      maxOffer,
      meetsRule,
      rating: rateAnalysis(roi, meetsRule, capRate, flipProfit),
    }
  }, [purchasePrice, arv, rehab, monthlyRent, ofRate, ofTermYears, ofDownPct,
    closingCostsPct, holdingMonths, monthlyHoldingCost, arvMultiplier])

  // ── Lease Option Calculation ───────────────────────────────────
  const leaseOptionResult = useMemo((): ModeResult => {
    const pp = p(purchasePrice)
    const arvVal = p(arv)
    const rehabVal = p(rehab)
    const optionFee = p(loOptionFee)
    const lease = p(loMonthlyLease)
    const termYrs = pInt(loOptionTermYears)
    const creditPct = p(loMonthlyCreditPct) / 100
    const strike = p(loStrikePrice) || arvVal
    const closePct = p(closingCostsPct) / 100

    const closingCosts = pp * closePct
    const cashToClose = optionFee + closingCosts + rehabVal
    const totalInvestment = cashToClose

    // Monthly rent credit
    const monthlyCredit = lease * creditPct
    const totalCredits = monthlyCredit * termYrs * 12

    // Net monthly cost while leasing
    const rent = p(monthlyRent)
    const monthlyCF = rent - lease

    // Profit at exercise: ARV - strike price - credits already applied
    const profitAtExercise = strike - pp - closingCosts - rehabVal + totalCredits
    const annualCF = monthlyCF * 12

    const maxOffer = arvVal * (p(arvMultiplier) / 100) - rehabVal
    const meetsRule = pp <= maxOffer
    const roi = totalInvestment > 0 ? (profitAtExercise / totalInvestment) * 100 : 0
    const capRate = totalInvestment > 0 ? (annualCF / totalInvestment) * 100 : 0
    const cashOnCash = totalInvestment > 0 ? (annualCF / totalInvestment) * 100 : 0

    return {
      totalInvestment,
      profit: profitAtExercise,
      roi,
      monthlyCashFlow: monthlyCF,
      annualCashFlow: annualCF,
      capRate,
      cashOnCash,
      maxOffer,
      meetsRule,
      rating: rateAnalysis(roi, meetsRule, capRate, profitAtExercise),
    }
  }, [purchasePrice, arv, rehab, loOptionFee, loMonthlyLease, loOptionTermYears,
    loMonthlyCreditPct, loStrikePrice, monthlyRent, closingCostsPct, arvMultiplier])

  // ── Blend Calculation ──────────────────────────────────────────
  const blendResult = useMemo((): ModeResult => {
    const cashWeight = p(blendCashPct) / 100
    const ofWeight = 1 - cashWeight

    const blend = (a: number, b: number) => a * cashWeight + b * ofWeight

    return {
      totalInvestment: blend(cashResult.totalInvestment, ownerFinanceResult.totalInvestment),
      profit: blend(cashResult.profit, ownerFinanceResult.profit),
      roi: blend(cashResult.roi, ownerFinanceResult.roi),
      monthlyCashFlow: blend(cashResult.monthlyCashFlow, ownerFinanceResult.monthlyCashFlow),
      annualCashFlow: blend(cashResult.annualCashFlow, ownerFinanceResult.annualCashFlow),
      capRate: blend(cashResult.capRate, ownerFinanceResult.capRate),
      cashOnCash: blend(cashResult.cashOnCash, ownerFinanceResult.cashOnCash),
      maxOffer: blend(cashResult.maxOffer, ownerFinanceResult.maxOffer),
      meetsRule: cashResult.meetsRule && ownerFinanceResult.meetsRule,
      rating: Math.round(blend(cashResult.rating, ownerFinanceResult.rating)),
    }
  }, [cashResult, ownerFinanceResult, blendCashPct])

  // ── Get result for active mode ─────────────────────────────────
  const resultMap: Record<AnalysisMode, ModeResult> = {
    subject_to: subjectToResult,
    cash: cashResult,
    owner_finance: ownerFinanceResult,
    lease_option: leaseOptionResult,
    blend: blendResult,
  }
  const activeResult = resultMap[activeMode]

  // ── Save analysis ──────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const analysisData = {
        modes: {
          subject_to: subjectToResult,
          cash: cashResult,
          owner_finance: ownerFinanceResult,
          lease_option: leaseOptionResult,
          blend: blendResult,
        },
        inputs: {
          purchasePrice: p(purchasePrice),
          arv: p(arv),
          rehab: p(rehab),
          monthlyRent: p(monthlyRent),
        },
        savedAt: new Date().toISOString(),
      }

      const res = await fetch(`${BASE_URL}/api/deals/${dealId}`, {
        method: 'PATCH',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ analyzer_data: JSON.stringify(analysisData) }),
      })

      if (!res.ok) throw new Error('Failed to save')
      toast.success('Analysis saved')
    } catch {
      toast.error('Failed to save analysis')
    } finally {
      setSaving(false)
    }
  }, [dealId, subjectToResult, cashResult, ownerFinanceResult, leaseOptionResult,
    blendResult, purchasePrice, arv, rehab, monthlyRent])

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header + stars */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
          <Calculator className="w-5 h-5 text-primary-500" />
          Deal Analyzer
        </h3>
        <Stars count={activeResult.rating} />
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
        {MODE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveMode(tab.id)}
            className={cn(
              'flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all',
              activeMode === tab.id
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Shared inputs */}
      <div className="grid grid-cols-2 gap-3">
        <NumInput label="Purchase Price" value={purchasePrice} onChange={setPurchasePrice} prefix="$" />
        <NumInput label="After Repair Value (ARV)" value={arv} onChange={setArv} prefix="$" />
        <NumInput label="Rehab Estimate" value={rehab} onChange={setRehab} prefix="$" />
        <NumInput label="Monthly Rent" value={monthlyRent} onChange={setMonthlyRent} prefix="$" />
      </div>

      {/* Collapsible settings panel */}
      <button
        onClick={() => setSettingsOpen(!settingsOpen)}
        className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
      >
        {settingsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        Settings & Defaults
      </button>

      {settingsOpen && (
        <div className="bg-slate-50 rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">General Defaults</p>
          <div className="grid grid-cols-2 gap-3">
            <NumInput label="ARV Multiplier" value={arvMultiplier} onChange={setArvMultiplier} suffix="%" step="1" />
            <NumInput label="Closing Costs" value={closingCostsPct} onChange={setClosingCostsPct} suffix="%" step="0.5" />
            <NumInput label="Agent Commission" value={agentCommPct} onChange={setAgentCommPct} suffix="%" step="0.5" />
            <NumInput label="Holding Months" value={holdingMonths} onChange={setHoldingMonths} step="1" />
            <NumInput label="Monthly Holding Cost" value={monthlyHoldingCost} onChange={setMonthlyHoldingCost} prefix="$" />
            <NumInput label="Min Profit Target" value={minProfit} onChange={setMinProfit} prefix="$" />
            <NumInput label="Min ROI Target" value={minRoiPct} onChange={setMinRoiPct} suffix="%" step="1" />
          </div>
        </div>
      )}

      {/* Mode-specific inputs */}
      {activeMode === 'subject_to' && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Subject-To Details</p>
          <div className="grid grid-cols-2 gap-3">
            <NumInput label="Existing Mortgage Balance" value={sub2ExistingBalance} onChange={setSub2ExistingBalance} prefix="$" />
            <NumInput label="Existing Interest Rate" value={sub2ExistingRate} onChange={setSub2ExistingRate} suffix="%" step="0.25" />
            <NumInput label="Existing Monthly Payment" value={sub2ExistingPayment} onChange={setSub2ExistingPayment} prefix="$" />
            <NumInput label="Remaining Years on Loan" value={sub2RemainingYears} onChange={setSub2RemainingYears} step="1" />
            <NumInput label="Expected Rental Income" value={sub2RentalIncome} onChange={setSub2RentalIncome} prefix="$" />
            <NumInput label="Vacancy Rate" value={sub2VacancyPct} onChange={setSub2VacancyPct} suffix="%" step="1" />
            <NumInput label="Management Fee" value={sub2MgmtPct} onChange={setSub2MgmtPct} suffix="%" step="1" />
            <NumInput label="Monthly Insurance" value={sub2Insurance} onChange={setSub2Insurance} prefix="$" />
            <NumInput label="Monthly Taxes" value={sub2Taxes} onChange={setSub2Taxes} prefix="$" />
          </div>
        </div>
      )}

      {activeMode === 'cash' && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Cash Purchase Details</p>
          <p className="text-xs text-slate-400">
            Uses shared inputs above plus closing costs, agent commission, and holding costs from settings.
          </p>
        </div>
      )}

      {activeMode === 'owner_finance' && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Owner Financing Details</p>
          <div className="grid grid-cols-2 gap-3">
            <NumInput label="Interest Rate" value={ofRate} onChange={setOfRate} suffix="%" step="0.25" />
            <NumInput label="Term (Years)" value={ofTermYears} onChange={setOfTermYears} step="1" />
            <NumInput label="Down Payment" value={ofDownPct} onChange={setOfDownPct} suffix="%" step="1" />
            <NumInput label="Balloon Payment (Years)" value={ofBalloonYears} onChange={setOfBalloonYears} step="1" />
          </div>
          {p(purchasePrice) > 0 && p(ofRate) > 0 && pInt(ofTermYears) > 0 && (
            <div className="text-xs text-slate-400 space-y-0.5">
              <p>
                Loan amount: {formatCurrency(p(purchasePrice) * (1 - p(ofDownPct) / 100))}
              </p>
              <p>
                Monthly payment: {formatCurrency(
                  calcMonthlyPayment(
                    p(purchasePrice) * (1 - p(ofDownPct) / 100),
                    p(ofRate) / 100,
                    pInt(ofTermYears)
                  )
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {activeMode === 'lease_option' && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Lease Option Details</p>
          <div className="grid grid-cols-2 gap-3">
            <NumInput label="Option Fee" value={loOptionFee} onChange={setLoOptionFee} prefix="$" />
            <NumInput label="Monthly Lease Payment" value={loMonthlyLease} onChange={setLoMonthlyLease} prefix="$" />
            <NumInput label="Option Term (Years)" value={loOptionTermYears} onChange={setLoOptionTermYears} step="1" />
            <NumInput label="Monthly Rent Credit" value={loMonthlyCreditPct} onChange={setLoMonthlyCreditPct} suffix="%" step="1" />
            <NumInput label="Strike Price (default=ARV)" value={loStrikePrice} onChange={setLoStrikePrice} prefix="$" />
          </div>
          {p(loMonthlyLease) > 0 && (
            <div className="text-xs text-slate-400">
              <p>Monthly credit: {formatCurrency(p(loMonthlyLease) * (p(loMonthlyCreditPct) / 100))}</p>
              <p>Total credits over term: {formatCurrency(
                p(loMonthlyLease) * (p(loMonthlyCreditPct) / 100) * pInt(loOptionTermYears) * 12
              )}</p>
            </div>
          )}
        </div>
      )}

      {activeMode === 'blend' && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Blend Weighting</p>
          <p className="text-xs text-slate-400">
            Weighted average of Cash Purchase and Owner Financing results.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <NumInput label="Cash Weight" value={blendCashPct} onChange={setBlendCashPct} suffix="%" step="5" />
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Owner Finance Weight</label>
              <div className="w-full py-2 px-3 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-600">
                {(100 - p(blendCashPct)).toFixed(0)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          {MODE_TABS.find(t => t.id === activeMode)?.label} Results
        </p>
        <div className="grid grid-cols-2 gap-3">
          <ResultCard
            label="Total Investment"
            value={formatCurrency(activeResult.totalInvestment)}
            neutral
          />
          <ResultCard
            label="Est. Profit"
            value={formatCurrency(Math.abs(activeResult.profit))}
            positive={activeResult.profit >= 0}
          />
          <ResultCard
            label="ROI"
            value={`${activeResult.roi.toFixed(1)}%`}
            positive={activeResult.roi >= p(minRoiPct)}
            neutral={activeResult.roi >= 0 && activeResult.roi < p(minRoiPct)}
          />
          <ResultCard
            label={`Max Offer (${p(arvMultiplier).toFixed(0)}% Rule)`}
            value={formatCurrency(activeResult.maxOffer)}
            positive={activeResult.meetsRule}
          />
          <ResultCard
            label="Monthly Cash Flow"
            value={formatCurrency(Math.abs(activeResult.monthlyCashFlow))}
            positive={activeResult.monthlyCashFlow >= 0}
          />
          <ResultCard
            label="Cap Rate"
            value={`${activeResult.capRate.toFixed(1)}%`}
            positive={activeResult.capRate >= 8}
            neutral={activeResult.capRate >= 0 && activeResult.capRate < 8}
          />
          <ResultCard
            label="Cash-on-Cash Return"
            value={`${activeResult.cashOnCash.toFixed(1)}%`}
            positive={activeResult.cashOnCash >= 8}
            neutral={activeResult.cashOnCash >= 0 && activeResult.cashOnCash < 8}
          />
          <div className={cn('p-3 rounded-lg', activeResult.meetsRule ? 'bg-green-50' : 'bg-red-50')}>
            <p className="text-xs text-slate-500">{p(arvMultiplier).toFixed(0)}% Rule</p>
            <p className={cn('text-sm font-semibold', activeResult.meetsRule ? 'text-green-700' : 'text-red-700')}>
              {activeResult.meetsRule ? 'PASS' : 'FAIL'}
            </p>
          </div>
        </div>

        {/* Profit target check */}
        {activeResult.profit > 0 && activeResult.profit < p(minProfit) && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            Profit ({formatCurrency(activeResult.profit)}) is below your minimum target ({formatCurrency(p(minProfit))}).
          </p>
        )}
      </div>

      {/* Comparison toggle */}
      <button
        onClick={() => setShowComparison(!showComparison)}
        className="flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-800"
      >
        <BarChart3 className="w-3.5 h-3.5" />
        {showComparison ? 'Hide Comparison' : 'Compare All Modes'}
      </button>

      {showComparison && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 pr-2 text-slate-500 font-medium">Metric</th>
                {MODE_TABS.map((tab) => (
                  <th key={tab.id} className="text-right py-2 px-1 text-slate-500 font-medium whitespace-nowrap">
                    {tab.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                { label: 'Investment', key: 'totalInvestment', fmt: (v: number) => formatCurrency(v) },
                { label: 'Profit', key: 'profit', fmt: (v: number) => formatCurrency(v) },
                { label: 'ROI', key: 'roi', fmt: (v: number) => `${v.toFixed(1)}%` },
                { label: 'Monthly CF', key: 'monthlyCashFlow', fmt: (v: number) => formatCurrency(v) },
                { label: 'Cap Rate', key: 'capRate', fmt: (v: number) => `${v.toFixed(1)}%` },
                { label: 'Cash-on-Cash', key: 'cashOnCash', fmt: (v: number) => `${v.toFixed(1)}%` },
                { label: 'Rating', key: 'rating', fmt: (v: number) => `${'*'.repeat(v)}` },
              ].map((row) => (
                <tr key={row.key}>
                  <td className="py-1.5 pr-2 text-slate-600 font-medium">{row.label}</td>
                  {MODE_TABS.map((tab) => {
                    const val = (resultMap[tab.id] as any)[row.key] as number
                    const isProfit = row.key === 'profit' || row.key === 'monthlyCashFlow'
                    return (
                      <td
                        key={tab.id}
                        className={cn(
                          'py-1.5 px-1 text-right font-medium',
                          isProfit && val < 0 ? 'text-red-600' : 'text-slate-700'
                        )}
                      >
                        {row.fmt(val)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Save className="w-4 h-4" />
        )}
        Save Analysis
      </button>
    </div>
  )
}
