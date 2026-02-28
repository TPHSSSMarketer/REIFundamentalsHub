import { useState, useEffect, type FormEvent } from 'react'
import { MapPin, Plus, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  getMarkets,
  createMarket,
  deleteMarket,
  type MarketRecord,
  type CreateMarketPayload,
} from '@/services/marketsApi'

function formatCurrency(n: number) {
  return '$' + n.toLocaleString()
}

function getRatioBadge(ratio: number) {
  if (ratio >= 10) return { label: 'Strong', cls: 'bg-green-100 text-green-700' }
  if (ratio >= 7) return { label: 'Moderate', cls: 'bg-yellow-100 text-yellow-700' }
  return { label: 'Weak', cls: 'bg-red-100 text-red-700' }
}

const BLANK_FORM = {
  city: '',
  state: '',
  medianHomePrice: '',
  medianRent: '',
  avgDaysOnMarket: '',
  inventoryCount: '',
  priceChangePct: '',
  notes: '',
}

export default function Markets() {
  const [markets, setMarkets] = useState<MarketRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(BLANK_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadMarkets()
  }, [])

  async function loadMarkets() {
    setLoading(true)
    try {
      const data = await getMarkets()
      setMarkets(data)
    } catch (err: any) {
      console.error('Failed to load markets:', err)
      toast.error('Failed to load markets')
    } finally {
      setLoading(false)
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.city.trim() || !form.state.trim()) return

    setSaving(true)
    try {
      const payload: CreateMarketPayload = {
        city: form.city.trim(),
        state: form.state.trim().toUpperCase(),
        median_home_price: parseFloat(form.medianHomePrice) || 0,
        median_rent: parseFloat(form.medianRent) || 0,
        avg_days_on_market: parseInt(form.avgDaysOnMarket, 10) || 0,
        inventory_count: parseInt(form.inventoryCount, 10) || 0,
        price_change_pct: parseFloat(form.priceChangePct) || 0,
        notes: form.notes.trim() || undefined,
      }
      await createMarket(payload)
      toast.success(`${payload.city}, ${payload.state} added`)
      setForm(BLANK_FORM)
      setShowForm(false)
      loadMarkets()
    } catch (err: any) {
      toast.error(err.message || 'Failed to add market')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(id: string) {
    try {
      await deleteMarket(id)
      setMarkets((prev) => prev.filter((m) => m.id !== id))
      toast.success('Market removed')
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove market')
    }
  }

  const inputClass =
    'w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Markets</h1>
          <p className="text-slate-500 text-sm">Track and score your target markets</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Market
        </button>
      </div>

      {/* Inline Add Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4"
        >
          <h2 className="text-lg font-semibold text-slate-800">Add a Market</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                City <span className="text-red-500">*</span>
              </label>
              <input
                name="city"
                type="text"
                required
                value={form.city}
                onChange={handleChange}
                placeholder="e.g. Cleveland"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                State <span className="text-red-500">*</span>
              </label>
              <input
                name="state"
                type="text"
                required
                maxLength={2}
                value={form.state}
                onChange={handleChange}
                placeholder="e.g. OH"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Median Home Price ($) <span className="text-red-500">*</span>
              </label>
              <input
                name="medianHomePrice"
                type="number"
                required
                min={1}
                value={form.medianHomePrice}
                onChange={handleChange}
                placeholder="135000"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Median Rent/mo ($) <span className="text-red-500">*</span>
              </label>
              <input
                name="medianRent"
                type="number"
                required
                min={1}
                value={form.medianRent}
                onChange={handleChange}
                placeholder="1050"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Avg Days on Market <span className="text-red-500">*</span>
              </label>
              <input
                name="avgDaysOnMarket"
                type="number"
                required
                min={0}
                value={form.avgDaysOnMarket}
                onChange={handleChange}
                placeholder="22"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Inventory Count <span className="text-red-500">*</span>
              </label>
              <input
                name="inventoryCount"
                type="number"
                required
                min={0}
                value={form.inventoryCount}
                onChange={handleChange}
                placeholder="340"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Price Change % YoY <span className="text-red-500">*</span>
              </label>
              <input
                name="priceChangePct"
                type="number"
                required
                step="0.1"
                value={form.priceChangePct}
                onChange={handleChange}
                placeholder="3.1"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              name="notes"
              rows={2}
              value={form.notes}
              onChange={handleChange}
              placeholder="Any notes about this market..."
              className={inputClass + ' resize-none'}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving...' : 'Save Market'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setForm(BLANK_FORM) }}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Markets Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
          <span className="ml-2 text-sm text-slate-500">Loading markets...</span>
        </div>
      ) : markets.length === 0 ? (
        <div className="text-center py-16">
          <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-lg font-medium text-slate-600">No markets tracked yet</p>
          <p className="text-sm text-slate-400 mt-1">Add your first market to start scoring.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {markets.map((m) => {
            const badge = getRatioBadge(m.rent_to_price_ratio ?? 0)
            const ratioPct = (m.rent_to_price_ratio ?? 0).toFixed(1)

            return (
              <div key={m.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-lg font-semibold text-slate-800">
                    {m.city}, {m.state}
                  </h3>
                  <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>

                <p className="text-sm text-slate-500 mt-1">
                  Rent-to-Price: <span className="font-medium text-slate-700">{ratioPct}%</span>
                </p>

                <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
                  <div>
                    <p className="text-slate-400 text-xs">Median Home Price</p>
                    <p className="font-medium text-slate-700">{formatCurrency(m.median_home_price)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs">Median Rent</p>
                    <p className="font-medium text-slate-700">{formatCurrency(m.median_rent)}/mo</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs">Avg Days on Market</p>
                    <p className="font-medium text-slate-700">{m.avg_days_on_market}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs">Inventory</p>
                    <p className="font-medium text-slate-700">{m.inventory_count.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs">Price Change YoY</p>
                    <p className={`font-medium ${m.price_change_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {m.price_change_pct >= 0 ? '+' : ''}{m.price_change_pct}%
                    </p>
                  </div>
                </div>

                {m.notes && <p className="text-xs text-slate-400 mt-3 italic">{m.notes}</p>}

                <div className="mt-4">
                  <button
                    onClick={() => handleRemove(m.id)}
                    className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    Remove
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
