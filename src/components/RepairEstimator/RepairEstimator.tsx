import { useState } from 'react'
import {
  Hammer,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Printer,
  RefreshCw,
} from 'lucide-react'

interface RepairItem {
  id: string
  name: string
  quantity: number
  unitCost: number
  unit: string
}

interface RepairRoom {
  id: string
  name: string
  isExpanded: boolean
  items: RepairItem[]
}

const ROOM_TEMPLATES: { name: string; items: Omit<RepairItem, 'id'>[] }[] = [
  {
    name: 'Kitchen',
    items: [
      { name: 'Cabinets (replace)', quantity: 1, unitCost: 4500, unit: 'set' },
      { name: 'Countertops (granite/quartz)', quantity: 30, unitCost: 55, unit: 'sq ft' },
      { name: 'Sink + Faucet', quantity: 1, unitCost: 350, unit: 'each' },
      { name: 'Appliances (full set)', quantity: 1, unitCost: 3000, unit: 'set' },
      { name: 'Backsplash tile', quantity: 25, unitCost: 18, unit: 'sq ft' },
      { name: 'Flooring (LVP/tile)', quantity: 120, unitCost: 6, unit: 'sq ft' },
      { name: 'Lighting fixtures', quantity: 3, unitCost: 85, unit: 'each' },
      { name: 'Paint', quantity: 1, unitCost: 350, unit: 'room' },
    ],
  },
  {
    name: 'Bathroom',
    items: [
      { name: 'Vanity + sink', quantity: 1, unitCost: 450, unit: 'each' },
      { name: 'Toilet', quantity: 1, unitCost: 250, unit: 'each' },
      { name: 'Tub/Shower surround', quantity: 1, unitCost: 1200, unit: 'each' },
      { name: 'Tile flooring', quantity: 50, unitCost: 12, unit: 'sq ft' },
      { name: 'Faucet + hardware', quantity: 1, unitCost: 200, unit: 'set' },
      { name: 'Mirror + medicine cabinet', quantity: 1, unitCost: 150, unit: 'each' },
      { name: 'Lighting', quantity: 2, unitCost: 75, unit: 'each' },
      { name: 'Paint', quantity: 1, unitCost: 200, unit: 'room' },
    ],
  },
  {
    name: 'Bedroom',
    items: [
      { name: 'Flooring (carpet/LVP)', quantity: 150, unitCost: 4, unit: 'sq ft' },
      { name: 'Paint', quantity: 1, unitCost: 350, unit: 'room' },
      { name: 'Closet doors/shelving', quantity: 1, unitCost: 400, unit: 'each' },
      { name: 'Lighting fixture', quantity: 1, unitCost: 65, unit: 'each' },
      { name: 'Window blinds', quantity: 2, unitCost: 45, unit: 'each' },
    ],
  },
  {
    name: 'Living/Dining Room',
    items: [
      { name: 'Flooring (LVP/hardwood)', quantity: 250, unitCost: 5, unit: 'sq ft' },
      { name: 'Paint', quantity: 1, unitCost: 500, unit: 'room' },
      { name: 'Lighting fixtures', quantity: 2, unitCost: 100, unit: 'each' },
      { name: 'Window blinds', quantity: 4, unitCost: 45, unit: 'each' },
      { name: 'Baseboards', quantity: 80, unitCost: 3, unit: 'lin ft' },
    ],
  },
  {
    name: 'Exterior',
    items: [
      { name: 'Roof repair/replace', quantity: 1, unitCost: 8000, unit: 'job' },
      { name: 'Exterior paint', quantity: 1, unitCost: 3500, unit: 'job' },
      { name: 'Siding repair', quantity: 1, unitCost: 2000, unit: 'job' },
      { name: 'Landscaping', quantity: 1, unitCost: 1500, unit: 'job' },
      { name: 'Driveway/walkway', quantity: 1, unitCost: 2500, unit: 'job' },
      { name: 'Front door', quantity: 1, unitCost: 500, unit: 'each' },
      { name: 'Gutters', quantity: 120, unitCost: 8, unit: 'lin ft' },
    ],
  },
  {
    name: 'Mechanical/Systems',
    items: [
      { name: 'HVAC repair/replace', quantity: 1, unitCost: 5500, unit: 'system' },
      { name: 'Water heater', quantity: 1, unitCost: 1200, unit: 'each' },
      { name: 'Electrical panel upgrade', quantity: 1, unitCost: 2000, unit: 'job' },
      { name: 'Plumbing repair', quantity: 1, unitCost: 1500, unit: 'job' },
      { name: 'Electrical rewiring (partial)', quantity: 1, unitCost: 3000, unit: 'job' },
    ],
  },
  {
    name: 'General/Misc',
    items: [
      { name: 'Dumpster rental', quantity: 1, unitCost: 500, unit: 'each' },
      { name: 'Permit fees', quantity: 1, unitCost: 800, unit: 'lot' },
      { name: 'Cleaning (deep)', quantity: 1, unitCost: 400, unit: 'job' },
      { name: 'Contingency (10%)', quantity: 1, unitCost: 0, unit: 'auto' },
    ],
  },
]

