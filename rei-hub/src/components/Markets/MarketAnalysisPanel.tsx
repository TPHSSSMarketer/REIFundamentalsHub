import { useState, useEffect } from 'react'
import {
  X,
  Users,
  Shield,
  Briefcase,
  Cloud,
  Loader2,
} from 'lucide-react'
import { getMarketAnalysis, type MarketAnalysis } from '@/services/marketAnalysisApi'

interface MarketAnalysisPanelProps {
  marketId: string
  city: string
  state: string
  isOpen: boolean
  onClose: () => void
}

type TabType = 'demographics' | 'crime' | 'jobs' | 'weather'

export default function MarketAnalysisPanel({
  marketId,
  city,
  state,
  isOpen,
  onClose,
}: MarketAnalysisPanelProps) {
  const [data, setData] = useState<MarketAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>('demographics')

  useEffect(() => {
    if (isOpen && !data) {
      loadAnalysis()
    }
  }, [isOpen, data])

  async function loadAnalysis() {
    setLoading(true)
    try {
      const result = await getMarketAnalysis(marketId)
      setData(result)
    } catch (err) {
      console.error('Failed to load market analysis:', err)
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-xl flex flex-col z-50">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              {city}, {state}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">Market Analysis</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 hover:text-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
              <span className="ml-2 text-sm text-slate-500">Loading analysis...</span>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="border-b border-slate-200 px-6">
                <div className="flex gap-8">
                  <TabButton
                    icon={Users}
                    label="Demographics"
                    tabType="demographics"
                    active={activeTab === 'demographics'}
                    onClick={() => setActiveTab('demographics')}
                  />
                  <TabButton
                    icon={Shield}
                    label="Crime & Safety"
                    tabType="crime"
                    active={activeTab === 'crime'}
                    onClick={() => setActiveTab('crime')}
                  />
                  <TabButton
                    icon={Briefcase}
                    label="Jobs & Economy"
                    tabType="jobs"
                    active={activeTab === 'jobs'}
                    onClick={() => setActiveTab('jobs')}
                  />
                  <TabButton
                    icon={Cloud}
                    label="Weather"
                    tabType="weather"
                    active={activeTab === 'weather'}
                    onClick={() => setActiveTab('weather')}
                  />
                </div>
              </div>

              {/* Tab Content */}
              <div className="px-6 py-6">
                {activeTab === 'demographics' && (
                  <DemographicsTab data={data?.demographics ?? null} />
                )}
                {activeTab === 'crime' && (
                  <CrimeTab data={data?.crime ?? null} />
                )}
                {activeTab === 'jobs' && (
                  <JobsTab data={data?.jobs ?? null} />
                )}
                {activeTab === 'weather' && (
                  <WeatherTab data={data?.weather ?? null} />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

interface TabButtonProps {
  icon: typeof Users
  label: string
  tabType: TabType
  active: boolean
  onClick: () => void
}

function TabButton({ icon: Icon, label, active, onClick }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 py-4 px-1 border-b-2 transition-colors font-medium text-sm ${
        active
          ? 'border-primary-500 text-primary-600'
          : 'border-transparent text-slate-600 hover:text-slate-800'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  )
}

interface DemographicsTabProps {
  data: any
}

function DemographicsTab({ data }: DemographicsTabProps) {
  if (!data) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-600 text-sm">
          No data available. Please configure the API key in Admin Settings.
        </p>
      </div>
    )
  }

  const items = [
    { label: 'Population', value: data.population, format: 'number' },
    { label: 'Median Household Income', value: data.median_household_income, format: 'currency' },
    { label: 'Median Home Value', value: data.median_home_value, format: 'currency' },
    { label: 'Total Housing Units', value: data.total_housing_units, format: 'number' },
    { label: 'Owner-Occupied %', value: data.owner_occupied_percent, format: 'percent' },
    { label: 'Poverty Rate %', value: data.poverty_rate, format: 'percent' },
    { label: 'Median Age', value: data.median_age, format: 'number' },
  ]

  return (
    <div className="space-y-4">
      {items.map((item, idx) => (
        <div key={idx} className="flex justify-between items-center py-3 border-b border-slate-100">
          <span className="text-slate-600 font-medium">{item.label}</span>
          <span className="text-slate-800 font-semibold">
            {formatValue(item.value, item.format as any)}
          </span>
        </div>
      ))}
      {data.source && (
        <p className="text-xs text-slate-400 mt-4">Data source: {data.source}</p>
      )}
    </div>
  )
}

interface CrimeTabProps {
  data: any
}

function CrimeTab({ data }: CrimeTabProps) {
  if (!data) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-600 text-sm">
          No data available. Please configure the API key in Admin Settings.
        </p>
      </div>
    )
  }

  function getCrimeRateColor(rate: number | null) {
    if (rate === null) return 'bg-slate-100 text-slate-700'
    if (rate < 300) return 'bg-green-100 text-green-700'
    if (rate < 600) return 'bg-yellow-100 text-yellow-700'
    return 'bg-red-100 text-red-700'
  }

  function getCrimeRateLabel(rate: number | null) {
    if (rate === null) return 'N/A'
    if (rate < 300) return 'Low'
    if (rate < 600) return 'Moderate'
    return 'High'
  }

  const crimeItems = [
    { label: 'Violent Crime Rate (per 100k)', value: data.violent_crime_rate },
    { label: 'Property Crime Rate (per 100k)', value: data.property_crime_rate },
  ]

  const breakdown = [
    { label: 'Murder', value: data.murder },
    { label: 'Robbery', value: data.robbery },
    { label: 'Aggravated Assault', value: data.aggravated_assault },
    { label: 'Burglary', value: data.burglary },
    { label: 'Larceny', value: data.larceny },
    { label: 'Motor Vehicle Theft', value: data.motor_vehicle_theft },
  ]

  return (
    <div className="space-y-6">
      {crimeItems.map((item, idx) => (
        <div key={idx}>
          <p className="text-slate-600 font-medium mb-2">{item.label}</p>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-slate-800">
              {item.value !== null ? item.value.toLocaleString() : 'N/A'}
            </span>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${getCrimeRateColor(item.value)}`}
            >
              {getCrimeRateLabel(item.value)}
            </span>
          </div>
        </div>
      ))}

      <div className="border-t border-slate-200 pt-6">
        <h3 className="font-semibold text-slate-800 mb-4">Crime Breakdown</h3>
        <div className="grid grid-cols-2 gap-4">
          {breakdown.map((item, idx) => (
            <div key={idx} className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-1">{item.label}</p>
              <p className="text-lg font-semibold text-slate-800">
                {item.value !== null ? item.value.toLocaleString() : 'N/A'}
              </p>
            </div>
          ))}
        </div>
      </div>

      {data.year && (
        <p className="text-xs text-slate-400 mt-4">Data year: {data.year}</p>
      )}
      {data.source && (
        <p className="text-xs text-slate-400">Data source: {data.source}</p>
      )}
    </div>
  )
}

interface JobsTabProps {
  data: any
}

function JobsTab({ data }: JobsTabProps) {
  if (!data) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-600 text-sm">
          No data available. Please configure the API key in Admin Settings.
        </p>
      </div>
    )
  }

  const stats = [
    { label: 'Total Jobs', value: data.total_jobs, format: 'number' },
    { label: 'Average Salary', value: data.average_salary, format: 'currency' },
    { label: 'Salary Range', value: `${formatValue(data.salary_min, 'currency')} - ${formatValue(data.salary_max, 'currency')}`, format: 'text' },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        {stats.slice(0, 2).map((item, idx) => (
          <div key={idx} className="bg-primary-50 rounded-lg p-4 border border-primary-100">
            <p className="text-xs text-primary-600 font-medium mb-1">{item.label}</p>
            <p className="text-2xl font-bold text-primary-900">
              {item.format === 'currency'
                ? formatCurrency(item.value)
                : item.value !== null
                  ? item.value.toLocaleString()
                  : 'N/A'}
            </p>
          </div>
        ))}
      </div>

      <div>
        <p className="text-slate-600 font-medium mb-2">Salary Range</p>
        <p className="text-lg text-slate-800">
          {formatCurrency(data.salary_min)} - {formatCurrency(data.salary_max)}
        </p>
      </div>

      {data.top_categories && data.top_categories.length > 0 && (
        <div>
          <h3 className="font-semibold text-slate-800 mb-3">Top Job Categories</h3>
          <div className="flex flex-wrap gap-2">
            {data.top_categories.map((cat: string, idx: number) => (
              <span
                key={idx}
                className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-full text-sm font-medium"
              >
                {cat}
              </span>
            ))}
          </div>
        </div>
      )}

      {data.sample_jobs && data.sample_jobs.length > 0 && (
        <div>
          <h3 className="font-semibold text-slate-800 mb-3">Sample Job Listings</h3>
          <div className="space-y-3">
            {data.sample_jobs.map((job: any, idx: number) => (
              <div key={idx} className="border border-slate-200 rounded-lg p-3">
                <p className="font-medium text-slate-800">{job.title}</p>
                <p className="text-sm text-slate-600 mt-0.5">{job.company}</p>
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-slate-500">{job.location}</p>
                  {job.salary_min && job.salary_max && (
                    <p className="text-sm font-medium text-slate-700">
                      {formatCurrency(job.salary_min)} - {formatCurrency(job.salary_max)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.source && (
        <p className="text-xs text-slate-400 mt-4">Data source: {data.source}</p>
      )}
    </div>
  )
}

interface WeatherTabProps {
  data: any
}

function WeatherTab({ data }: WeatherTabProps) {
  if (!data) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-600 text-sm">
          No data available. Please configure the API key in Admin Settings.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6 border border-blue-200">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-blue-600 font-medium">Current Temperature</p>
            <p className="text-4xl font-bold text-blue-900 mt-2">
              {data.temperature_f !== null ? `${Math.round(data.temperature_f)}°F` : 'N/A'}
            </p>
            <p className="text-sm text-blue-700 mt-2">
              Feels like {data.feels_like_f !== null ? `${Math.round(data.feels_like_f)}°F` : 'N/A'}
            </p>
          </div>
          {data.icon && (
            <div className="text-5xl">{data.icon}</div>
          )}
        </div>
      </div>

      <div>
        <p className="text-slate-600 font-medium mb-2">Conditions</p>
        <p className="text-lg text-slate-800 capitalize">
          {data.description || 'N/A'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <p className="text-xs text-slate-500 font-medium mb-1">Humidity</p>
          <p className="text-2xl font-bold text-slate-800">
            {data.humidity !== null ? `${data.humidity}%` : 'N/A'}
          </p>
        </div>
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <p className="text-xs text-slate-500 font-medium mb-1">Wind Speed</p>
          <p className="text-2xl font-bold text-slate-800">
            {data.wind_speed_mph !== null ? `${data.wind_speed_mph.toFixed(1)} mph` : 'N/A'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatValue(value: any, format: 'number' | 'currency' | 'percent' | 'text'): string {
  if (value === null || value === undefined) return 'N/A'

  switch (format) {
    case 'currency':
      return formatCurrency(value)
    case 'percent':
      return `${value.toFixed(1)}%`
    case 'number':
      return typeof value === 'number' ? value.toLocaleString() : String(value)
    case 'text':
      return String(value)
    default:
      return String(value)
  }
}

function formatCurrency(value: any): string {
  if (value === null || value === undefined) return 'N/A'
  return '$' + Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })
}
