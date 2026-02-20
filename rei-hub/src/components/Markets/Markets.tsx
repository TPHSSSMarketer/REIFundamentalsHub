import { useState, type FormEvent } from 'react'
import { MapPin, Plus } from 'lucide-react'
import type { MarketData } from '@/types'

const STORAGE_KEY = 'rei_markets'

function formatCurrency(n: number) {
  return '$' + n.toLocaleString()
}

function buildMarket(
  raw: Omit<MarketData, 'id' | 'rentToPriceRatio' | 'addedAt'>
): MarketData {
  return {
    ...raw,
    id: crypto.randomUUID(),
    rentToPriceRatio: (raw.medianRent * 12) / raw.medianHomePrice,
    addedAt: new Date().toISOString(),
  }
}

function seedMarkets(): MarketData[] {
  const seeds: Omit<MarketData, 'id' | 'rentToPriceRatio' | 'addedAt'>[] = [
    {
      city: 'Cleveland',
      state: 'OH',
      medianHomePrice: 135000,
      medianRent: 1050,
      avgDaysOnMarket: 22,
      inventoryCount: 340,
      priceChangePct: 3.1,
      notes: 'Strong cash flow market, high inventory',
    },
    {
      city: 'Indianapolis',
      state: 'IN',
      medianHomePrice: 225000,
      medianRent: 1450,
      avgDaysOnMarket: 18,
      inventoryCount: 520,
      priceChangePct: 5.4,
      notes: 'Growing metro, solid renter demand',
    },
    {
      city: 'Memphis',
      state: 'TN',
      medianHomePrice: 175000,
      medianRent: 1200,
      avgDaysOnMarket: 28,
      inventoryCount: 410,
      priceChangePct: 2.8,
      notes: '',
    },
  ]
  return seeds.map(buildMarket)
}

function loadMarkets(): MarketData[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) return JSON.parse(raw) as MarketData[]
  const seeded = seedMarkets()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded))
  return seeded
}

function saveMarkets(markets: MarketData[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(markets))
}

function getRatioBadge(ratio: number) {
  if (ratio >= 0.1)
    return { label: 'Strong', cls: 'bg-green-100 text-green-700' }
  if (ratio >= 0.07)
    return { label: 'Moderate', cls: 'bg-yellow-100 text-yellow-700' }
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
  const [markets, setMarkets] = useState<MarketData[]>(loadMarkets)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(BLANK_FORM)

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const medianHomePrice = parseFloat(form.medianHomePrice)
    const medianRent = parseFloat(form.medianRent)
    const newMarket = buildMarket({
      city: form.city.trim(),
      state: form.state.trim(),
      medianHomePrice,
      medianRent,
      avgDaysOnMarket: parseInt(form.avgDaysOnMarket, 10),
      inventoryCount: parseInt(form.inventoryCount, 10),
      priceChangePct: parseFloat(form.priceChangePct),
      notes: form.notes.trim() || undefined,
    })
    const updated = [newMarket, ...markets]
    setMarkets(updated)
    saveMarkets(updated)
    setForm(BLANK_FORM)
    setShowForm(false)
  }

  function handleRemove(id: string) {
    const updated = markets.filter((m) => m.id !== id)
    setMarkets(updated)
    saveMarkets(updated)
  }

  const inputClass =
    'w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Markets</h1>
          <p className="text-slate-500 text-sm">
            Track and score your target markets
          </p>
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
          <h2 className="text-lg font-semibold text-slate-800">
            Add a Market
          </h2>

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
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Notes
            </label>
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
              className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 transition-colors"
            >
              Save Market
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false)
                setForm(BLANK_FORM)
              }}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Markets Grid */}
      {markets.length === 0 ? (
        <div className="text-center py-16">
          <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-lg font-medium text-slate-600">
            No markets tracked yet
          </p>
          <p className="text-sm text-slate-400 mt-1">
            Add your first market to start scoring.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {markets.map((m) => {
            const badge = getRatioBadge(m.rentToPriceRatio)
            const ratioPct = (m.rentToPriceRatio * 100).toFixed(1)

            return (
              <div
                key={m.id}
                className="bg-white rounded-xl shadow-sm border border-slate-200 p-5"
              >
                {/* Title + badge */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-lg font-semibold text-slate-800">
                    {m.city}, {m.state}
                  </h3>
                  <span
                    className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                </div>

                {/* Rent-to-Price ratio */}
                <p className="text-sm text-slate-500 mt-1">
                  Rent-to-Price: <span className="font-medium text-slate-700">{ratioPct}%</span>
                </p>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
                  <div>
                    <p className="text-slate-400 text-xs">Median Home Price</p>
                    <p className="font-medium text-slate-700">
                      {formatCurrency(m.medianHomePrice)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs">Median Rent</p>
                    <p className="font-medium text-slate-700">
                      {formatCurrency(m.medianRent)}/mo
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs">Avg Days on Market</p>
                    <p className="font-medium text-slate-700">
                      {m.avgDaysOnMarket}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs">Inventory</p>
                    <p className="font-medium text-slate-700">
                      {m.inventoryCount.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs">Price Change YoY</p>
                    <p
                      className={`font-medium ${
                        m.priceChangePct >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {m.priceChangePct >= 0 ? '+' : ''}
                      {m.priceChangePct}%
                    </p>
                  </div>
                </div>

                {/* Notes */}
                {m.notes && (
                  <p className="text-xs text-slate-400 mt-3 italic">{m.notes}</p>
                )}

                {/* Remove */}
                <div className="mt-4">
                  <button
                    onClick={() => handleRemove(m.id)}
                    className="px-3 py-1 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
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
