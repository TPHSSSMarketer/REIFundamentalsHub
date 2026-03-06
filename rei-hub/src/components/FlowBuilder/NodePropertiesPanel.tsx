import { useState, useEffect } from 'react'
import { type Node } from '@xyflow/react'
import { X, Trash2, Plus, Minus } from 'lucide-react'
import { cn } from '@/utils/helpers'

interface NodePropertiesPanelProps {
  node: Node
  onUpdate: (data: Record<string, any>) => void
  onDelete: () => void
  onClose: () => void
}

export default function NodePropertiesPanel({ node, onUpdate, onDelete, onClose }: NodePropertiesPanelProps) {
  const [localData, setLocalData] = useState<Record<string, any>>({})
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    setLocalData(node.data as Record<string, any>)
    setShowDeleteConfirm(false)
  }, [node.id, node.data])

  const update = (key: string, value: any) => {
    const next = { ...localData, [key]: value }
    setLocalData(next)
    onUpdate(next)
  }

  const nodeType = node.type || 'unknown'

  const renderField = (label: string, key: string, type: 'text' | 'textarea' | 'number' | 'select', options?: string[]) => (
    <div key={key}>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {type === 'textarea' ? (
        <textarea
          value={localData[key] || ''}
          onChange={(e) => update(key, e.target.value)}
          rows={3}
          className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
        />
      ) : type === 'number' ? (
        <input
          type="number"
          value={localData[key] || ''}
          onChange={(e) => update(key, parseInt(e.target.value) || 0)}
          className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      ) : type === 'select' ? (
        <select
          value={localData[key] || options?.[0] || ''}
          onChange={(e) => update(key, e.target.value)}
          className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          {options?.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={localData[key] || ''}
          onChange={(e) => update(key, e.target.value)}
          className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      )}
    </div>
  )

  const renderConditions = () => {
    const conditions = localData.conditions || []
    return (
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Conditions</label>
        <div className="space-y-2">
          {conditions.map((cond: any, i: number) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={cond.label || ''}
                onChange={(e) => {
                  const next = [...conditions]
                  next[i] = { ...next[i], label: e.target.value }
                  update('conditions', next)
                }}
                placeholder="Label"
                className="flex-1 px-2 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                value={cond.condition || ''}
                onChange={(e) => {
                  const next = [...conditions]
                  next[i] = { ...next[i], condition: e.target.value }
                  update('conditions', next)
                }}
                placeholder="Condition"
                className="flex-1 px-2 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
              <button
                onClick={() => {
                  const next = conditions.filter((_: any, j: number) => j !== i)
                  update('conditions', next)
                }}
                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => update('conditions', [...conditions, { label: '', condition: '' }])}
          className="flex items-center gap-1 mt-2 text-xs text-primary-600 hover:text-primary-700 font-medium"
        >
          <Plus className="w-3 h-3" />
          Add Condition
        </button>
      </div>
    )
  }

  const renderFields = () => {
    switch (nodeType) {
      case 'greeting':
        return (
          <>
            {renderField('Label', 'label', 'text')}
            {renderField('Greeting Message', 'message', 'textarea')}
          </>
        )
      case 'objective':
        return (
          <>
            {renderField('Label', 'label', 'text')}
            {renderField('Objective Prompt', 'objective_prompt', 'textarea')}
            {renderField('Success Criteria', 'success_criteria', 'textarea')}
            {renderField('Max Attempts', 'max_attempts', 'number')}
          </>
        )
      case 'statement':
        return (
          <>
            {renderField('Label', 'label', 'text')}
            {renderField('Message', 'message', 'textarea')}
          </>
        )
      case 'conversation':
        return (
          <>
            {renderField('Label', 'label', 'text')}
            {renderField('System Prompt', 'system_prompt', 'textarea')}
            {renderField('Max Turns', 'max_turns', 'number')}
          </>
        )
      case 'switch':
        return (
          <>
            {renderField('Label', 'label', 'text')}
            {renderConditions()}
          </>
        )
      case 'true_false':
        return (
          <>
            {renderField('Label', 'label', 'text')}
            {renderField('Condition', 'condition', 'textarea')}
            {renderField('True Label', 'true_label', 'text')}
            {renderField('False Label', 'false_label', 'text')}
          </>
        )
      case 'webhook':
        return (
          <>
            {renderField('Label', 'label', 'text')}
            {renderField('URL', 'url', 'text')}
            {renderField('Method', 'method', 'select', ['GET', 'POST', 'PUT', 'PATCH'])}
            {renderField('Headers (JSON)', 'headers', 'textarea')}
          </>
        )
      case 'delay':
        return (
          <>
            {renderField('Label', 'label', 'text')}
            {renderField('Delay (seconds)', 'delay_seconds', 'number')}
          </>
        )
      case 'transfer':
        return (
          <>
            {renderField('Label', 'label', 'text')}
            {renderField('Transfer To', 'transfer_to', 'text')}
            {renderField('Transfer Message', 'transfer_message', 'textarea')}
          </>
        )
      case 'stop':
        return (
          <>
            {renderField('Label', 'label', 'text')}
            {renderField('End Message', 'end_message', 'textarea')}
          </>
        )
      default:
        return renderField('Label', 'label', 'text')
    }
  }

  const typeLabels: Record<string, string> = {
    greeting: 'Greeting',
    objective: 'Objective',
    statement: 'Statement',
    conversation: 'Conversation',
    switch: 'Switch',
    true_false: 'True / False',
    webhook: 'Webhook',
    delay: 'Delay',
    transfer: 'Transfer',
    stop: 'Stop',
  }

  return (
    <div className="w-72 bg-white border-l border-slate-200 flex flex-col shrink-0">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-3 border-b border-slate-200">
        <span className="text-sm font-semibold text-slate-700">
          {typeLabels[nodeType] || 'Node'} Properties
        </span>
        <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-400">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {renderFields()}
      </div>

      {/* Delete button */}
      <div className="p-3 border-t border-slate-200">
        {showDeleteConfirm ? (
          <div className="space-y-2">
            <p className="text-xs text-red-600">Delete this node and all its connections?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-3 py-1.5 text-xs rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={onDelete}
                className="flex-1 px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 rounded-lg hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete Node
          </button>
        )}
      </div>
    </div>
  )
}
