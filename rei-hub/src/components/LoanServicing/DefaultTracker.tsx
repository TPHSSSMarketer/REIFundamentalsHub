import { useState } from 'react'

interface Props {
  defaultData: any
  landTrustState: string
  onMarkSent: (noticeNum: number, date: string) => void
  onMarkCured: () => void
  onProceedEviction: () => void
}

export default function DefaultTracker({
  defaultData,
  landTrustState,
  onMarkSent,
  onMarkCured,
  onProceedEviction,
}: Props) {
  const [confirmCure, setConfirmCure] = useState(false)
  const [confirmEviction, setConfirmEviction] = useState(false)

  if (!defaultData) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-5">
        <p className="text-green-700 font-semibold">&#10003; No Active Defaults</p>
        <p className="text-xs text-slate-400 mt-1">Loan is current</p>
      </div>
    )
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
      {/* Header */}
      <div className="bg-red-600 px-4 py-2">
        <span className="text-white text-sm font-semibold">&#9888;&#65039; LOAN IN DEFAULT</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Summary */}
        <div className="space-y-1">
          <p className="text-sm text-slate-800 font-medium">
            Amount Owed: ${defaultData.total_amount_due}
          </p>
          <p className="text-sm text-slate-600">Since: {defaultData.default_date}</p>
        </div>

        {/* Notice Timeline */}
        <div className="border-l-2 border-slate-200 ml-2 space-y-4 pl-4">
          {/* Step 1: Notice 1 */}
          <div>
            <p className="text-sm font-semibold text-slate-700">
              1. {defaultData.notice_1_type}
            </p>
            <p className="text-xs text-slate-500">Due: {defaultData.notice_1_cure_deadline}</p>
            {defaultData.notice_1_sent_date ? (
              <p className="text-xs text-green-600 mt-1">Sent &#10003; {defaultData.notice_1_sent_date}</p>
            ) : (
              <button
                onClick={() => onMarkSent(1, today)}
                className="mt-1 px-3 py-1 text-xs bg-[#1B3A6B] text-white rounded hover:opacity-90"
              >
                Mark Sent
              </button>
            )}
          </div>

          {/* Step 2: Cure Deadline */}
          <div>
            <p className="text-sm font-semibold text-slate-700">2. Cure Deadline</p>
            <p className="text-xs text-slate-500">Date: {defaultData.notice_1_cure_deadline}</p>
            <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-yellow-100 text-yellow-700">
              {new Date(defaultData.notice_1_cure_deadline) < new Date() ? 'Expired' : 'Pending'}
            </span>
          </div>

          {/* Step 3: Notice 2 */}
          <div>
            <p className="text-sm font-semibold text-slate-700">
              3. {defaultData.notice_2_type}
            </p>
            <p className="text-xs text-slate-500">Due: {defaultData.notice_2_cure_deadline}</p>
            {defaultData.notice_2_sent_date ? (
              <p className="text-xs text-green-600 mt-1">Sent &#10003; {defaultData.notice_2_sent_date}</p>
            ) : (
              <button
                onClick={() => onMarkSent(2, today)}
                className="mt-1 px-3 py-1 text-xs bg-[#1B3A6B] text-white rounded hover:opacity-90"
              >
                Mark Sent
              </button>
            )}
          </div>

          {/* Step 4: Eviction Filing */}
          <div>
            <p className="text-sm font-semibold text-slate-700">4. Eviction Filing</p>
            {defaultData.eviction_filed_date ? (
              <p className="text-xs text-green-600 mt-1">Filed &#10003; {defaultData.eviction_filed_date}</p>
            ) : (
              <p className="text-xs text-slate-400 mt-1">Available after notice period</p>
            )}
          </div>
        </div>

        {/* State law info */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <p className="text-xs text-slate-600 font-medium">Per {landTrustState} law:</p>
          <p className="text-xs text-slate-500 mt-1">
            {defaultData.state_law_reference || 'Refer to state-specific forfeiture and eviction statutes.'}
          </p>
        </div>

        {/* Attorney warning */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-xs text-yellow-800 font-semibold">
            &#9888;&#65039; Consult a licensed attorney before taking legal action
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          {!confirmCure ? (
            <button
              onClick={() => setConfirmCure(true)}
              className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Mark as Cured
            </button>
          ) : (
            <button
              onClick={() => { onMarkCured(); setConfirmCure(false) }}
              className="px-4 py-2 text-sm font-medium bg-green-800 text-white rounded-lg hover:bg-green-900"
            >
              Confirm Cure
            </button>
          )}

          {!confirmEviction ? (
            <button
              onClick={() => setConfirmEviction(true)}
              className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Proceed to Eviction
            </button>
          ) : (
            <button
              onClick={() => { onProceedEviction(); setConfirmEviction(false) }}
              className="px-4 py-2 text-sm font-medium bg-red-800 text-white rounded-lg hover:bg-red-900"
            >
              Confirm Eviction
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
