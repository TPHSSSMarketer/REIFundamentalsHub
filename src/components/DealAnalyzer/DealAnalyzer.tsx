import { useState } from 'react'
import {
  Calculator,
  DollarSign,
  Home,
  TrendingUp,
  TrendingDown,
  Target,
  BarChart3,
  RefreshCw,
  Info,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react'

type ExitStrategy = 'wholesale' | 'fix_and_flip' | 'buy_and_hold'

interface AnalysisResult {
  arv: number
  mao: number
  totalRepairCost: number
  purchasePrice: number
  profit: number
  roi: number
  exitStrategy: ExitStrategy
  cashOnCash?: number
  monthlyRent?: number
  monthlyCashFlow?: number
  wholesaleFee?: number
  holdingCosts: number
  closingCosts: number
  verdict: 'great' | 'good' | 'marginal' | 'pass'
}

const EXIT_STRATEGIES: { value: ExitStrategy; label: string; description: string }[] = [
  { value: 'wholesale', label: 'Wholesale', description: 'Assign the contract for a fee' },
  { value: 'fix_and_flip', label: 'Fix & Flip', description: 'Rehab and sell at ARV' },
  { value: 'buy_and_hold', label: 'Buy & Hold', description: 'Rent for monthly cash flow' },
]

export default function DealAnalyzer() {
  const [address, setAddress] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [arv, setArv] = useState('')
  const [repairCost, setRepairCost] = useState('')
  const [exitStrategy, setExitStrategy] = useState<ExitStrategy>('fix_and_flip')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [wholesaleFee, setWholesaleFee] = useState('10000')
  const [holdingMonths, setHoldingMonths] = useState('4')
  const [closingPercent, setClosingPercent] = useState('3')
  const [downPaymentPercent, setDownPaymentPercent] = useState('20')
  const [interestRate, setInterestRate] = useState('8')
  const [maoOverride, setMaoOverride] = useState('')
  const [result, setResult] = useState<AnalysisResult | null>(null)

  const analyzeFlip = (): AnalysisResult => {
    const arvVal = parseFloat(arv) || 0
    const purchase = parseFloat(purchasePrice) || 0
    const repairs = parseFloat(repairCost) || 0
    const months = parseInt(holdingMonths) || 4
    const closingPct = parseFloat(closingPercent) / 100

    const closingCosts = arvVal * closingPct
    const holdingCosts = (purchase * (parseFloat(interestRate) / 100 / 12)) * months
    const totalInvestment = purchase + repairs + holdingCosts + closingCosts
    const profit = arvVal - totalInvestment
    const roi = totalInvestment > 0 ? (profit / totalInvestment) * 100 : 0
    const mao = maoOverride ? parseFloat(maoOverride) : (arvVal * 0.7) - repairs

    let verdict: AnalysisResult['verdict'] = 'pass'
    if (roi >= 25) verdict = 'great'
    else if (roi >= 15) verdict = 'good'
    else if (roi >= 5) verdict = 'marginal'

    return {
      arv: arvVal, mao, totalRepairCost: repairs, purchasePrice: purchase,
      profit, roi, exitStrategy: 'fix_and_flip', holdingCosts, closingCosts, verdict,
    }
  }

  const analyzeWholesale = (): AnalysisResult => {
    const arvVal = parseFloat(arv) || 0
    const purchase = parseFloat(purchasePrice) || 0
    const repairs = parseFloat(repairCost) || 0
    const fee = parseFloat(wholesaleFee) || 10000
    const mao = maoOverride ? parseFloat(maoOverride) : (arvVal * 0.7) - repairs
    const closingCosts = purchase * 0.01
    const profit = fee
    const roi = purchase > 0 ? (profit / (purchase * 0.01 + closingCosts)) * 100 : 0

    let verdict: AnalysisResult['verdict'] = 'pass'
    if (fee >= 15000) verdict = 'great'
    else if (fee >= 10000) verdict = 'good'
    else if (fee >= 5000) verdict = 'marginal'

    return {
      arv: arvVal, mao, totalRepairCost: repairs, purchasePrice: purchase,
      profit, roi, exitStrategy: 'wholesale', wholesaleFee: fee,
      holdingCosts: 0, closingCosts, verdict,
    }
  }

  const analyzeRental = (): AnalysisResult => {
    const arvVal = parseFloat(arv) || 0
    const purchase = parseFloat(purchasePrice) || 0
    const repairs = parseFloat(repairCost) || 0
    const rent = parseFloat(monthlyRent) || 0
    const downPct = parseFloat(downPaymentPercent) / 100
    const rate = parseFloat(interestRate) / 100
    const closingPct = parseFloat(closingPercent) / 100

    const downPayment = purchase * downPct
    const loanAmount = purchase - downPayment
    const monthlyMortgage = loanAmount > 0 ? (loanAmount * (rate / 12)) / (1 - Math.pow(1 + rate / 12, -360)) : 0
    const monthlyExpenses = rent * 0.4 // 40% expense ratio (taxes, insurance, maintenance, vacancy)
    const monthlyCashFlow = rent - monthlyMortgage - monthlyExpenses
    const annualCashFlow = monthlyCashFlow * 12
    const totalInvestment = downPayment + repairs + (purchase * closingPct)
    const cashOnCash = totalInvestment > 0 ? (annualCashFlow / totalInvestment) * 100 : 0
    const mao = maoOverride ? parseFloat(maoOverride) : (arvVal * 0.7) - repairs

    let verdict: AnalysisResult['verdict'] = 'pass'
    if (cashOnCash >= 12) verdict = 'great'
    else if (cashOnCash >= 8) verdict = 'good'
    else if (cashOnCash >= 4) verdict = 'marginal'

    return {
      arv: arvVal, mao, totalRepairCost: repairs, purchasePrice: purchase,
      profit: annualCashFlow, roi: cashOnCash, exitStrategy: 'buy_and_hold',
      monthlyRent: rent, monthlyCashFlow, cashOnCash,
      holdingCosts: 0, closingCosts: purchase * closingPct, verdict,
    }
  }

  const handleAnalyze = () => {
    if (exitStrategy === 'wholesale') setResult(analyzeWholesale())
    else if (exitStrategy === 'buy_and_hold') setResult(analyzeRental())
    else setResult(analyzeFlip())
  }

  const handleReset = () => {
    setAddress('')
    setPurchasePrice('')
    setArv('')
    setRepairCost('')
    setMonthlyRent('')
    setMaoOverride('')
    setResult(null)
  }

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val)

  const getVerdictConfig = (verdict: AnalysisResult['verdict']) => {
    switch (verdict) {
      case 'great': return { label: 'Great Deal', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle }
      case 'good': return { label: 'Good Deal', color: 'text-blue-700 bg-blue-50 border-blue-200', icon: CheckCircle }
      case 'marginal': return { label: 'Marginal', color: 'text-amber-700 bg-amber-50 border-amber-200', icon: AlertTriangle }
      case 'pass': return { label: 'Pass', color: 'text-red-700 bg-red-50 border-red-200', icon: TrendingDown }
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Calculator className="w-7 h-7 text-primary-600" />
          Deal Analyzer
        </h1>
        <p className="text-slate-600">Analyze any deal in seconds — ARV, MAO, profit projections, and exit strategy</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Property Info */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Home className="w-5 h-5 text-primary-500" />
              Property Details
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Property Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Main St, City, State ZIP"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Purchase Price</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="number"
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(e.target.value)}
                      placeholder="150,000"
                      className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">After Repair Value (ARV)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="number"
                      value={arv}
                      onChange={(e) => setArv(e.target.value)}
                      placeholder="250,000"
                      className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Estimated Repairs</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="number"
                      value={repairCost}
                      onChange={(e) => setRepairCost(e.target.value)}
                      placeholder="35,000"
                      className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    MAO Override
                    <span className="text-xs text-slate-400 font-normal ml-1">(optional — defaults to 70% rule)</span>
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="number"
                      value={maoOverride}
                      onChange={(e) => setMaoOverride(e.target.value)}
                      placeholder={arv && repairCost ? String(Math.round((parseFloat(arv) * 0.7) - parseFloat(repairCost))) : 'Auto-calculated'}
                      className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Exit Strategy */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-primary-500" />
              Exit Strategy
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              {EXIT_STRATEGIES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setExitStrategy(s.value)}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    exitStrategy === s.value
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <p className={`font-medium text-sm ${exitStrategy === s.value ? 'text-primary-700' : 'text-slate-800'}`}>
                    {s.label}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.description}</p>
                </button>
              ))}
            </div>

            {/* Strategy-specific fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {exitStrategy === 'wholesale' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Assignment Fee</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="number"
                      value={wholesaleFee}
                      onChange={(e) => setWholesaleFee(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
              )}
              {exitStrategy === 'fix_and_flip' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Holding Period (months)</label>
                    <input
                      type="number"
                      value={holdingMonths}
                      onChange={(e) => setHoldingMonths(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Interest Rate (%)</label>
                    <input
                      type="number"
                      value={interestRate}
                      onChange={(e) => setInterestRate(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </>
              )}
              {exitStrategy === 'buy_and_hold' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Monthly Rent</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="number"
                        value={monthlyRent}
                        onChange={(e) => setMonthlyRent(e.target.value)}
                        placeholder="1,800"
                        className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Down Payment (%)</label>
                    <input
                      type="number"
                      value={downPaymentPercent}
                      onChange={(e) => setDownPaymentPercent(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Interest Rate (%)</label>
                    <input
                      type="number"
                      value={interestRate}
                      onChange={(e) => setInterestRate(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Closing Costs (%)</label>
                <input
                  type="number"
                  value={closingPercent}
                  onChange={(e) => setClosingPercent(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleAnalyze}
                className="flex items-center gap-2 px-6 py-2.5 bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition-colors font-medium"
              >
                <BarChart3 className="w-4 h-4" />
                Analyze Deal
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Results Panel */}
        <div className="space-y-4">
          {result ? (
            <>
              {/* Verdict */}
              {(() => {
                const v = getVerdictConfig(result.verdict)
                return (
                  <div className={`rounded-xl border-2 p-5 text-center ${v.color}`}>
                    <v.icon className="w-10 h-10 mx-auto mb-2" />
                    <p className="text-2xl font-bold">{v.label}</p>
                    <p className="text-sm mt-1 opacity-80">
                      {exitStrategy === 'buy_and_hold' ? 'Cash-on-Cash' : 'ROI'}: {result.roi.toFixed(1)}%
                    </p>
                  </div>
                )
              })()}

              {/* Key Numbers */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="font-semibold text-slate-800 mb-3">Key Numbers</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">MAO {maoOverride ? '(Custom)' : '(70% Rule)'}</span>
                    <span className="font-bold text-primary-700">{formatCurrency(result.mao)}</span>
                  </div>
                  <div className="h-px bg-slate-100" />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Purchase Price</span>
                    <span className="font-medium">{formatCurrency(result.purchasePrice)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Repair Costs</span>
                    <span className="font-medium text-amber-600">-{formatCurrency(result.totalRepairCost)}</span>
                  </div>
                  {result.holdingCosts > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">Holding Costs</span>
                      <span className="font-medium text-amber-600">-{formatCurrency(result.holdingCosts)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Closing Costs</span>
                    <span className="font-medium text-amber-600">-{formatCurrency(result.closingCosts)}</span>
                  </div>
                  <div className="h-px bg-slate-200" />
                  {exitStrategy === 'wholesale' && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-700">Assignment Fee</span>
                      <span className="font-bold text-emerald-600">{formatCurrency(result.wholesaleFee || 0)}</span>
                    </div>
                  )}
                  {exitStrategy === 'fix_and_flip' && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">ARV (Sell Price)</span>
                        <span className="font-medium">{formatCurrency(result.arv)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-slate-700">Net Profit</span>
                        <span className={`font-bold ${result.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {formatCurrency(result.profit)}
                        </span>
                      </div>
                    </>
                  )}
                  {exitStrategy === 'buy_and_hold' && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">Monthly Rent</span>
                        <span className="font-medium">{formatCurrency(result.monthlyRent || 0)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-slate-700">Monthly Cash Flow</span>
                        <span className={`font-bold ${(result.monthlyCashFlow || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {formatCurrency(result.monthlyCashFlow || 0)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Price comparison bar */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-1">
                  Purchase vs MAO
                  <Info className="w-3.5 h-3.5 text-slate-400" />
                </h3>
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-500">Your Offer</span>
                      <span className="font-medium">{formatCurrency(result.purchasePrice)}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full ${result.purchasePrice <= result.mao ? 'bg-emerald-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min((result.purchasePrice / result.arv) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-500">MAO (70% Rule)</span>
                      <span className="font-medium">{formatCurrency(result.mao)}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3">
                      <div
                        className="h-3 rounded-full bg-primary-500"
                        style={{ width: `${Math.min((result.mao / result.arv) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-500">ARV</span>
                      <span className="font-medium">{formatCurrency(result.arv)}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3">
                      <div className="h-3 rounded-full bg-slate-400 w-full" />
                    </div>
                  </div>
                </div>
                {result.purchasePrice <= result.mao ? (
                  <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" />
                    {formatCurrency(result.mao - result.purchasePrice)} below MAO — room for profit
                  </p>
                ) : (
                  <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                    <TrendingDown className="w-3.5 h-3.5" />
                    {formatCurrency(result.purchasePrice - result.mao)} over MAO — negotiate lower
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
              <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="font-medium text-slate-500">Enter property details</p>
              <p className="text-sm text-slate-400 mt-1">Results will appear here after analysis</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
