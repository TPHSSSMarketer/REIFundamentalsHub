import { useState } from 'react'
import { GitBranch, Bot, History, Code2 } from 'lucide-react'
import { cn } from '@/utils/helpers'
import FlowList from './FlowList'
import PersonaManager from './PersonaManager'
import ExecutionHistory from './ExecutionHistory'
import WebchatConfig from './WebchatConfig'

const tabs = [
  { id: 'flows', label: 'My Flows', icon: GitBranch },
  { id: 'personas', label: 'Personas', icon: Bot },
  { id: 'history', label: 'Execution History', icon: History },
  { id: 'widget', label: 'Widget Config', icon: Code2 },
] as const

type TabId = (typeof tabs)[number]['id']

export default function FlowBuilder() {
  const [activeTab, setActiveTab] = useState<TabId>('flows')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Flow Builder</h1>
        <p className="text-slate-500 mt-1">
          Design AI conversation flows with a visual drag-and-drop editor
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-6" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'flows' && <FlowList />}
        {activeTab === 'personas' && <PersonaManager />}
        {activeTab === 'history' && <ExecutionHistory />}
        {activeTab === 'widget' && <WebchatConfig />}
      </div>
    </div>
  )
}
