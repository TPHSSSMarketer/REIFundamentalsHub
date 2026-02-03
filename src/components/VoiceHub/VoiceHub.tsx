import { useState } from 'react'
import {
  Mic,
  Phone,
  PlayCircle,
  StopCircle,
  Settings,
  Volume2,
  PhoneCall,
  PhoneOff,
  Clock,
  Users,
  BarChart3,
} from 'lucide-react'
import { toast } from 'sonner'

interface VoiceAgent {
  id: string
  name: string
  status: 'active' | 'inactive' | 'busy'
  callsToday: number
  avgDuration: string
}

const mockAgents: VoiceAgent[] = [
  { id: '1', name: 'Lead Qualifier', status: 'active', callsToday: 23, avgDuration: '2:45' },
  { id: '2', name: 'Appointment Setter', status: 'inactive', callsToday: 0, avgDuration: '4:12' },
  { id: '3', name: 'Follow-up Agent', status: 'busy', callsToday: 15, avgDuration: '1:30' },
]

export default function VoiceHub() {
  const [agents, setAgents] = useState(mockAgents)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)

  const toggleAgent = (agentId: string) => {
    setAgents((prev) =>
      prev.map((agent) =>
        agent.id === agentId
          ? { ...agent, status: agent.status === 'active' ? 'inactive' : 'active' }
          : agent
      )
    )
    toast.success('Agent status updated')
  }

  const stats = {
    totalCalls: agents.reduce((acc, a) => acc + a.callsToday, 0),
    activeAgents: agents.filter((a) => a.status === 'active').length,
    avgDuration: '2:49',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">VoiceHub</h1>
        <p className="text-slate-600">Manage your AI voice agents and call automation</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <PhoneCall className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Calls Today</p>
              <p className="text-2xl font-bold text-slate-800">{stats.totalCalls}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-success-100 rounded-lg">
              <Users className="w-5 h-5 text-success-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Active Agents</p>
              <p className="text-2xl font-bold text-slate-800">{stats.activeAgents}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-warning-100 rounded-lg">
              <Clock className="w-5 h-5 text-warning-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Avg Call Duration</p>
              <p className="text-2xl font-bold text-slate-800">{stats.avgDuration}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Voice Agents */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Voice Agents</h2>
        </div>
        <div className="divide-y divide-slate-200">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div
                  className={`p-3 rounded-full ${
                    agent.status === 'active'
                      ? 'bg-success-100'
                      : agent.status === 'busy'
                      ? 'bg-warning-100'
                      : 'bg-slate-100'
                  }`}
                >
                  <Mic
                    className={`w-5 h-5 ${
                      agent.status === 'active'
                        ? 'text-success-600'
                        : agent.status === 'busy'
                        ? 'text-warning-600'
                        : 'text-slate-400'
                    }`}
                  />
                </div>
                <div>
                  <h3 className="font-medium text-slate-800">{agent.name}</h3>
                  <div className="flex items-center gap-3 text-sm text-slate-500">
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {agent.callsToday} calls today
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Avg: {agent.avgDuration}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${
                    agent.status === 'active'
                      ? 'bg-success-100 text-success-700'
                      : agent.status === 'busy'
                      ? 'bg-warning-100 text-warning-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {agent.status}
                </span>
                <button
                  onClick={() => toggleAgent(agent.id)}
                  disabled={agent.status === 'busy'}
                  className={`p-2 rounded-lg transition-colors ${
                    agent.status === 'active'
                      ? 'bg-danger-100 text-danger-600 hover:bg-danger-200'
                      : 'bg-success-100 text-success-600 hover:bg-success-200'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {agent.status === 'active' ? (
                    <StopCircle className="w-5 h-5" />
                  ) : (
                    <PlayCircle className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={() => toast.info('Call queue feature coming soon')}
          className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 hover:border-primary-300 hover:bg-primary-50 transition-colors text-left"
        >
          <div className="p-2 bg-primary-100 rounded-lg">
            <Phone className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h3 className="font-medium text-slate-800">Start Call Queue</h3>
            <p className="text-sm text-slate-500">Begin automated outbound calls</p>
          </div>
        </button>
        <button
          onClick={() => toast.info('Agent settings coming soon')}
          className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 hover:border-primary-300 hover:bg-primary-50 transition-colors text-left"
        >
          <div className="p-2 bg-slate-100 rounded-lg">
            <Settings className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h3 className="font-medium text-slate-800">Agent Settings</h3>
            <p className="text-sm text-slate-500">Configure voice agent behavior</p>
          </div>
        </button>
      </div>
    </div>
  )
}
