import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  DollarSign,
  Home,
  Wrench,
  Landmark,
  Receipt,
  TrendingUp,
  Save,
  RotateCcw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { useUpdateDeal, useDeal } from '@/hooks/useApi'
import { formatCurrency } from '@/utils/helpers'
import type { Deal } from '@/types'

// ── Currency input helper ────────────────────────────────────────────

function CurrencyInput({
  label,
  value,
  onChange,
  placeholder,
  prefix = '$',
  suffix,
  step,
}: {
  label: string
  value: number | undefined
  onChange: (v: number | undefined) => void
  placeholder?: string
  prefix?: string
  suffix?: string
  step?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
            {prefix}
          </span>
        )}
        <input
          type="number"
          value={value ?? ''}
          onChange={(e) =>
            onChange(e.target.value === '' ? undefined : Number(e.target.value))
          }
          placeholder={placeholder || '0'}
          step={step || '1'}
          className={`w-full ${prefix ? 'pl-7' : 'pl-3'} ${suffix ? 'pr-8' : 'pr-3'} py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent`}
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

// ── Collapsible Section ──────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  iconColor,
  children,
  defaultOpen = true,
  summary,
}: {
  title: string
  icon: any
  iconColor: string
  children: React.ReactNode
  defaultOpen?: boolean
  summary?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${iconColor}`} />
          <span className="text-sm font-semibold text-slate-700">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          {summary && (
            <span className="text-xs font-medium text-slate-500">
              {summary}
            </span>
          )}
          {open ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  )
}

// ── Computed Summary Row ─────────────────────────────────────────────

function SummaryRow({
  label,
  value,
  isPositive,
  isBold,
}: {
  label: string
  value: number
  isPositive?: boolean
  isBold?: boolean
}) {
  const color =
    isPositive === undefined
      ? 'text-slate-800'
      : isPositive
        ? 'text-green-600'
        : 'text-red-600'
  return (
    <div className="flex items-center justify-between py-1.5">
      <span
        className={`text-sm ${isBold ? 'font-semibold text-slate-800' : 'text-slate-600'}`}
      >
        {label}
      </span>
      <span className={`text-sm font-semibold ${color}`}>
        {formatCurrency(value)}
      </span>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────

export default function DealExpenditures({ dealId }: { dealId: string }) {
  const { data: deal } = useDeal(dealId)
  const updateDeal = useUpdateDeal()

  // Local form state — initialized from deal
  const [form, setForm] = useState<Partial<Deal>>({})
  const [dirty, setDirty] = useState(false)

  // Seed form when deal loads
  useEffect(() => {
    if (!deal) return
    setForm({
      // Pricing
      listPrice: deal.listPrice,
      offerPrice: deal.offerPrice,
      purchasePrice: deal.purchasePrice,
      arv: deal.arv,
      // Acquisition
      earnestMoney: deal.earnestMoney,
      downPayment: deal.downPayment,
      closingCostsBuyer: deal.closingCostsBuyer,
      loanOriginationFee: deal.loanOriginationFee,
      appraisalFee: deal.appraisalFee,
      inspectionFee: deal.inspectionFee,
      titleInsurance: deal.titleInsurance,
      attorneyFee: deal.attorneyFee,
      surveyFee: deal.surveyFee,
      otherAcquisitionCosts: deal.otherAcquisitionCosts,
      // Rehab
      rehabEstimate: deal.rehabEstimate,
      rehabActual: deal.rehabActual,
      permitFees: deal.permitFees,
      architectFees: deal.architectFees,
      holdingCostsDuringRehab: deal.holdingCostsDuringRehab,
      // Financing
      loanAmount: deal.loanAmount,
      interestRate: deal.interestRate,
      loanTermMonths: deal.loanTermMonths,
      monthlyMortgagePI: deal.monthlyMortgagePI,
      pmiMonthly: deal.pmiMonthly,
      // Expenses
      propertyTaxAnnual: deal.propertyTaxAnnual,
      insuranceAnnual: deal.insuranceAnnual,
      propertyMgmtPercent: deal.propertyMgmtPercent,
      propertyMgmtFlat: deal.propertyMgmtFlat,
      vacancyPercent: deal.vacancyPercent,
      maintenancePercent: deal.maintenancePercent,
      hoaMonthly: deal.hoaMonthly,
      utilitiesMonthly: deal.utilitiesMonthly,
      otherExpensesMonthly: deal.otherExpensesMonthly,
      // Income
      monthlyRent: deal.monthlyRent,
      otherMonthlyIncome: deal.otherMonthlyIncome,
    })
    setDirty(false)
  }, [deal])

  // Update a field
  const set = useCallback(
    (field: keyof Deal, value: number | undefined) => {
      setForm((prev) => ({ ...prev, [field]: value }))
      setDirty(true)
    },
    []
  )

  // ── Computed values ──────────────────────────────────────────

  const computed = useMemo(() => {
    const downPayment = form.downPayment || 0
    const closingCosts = form.closingCostsBuyer || 0
    const loanOrigination = form.loanOriginationFee || 0
    const appraisal = form.appraisalFee || 0
    const inspection = form.inspectionFee || 0
    const title = form.titleInsurance || 0
    const attorney = form.attorneyFee || 0
    const survey = form.surveyFee || 0
    const otherAcq = form.otherAcquisitionCosts || 0

    const totalAcquisition =
      downPayment +
      closingCosts +
      loanOrigination +
      appraisal +
      inspection +
      title +
      attorney +
      survey +
      otherAcq

    const rehab = form.rehabActual || form.rehabEstimate || 0
    const permits = form.permitFees || 0
    const architect = form.architectFees || 0
    const holdingRehab = form.holdingCostsDuringRehab || 0
    const totalRehab = rehab + permits + architect + holdingRehab

    const totalCashInvested = totalAcquisition + totalRehab

    // Monthly income
    const rent = form.monthlyRent || 0
    const otherIncome = form.otherMonthlyIncome || 0
    const grossMonthlyIncome = rent + otherIncome

    // Monthly expenses
    const mortgage = form.monthlyMortgagePI || 0
    const pmi = form.pmiMonthly || 0
    const taxMonthly = (form.propertyTaxAnnual || 0) / 12
    const insMonthly = (form.insuranceAnnual || 0) / 12
    const mgmt =
      form.propertyMgmtFlat ||
      (grossMonthlyIncome * (form.propertyMgmtPercent || 0)) / 100
    const vacancy =
      (grossMonthlyIncome * (form.vacancyPercent || 0)) / 100
    const maintenance =
      (grossMonthlyIncome * (form.maintenancePercent || 0)) / 100
    const hoa = form.hoaMonthly || 0
    const utilities = form.utilitiesMonthly || 0
    const otherExp = form.otherExpensesMonthly || 0

    const totalMonthlyExpenses =
      mortgage +
      pmi +
      taxMonthly +
      insMonthly +
      mgmt +
      vacancy +
      maintenance +
      hoa +
      utilities +
      otherExp

    const monthlyCashFlow = grossMonthlyIncome - totalMonthlyExpenses
    const annualCashFlow = monthlyCashFlow * 12

    // NOI (no debt service)
    const operatingExpenses =
      taxMonthly +
      insMonthly +
      mgmt +
      vacancy +
      maintenance +
      hoa +
      utilities +
      otherExp
    const noi = (grossMonthlyIncome - operatingExpenses) * 12

    // Cash-on-Cash
    const cashOnCash =
      totalCashInvested > 0
        ? Math.round((annualCashFlow / totalCashInvested) * 1000) / 10
        : 0

    // Cap Rate
    const purchasePrice = form.purchasePrice || 0
    const capRate =
      purchasePrice > 0
        ? Math.round((noi / purchasePrice) * 1000) / 10
        : 0

    // ROI (equity-based)
    const arv = form.arv || 0
    const equity = arv - purchasePrice
    const roiPercent =
      totalCashInvested > 0
        ? Math.round((equity / totalCashInvested) * 1000) / 10
        : 0

    // DSCR
    const annualDebtService = (mortgage + pmi) * 12
    const dscr =
      annualDebtService > 0
        ? Math.round((noi / annualDebtService) * 100) / 100
        : 0

    return {
      totalAcquisition,
      totalRehab,
      totalCashInvested,
      grossMonthlyIncome,
      totalMonthlyExpenses,
      monthlyCashFlow,
      annualCashFlow,
      noi,
      cashOnCash,
      capRate,
      roiPercent,
      dscr,
    }
  }, [form])

  // ── Save handler ─────────────────────────────────────────────

  const handleSave = () => {
    if (!deal) return
    updateDeal.mutate(
      {
        id: deal.id,
        data: {
          ...form,
          // Store computed values too
          allInCost: computed.totalCashInvested,
          totalMonthlyExpenses: computed.totalMonthlyExpenses,
          monthlyCashFlow: computed.monthlyCashFlow,
          annualCashFlow: computed.annualCashFlow,
          cashOnCash: computed.cashOnCash,
          capRate: computed.capRate,
          roiPercent: computed.roiPercent,
          debtServiceCoverageRatio: computed.dscr,
        },
      },
      {
        onSuccess: () => {
          toast.success('Expenditures saved')
          setDirty(false)
        },
      }
    )
  }

  const handleReset = () => {
    if (!deal) return
    setForm({
      listPrice: deal.listPrice,
      offerPrice: deal.offerPrice,
      purchasePrice: deal.purchasePrice,
      arv: deal.arv,
      earnestMoney: deal.earnestMoney,
      downPayment: deal.downPayment,
      closingCostsBuyer: deal.closingCostsBuyer,
      loanOriginationFee: deal.loanOriginationFee,
      appraisalFee: deal.appraisalFee,
      inspectionFee: deal.inspectionFee,
      titleInsurance: deal.titleInsurance,
      attorneyFee: deal.attorneyFee,
      surveyFee: deal.surveyFee,
      otherAcquisitionCosts: deal.otherAcquisitionCosts,
      rehabEstimate: deal.rehabEstimate,
      rehabActual: deal.rehabActual,
      permitFees: deal.permitFees,
      architectFees: deal.architectFees,
      holdingCostsDuringRehab: deal.holdingCostsDuringRehab,
      loanAmount: deal.loanAmount,
      interestRate: deal.interestRate,
      loanTermMonths: deal.loanTermMonths,
      monthlyMortgagePI: deal.monthlyMortgagePI,
      pmiMonthly: deal.pmiMonthly,
      propertyTaxAnnual: deal.propertyTaxAnnual,
      insuranceAnnual: deal.insuranceAnnual,
      propertyMgmtPercent: deal.propertyMgmtPercent,
      propertyMgmtFlat: deal.propertyMgmtFlat,
      vacancyPercent: deal.vacancyPercent,
      maintenancePercent: deal.maintenancePercent,
      hoaMonthly: deal.hoaMonthly,
      utilitiesMonthly: deal.utilitiesMonthly,
      otherExpensesMonthly: deal.otherExpensesMonthly,
      monthlyRent: deal.monthlyRent,
      otherMonthlyIncome: deal.otherMonthlyIncome,
    })
    setDirty(false)
  }

  if (!deal) return null

  return (
    <div className="space-y-4">
      {/* Header with Save / Reset */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">
          Deal Expenditures
        </h3>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!dirty}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-3.5 h-3.5" />
            Save
          </button>
        </div>
      </div>

      {/* ═══ Pricing & Valuation ═══ */}
      <Section
        title="Pricing & Valuation"
        icon={DollarSign}
        iconColor="text-green-600"
        summary={
          form.purchasePrice
            ? formatCurrency(form.purchasePrice)
            : 'Not set'
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <CurrencyInput
            label="List Price"
            value={form.listPrice}
            onChange={(v) => set('listPrice', v)}
          />
          <CurrencyInput
            label="Offer Price"
            value={form.offerPrice}
            onChange={(v) => set('offerPrice', v)}
          />
          <CurrencyInput
            label="Purchase Price (Contract)"
            value={form.purchasePrice}
            onChange={(v) => set('purchasePrice', v)}
          />
          <CurrencyInput
            label="After Repair Value (ARV)"
            value={form.arv}
            onChange={(v) => set('arv', v)}
          />
        </div>
      </Section>

      {/* ═══ Acquisition Costs ═══ */}
      <Section
        title="Acquisition Costs"
        icon={Receipt}
        iconColor="text-blue-600"
        summary={formatCurrency(computed.totalAcquisition)}
      >
        <div className="grid grid-cols-2 gap-3">
          <CurrencyInput
            label="Down Payment"
            value={form.downPayment}
            onChange={(v) => set('downPayment', v)}
          />
          <CurrencyInput
            label="Earnest Money Deposit"
            value={form.earnestMoney}
            onChange={(v) => set('earnestMoney', v)}
          />
          <CurrencyInput
            label="Closing Costs (Buyer)"
            value={form.closingCostsBuyer}
            onChange={(v) => set('closingCostsBuyer', v)}
          />
          <CurrencyInput
            label="Loan Origination Fee"
            value={form.loanOriginationFee}
            onChange={(v) => set('loanOriginationFee', v)}
          />
          <CurrencyInput
            label="Appraisal Fee"
            value={form.appraisalFee}
            onChange={(v) => set('appraisalFee', v)}
          />
          <CurrencyInput
            label="Inspection Fee"
            value={form.inspectionFee}
            onChange={(v) => set('inspectionFee', v)}
          />
          <CurrencyInput
            label="Title Insurance"
            value={form.titleInsurance}
            onChange={(v) => set('titleInsurance', v)}
          />
          <CurrencyInput
            label="Attorney Fee"
            value={form.attorneyFee}
            onChange={(v) => set('attorneyFee', v)}
          />
          <CurrencyInput
            label="Survey Fee"
            value={form.surveyFee}
            onChange={(v) => set('surveyFee', v)}
          />
          <CurrencyInput
            label="Other Acquisition Costs"
            value={form.otherAcquisitionCosts}
            onChange={(v) => set('otherAcquisitionCosts', v)}
          />
        </div>
        <div className="mt-3 pt-3 border-t border-slate-200">
          <SummaryRow
            label="Total Acquisition Costs"
            value={computed.totalAcquisition}
            isBold
          />
        </div>
      </Section>

      {/* ═══ Rehab / Renovation ═══ */}
      <Section
        title="Rehab / Renovation"
        icon={Wrench}
        iconColor="text-orange-600"
        summary={formatCurrency(computed.totalRehab)}
      >
        <div className="grid grid-cols-2 gap-3">
          <CurrencyInput
            label="Rehab Estimate (Budget)"
            value={form.rehabEstimate}
            onChange={(v) => set('rehabEstimate', v)}
          />
          <CurrencyInput
            label="Rehab Actual (Spent)"
            value={form.rehabActual}
            onChange={(v) => set('rehabActual', v)}
          />
          <CurrencyInput
            label="Permit Fees"
            value={form.permitFees}
            onChange={(v) => set('permitFees', v)}
          />
          <CurrencyInput
            label="Architect / Design Fees"
            value={form.architectFees}
            onChange={(v) => set('architectFees', v)}
          />
          <CurrencyInput
            label="Holding Costs During Rehab"
            value={form.holdingCostsDuringRehab}
            onChange={(v) => set('holdingCostsDuringRehab', v)}
            placeholder="Loan + ins while rehabbing"
          />
        </div>
        <div className="mt-3 pt-3 border-t border-slate-200">
          <SummaryRow
            label="Total Rehab Costs"
            value={computed.totalRehab}
            isBold
          />
        </div>
      </Section>

      {/* ═══ Financing ═══ */}
      <Section
        title="Financing"
        icon={Landmark}
        iconColor="text-indigo-600"
        summary={
          form.loanAmount
            ? formatCurrency(form.loanAmount)
            : 'Not set'
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <CurrencyInput
            label="Loan Amount"
            value={form.loanAmount}
            onChange={(v) => set('loanAmount', v)}
          />
          <CurrencyInput
            label="Interest Rate"
            value={form.interestRate}
            onChange={(v) => set('interestRate', v)}
            prefix=""
            suffix="%"
            step="0.125"
          />
          <CurrencyInput
            label="Loan Term (Months)"
            value={form.loanTermMonths}
            onChange={(v) => set('loanTermMonths', v)}
            prefix=""
            placeholder="360 = 30yr"
          />
          <CurrencyInput
            label="Monthly P&I Payment"
            value={form.monthlyMortgagePI}
            onChange={(v) => set('monthlyMortgagePI', v)}
          />
          <CurrencyInput
            label="PMI (Monthly)"
            value={form.pmiMonthly}
            onChange={(v) => set('pmiMonthly', v)}
          />
        </div>
      </Section>

      {/* ═══ Monthly Operating Expenses ═══ */}
      <Section
        title="Monthly Operating Expenses"
        icon={Receipt}
        iconColor="text-red-500"
        summary={`${formatCurrency(computed.totalMonthlyExpenses)}/mo`}
      >
        <div className="grid grid-cols-2 gap-3">
          <CurrencyInput
            label="Property Tax (Annual)"
            value={form.propertyTaxAnnual}
            onChange={(v) => set('propertyTaxAnnual', v)}
          />
          <CurrencyInput
            label="Insurance (Annual)"
            value={form.insuranceAnnual}
            onChange={(v) => set('insuranceAnnual', v)}
          />
          <CurrencyInput
            label="Property Mgmt %"
            value={form.propertyMgmtPercent}
            onChange={(v) => set('propertyMgmtPercent', v)}
            prefix=""
            suffix="% of rent"
            step="0.5"
          />
          <CurrencyInput
            label="Property Mgmt Flat (if no %)"
            value={form.propertyMgmtFlat}
            onChange={(v) => set('propertyMgmtFlat', v)}
          />
          <CurrencyInput
            label="Vacancy Reserve %"
            value={form.vacancyPercent}
            onChange={(v) => set('vacancyPercent', v)}
            prefix=""
            suffix="% of rent"
            step="1"
          />
          <CurrencyInput
            label="Maintenance / CapEx %"
            value={form.maintenancePercent}
            onChange={(v) => set('maintenancePercent', v)}
            prefix=""
            suffix="% of rent"
            step="1"
          />
          <CurrencyInput
            label="HOA (Monthly)"
            value={form.hoaMonthly}
            onChange={(v) => set('hoaMonthly', v)}
          />
          <CurrencyInput
            label="Utilities (Monthly)"
            value={form.utilitiesMonthly}
            onChange={(v) => set('utilitiesMonthly', v)}
            placeholder="If landlord-paid"
          />
          <CurrencyInput
            label="Other Monthly Expenses"
            value={form.otherExpensesMonthly}
            onChange={(v) => set('otherExpensesMonthly', v)}
          />
        </div>
        <div className="mt-3 pt-3 border-t border-slate-200">
          <SummaryRow
            label="Total Monthly Expenses"
            value={computed.totalMonthlyExpenses}
            isBold
          />
        </div>
      </Section>

      {/* ═══ Income ═══ */}
      <Section
        title="Income"
        icon={Home}
        iconColor="text-emerald-600"
        summary={`${formatCurrency(computed.grossMonthlyIncome)}/mo`}
      >
        <div className="grid grid-cols-2 gap-3">
          <CurrencyInput
            label="Monthly Rent"
            value={form.monthlyRent}
            onChange={(v) => set('monthlyRent', v)}
          />
          <CurrencyInput
            label="Other Monthly Income"
            value={form.otherMonthlyIncome}
            onChange={(v) => set('otherMonthlyIncome', v)}
            placeholder="Parking, laundry, storage"
          />
        </div>
      </Section>

      {/* ═══ Computed Summary ═══ */}
      <Section
        title="Calculated Returns"
        icon={TrendingUp}
        iconColor="text-primary-600"
        defaultOpen={true}
        summary={`CoC: ${computed.cashOnCash}%`}
      >
        <div className="divide-y divide-slate-100">
          <SummaryRow
            label="Total Cash Invested"
            value={computed.totalCashInvested}
            isBold
          />
          <SummaryRow
            label="Gross Monthly Income"
            value={computed.grossMonthlyIncome}
          />
          <SummaryRow
            label="Total Monthly Expenses"
            value={computed.totalMonthlyExpenses}
          />
          <SummaryRow
            label="Monthly Cash Flow"
            value={computed.monthlyCashFlow}
            isPositive={computed.monthlyCashFlow >= 0}
            isBold
          />
          <SummaryRow
            label="Annual Cash Flow"
            value={computed.annualCashFlow}
            isPositive={computed.annualCashFlow >= 0}
          />
          <SummaryRow label="NOI (Annual)" value={computed.noi} />
          <div className="flex items-center justify-between py-1.5">
            <span className="text-sm text-slate-600">Cash-on-Cash Return</span>
            <span
              className={`text-sm font-bold ${computed.cashOnCash >= 0 ? 'text-green-600' : 'text-red-600'}`}
            >
              {computed.cashOnCash}%
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-sm text-slate-600">Cap Rate</span>
            <span className="text-sm font-bold text-blue-600">
              {computed.capRate}%
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-sm text-slate-600">ROI (Equity)</span>
            <span
              className={`text-sm font-bold ${computed.roiPercent >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
            >
              {computed.roiPercent}%
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-sm text-slate-600">
              DSCR (Debt Service Coverage)
            </span>
            <span
              className={`text-sm font-bold ${computed.dscr >= 1.25 ? 'text-green-600' : computed.dscr >= 1 ? 'text-amber-600' : 'text-red-600'}`}
            >
              {computed.dscr}x
            </span>
          </div>
        </div>
      </Section>
    </div>
  )
}
