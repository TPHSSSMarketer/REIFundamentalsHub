import { Package, Mic, PenTool, ExternalLink, Plug } from 'lucide-react'

const integrations = [
  {
    id: 'usps',
    name: 'USPS Tracking',
    description: 'Track your direct mail campaigns and packages with USPS integration.',
    icon: Package,
    color: 'bg-blue-500',
    status: 'available',
    url: '#',
  },
  {
    id: 'voicehub',
    name: 'VoiceHub',
    description: 'Launch AI voice agents to follow up with leads automatically.',
    icon: Mic,
    color: 'bg-purple-500',
    status: 'available',
    url: '#',
  },
  {
    id: 'contenthub',
    name: 'ContentHub',
    description: 'Create marketing content with AI - SMS, emails, postcards, and more.',
    icon: PenTool,
    color: 'bg-pink-500',
    status: 'available',
    url: '#',
  },
]

export default function Integrations() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Integrations</h1>
        <p className="text-slate-600">
          Connect your favorite tools and extend functionality
        </p>
      </div>

      {/* Integration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {integrations.map((integration) => (
          <div
            key={integration.id}
            id={integration.id}
            className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-start justify-between mb-4">
              <div
                className={`p-3 rounded-lg ${integration.color} text-white`}
              >
                <integration.icon className="w-6 h-6" />
              </div>
              <span className="px-2 py-1 text-xs font-medium bg-success-50 text-success-700 rounded-full">
                {integration.status}
              </span>
            </div>

            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              {integration.name}
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              {integration.description}
            </p>

            <a
              href={integration.url}
              className="flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium text-sm"
            >
              Launch
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        ))}
      </div>

      {/* GHL Connection Status */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 rounded-lg bg-slate-100">
            <Plug className="w-6 h-6 text-slate-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-800">
              GoHighLevel Connection
            </h3>
            <p className="text-sm text-slate-600">
              Your primary CRM connection
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 p-3 bg-success-50 rounded-lg">
          <div className="w-2 h-2 rounded-full bg-success-500" />
          <span className="text-sm font-medium text-success-700">
            Connected and syncing
          </span>
        </div>

        <div className="mt-4 p-4 bg-slate-50 rounded-lg">
          <p className="text-sm text-slate-600">
            <strong>API Base:</strong>{' '}
            {import.meta.env.VITE_GHL_API_BASE_URL || 'Not configured'}
          </p>
          <p className="text-sm text-slate-600 mt-1">
            <strong>Location ID:</strong>{' '}
            {import.meta.env.VITE_GHL_LOCATION_ID
              ? `${import.meta.env.VITE_GHL_LOCATION_ID.slice(0, 8)}...`
              : 'Not configured'}
          </p>
        </div>
      </div>

      {/* Coming Soon */}
      <div className="bg-slate-50 rounded-xl border border-dashed border-slate-300 p-8 text-center">
        <h3 className="text-lg font-semibold text-slate-700 mb-2">
          More Integrations Coming Soon
        </h3>
        <p className="text-slate-600 text-sm">
          Zapier, Google Calendar, Twilio, and more are on the way!
        </p>
      </div>
    </div>
  )
}