let nextId = 1
const genId = () => `item-${nextId++}`

export default function RepairEstimator() {
  const [rooms, setRooms] = useState<RepairRoom[]>([])
  const [laborPercent, setLaborPercent] = useState(35)

  const addRoom = (template: typeof ROOM_TEMPLATES[number]) => {
    const existing = rooms.filter((r) => r.name.startsWith(template.name)).length
    const suffix = existing > 0 ? ` ${existing + 1}` : ''
    setRooms([
      ...rooms,
      {
        id: genId(),
        name: `${template.name}${suffix}`,
        isExpanded: true,
        items: template.items.map((item) => ({ ...item, id: genId() })),
      },
    ])
  }

  const removeRoom = (roomId: string) => {
    setRooms(rooms.filter((r) => r.id !== roomId))
  }

  const toggleRoom = (roomId: string) => {
    setRooms(rooms.map((r) => (r.id === roomId ? { ...r, isExpanded: !r.isExpanded } : r)))
  }

  const updateItem = (roomId: string, itemId: string, field: keyof RepairItem, value: string | number) => {
    setRooms(
      rooms.map((r) =>
        r.id === roomId
          ? {
              ...r,
              items: r.items.map((item) =>
                item.id === itemId ? { ...item, [field]: value } : item
              ),
            }
          : r
      )
    )
  }

  const removeItem = (roomId: string, itemId: string) => {
    setRooms(
      rooms.map((r) =>
        r.id === roomId ? { ...r, items: r.items.filter((i) => i.id !== itemId) } : r
      )
    )
  }

  const addCustomItem = (roomId: string) => {
    setRooms(
      rooms.map((r) =>
        r.id === roomId
          ? {
              ...r,
              items: [...r.items, { id: genId(), name: 'Custom item', quantity: 1, unitCost: 0, unit: 'each' }],
            }
          : r
      )
    )
  }

  const getRoomTotal = (room: RepairRoom) =>
    room.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0)

  const materialTotal = rooms.reduce((sum, room) => sum + getRoomTotal(room), 0)
  const laborTotal = materialTotal * (laborPercent / 100)
  const subtotal = materialTotal + laborTotal
  // Update contingency items automatically
  const contingencyItems = rooms.flatMap((r) => r.items.filter((i) => i.name.toLowerCase().includes('contingency')))
  const contingencyTotal = contingencyItems.length > 0 ? subtotal * 0.1 : 0
  const grandTotal = subtotal + contingencyTotal

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val)

  const handleReset = () => setRooms([])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Hammer className="w-7 h-7 text-primary-600" />
          Repair Estimator
        </h1>
        <p className="text-slate-600">Room-by-room rehab cost calculator with regional pricing</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Room Builder */}
        <div className="lg:col-span-2 space-y-4">
          {/* Add Room Buttons */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-700 mb-3">Add rooms to your estimate:</p>
            <div className="flex flex-wrap gap-2">
              {ROOM_TEMPLATES.map((template) => (
                <button
                  key={template.name}
                  onClick={() => addRoom(template)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors border border-primary-200"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {template.name}
                </button>
              ))}
            </div>
          </div>

          {/* Room Cards */}
          {rooms.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <Hammer className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="font-medium text-slate-500">No rooms added yet</p>
              <p className="text-sm text-slate-400 mt-1">Click a room type above to start estimating</p>
            </div>
          ) : (
            rooms.map((room) => (
              <div key={room.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {/* Room Header */}
                <div
                  className="flex items-center justify-between px-5 py-3 bg-slate-50 cursor-pointer"
                  onClick={() => toggleRoom(room.id)}
                >
                  <div className="flex items-center gap-3">
                    {room.isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                    <h3 className="font-semibold text-slate-800">{room.name}</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-primary-700">{formatCurrency(getRoomTotal(room))}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeRoom(room.id) }}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Room Items */}
                {room.isExpanded && (
                  <div className="p-4">
                    {/* Header row */}
                    <div className="grid grid-cols-12 gap-2 text-xs font-medium text-slate-500 mb-2 px-1">
                      <div className="col-span-4">Item</div>
                      <div className="col-span-2">Qty</div>
                      <div className="col-span-2">Unit</div>
                      <div className="col-span-2">$/Unit</div>
                      <div className="col-span-1 text-right">Total</div>
                      <div className="col-span-1" />
                    </div>

                    {room.items.map((item) => (
                      <div key={item.id} className="grid grid-cols-12 gap-2 items-center mb-2">
                        <input
                          className="col-span-4 px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                          value={item.name}
                          onChange={(e) => updateItem(room.id, item.id, 'name', e.target.value)}
                        />
                        <input
                          type="number"
                          className="col-span-2 px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                          value={item.quantity}
                          onChange={(e) => updateItem(room.id, item.id, 'quantity', parseFloat(e.target.value) || 0)}
                        />
                        <input
                          className="col-span-2 px-2 py-1.5 text-sm border border-slate-200 rounded text-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          value={item.unit}
                          onChange={(e) => updateItem(room.id, item.id, 'unit', e.target.value)}
                        />
                        <input
                          type="number"
                          className="col-span-2 px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                          value={item.unitCost}
                          onChange={(e) => updateItem(room.id, item.id, 'unitCost', parseFloat(e.target.value) || 0)}
                        />
                        <div className="col-span-1 text-right text-sm font-medium text-slate-700">
                          {formatCurrency(item.quantity * item.unitCost)}
                        </div>
                        <button
                          onClick={() => removeItem(room.id, item.id)}
                          className="col-span-1 text-slate-400 hover:text-red-500 transition-colors justify-self-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    <button
                      onClick={() => addCustomItem(room.id)}
                      className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 mt-2"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add item
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Summary Panel */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 sticky top-4">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary-500" />
              Cost Summary
            </h3>

            <div className="space-y-3">
              {/* Per-room breakdown */}
              {rooms.map((room) => (
                <div key={room.id} className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">{room.name}</span>
                  <span className="text-sm font-medium">{formatCurrency(getRoomTotal(room))}</span>
                </div>
              ))}

              {rooms.length > 0 && (
                <>
                  <div className="h-px bg-slate-200" />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Materials Subtotal</span>
                    <span className="font-medium">{formatCurrency(materialTotal)}</span>
                  </div>

                  {/* Labor slider */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-slate-600">Labor ({laborPercent}%)</span>
                      <span className="font-medium">{formatCurrency(laborTotal)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={laborPercent}
                      onChange={(e) => setLaborPercent(parseInt(e.target.value))}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                    />
                    <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                      <span>DIY (0%)</span>
                      <span>Full crew (100%)</span>
                    </div>
                  </div>

                  {contingencyItems.length > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">Contingency (10%)</span>
                      <span className="font-medium text-amber-600">{formatCurrency(contingencyTotal)}</span>
                    </div>
                  )}

                  <div className="h-px bg-slate-200" />
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-800">Total Estimate</span>
                    <span className="text-xl font-bold text-primary-700">{formatCurrency(grandTotal)}</span>
                  </div>
                </>
              )}
            </div>

            {rooms.length > 0 && (
              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => window.print()}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary-800 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm"
                >
                  <Printer className="w-4 h-4" />
                  Print
                </button>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-3 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reset
                </button>
              </div>
            )}
          </div>

          {/* Quick Tips */}
          <div className="bg-primary-50 rounded-xl border border-primary-200 p-5">
            <h3 className="font-semibold text-primary-800 mb-2">Quick Tips</h3>
            <ul className="space-y-1.5 text-sm text-primary-700">
              <li>- Adjust quantities for your property's actual square footage</li>
              <li>- Use the labor slider: 0% for DIY, 35% for average, 50%+ for high-cost markets</li>
              <li>- Always include 10% contingency for unexpected costs</li>
              <li>- Copy the total to the Deal Analyzer's repair cost field</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
