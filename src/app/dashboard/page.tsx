import { Header } from '@/components/layout/header'
import { StatsCard } from '@/components/dashboard/stats-card'
import { RecentLeads } from '@/components/dashboard/recent-leads'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { PipelineOverview } from '@/components/dashboard/pipeline-overview'
import {
  Users,
  DollarSign,
  TrendingUp,
  Target,
  Calendar,
  CheckCircle,
} from 'lucide-react'
import type { Lead } from '@/types'

// Mock data - in production, this would come from GHL API
const mockStats = {
  totalLeads: 247,
  newLeadsThisMonth: 32,
  activeDeals: 18,
  totalDealValue: 2450000,
  closedDealsThisMonth: 4,
  closedDealValue: 380000,
  conversionRate: 12.5,
  appointmentsThisWeek: 8,
}

const mockLeads: Lead[] = [
  {
    id: '1',
    firstName: 'John',
    lastName: 'Smith',
    email: 'john@example.com',
    phone: '5551234567',
    address: '123 Main St',
    city: 'Dallas',
    state: 'TX',
    zipCode: '75001',
    propertyType: 'single_family',
    source: 'direct_mail',
    status: 'new',
    tags: ['motivated', 'cash'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    motivation: 'high',
    estimatedValue: 185000,
  },
  {
    id: '2',
    firstName: 'Sarah',
    lastName: 'Johnson',
    email: 'sarah@example.com',
    phone: '5559876543',
    address: '456 Oak Ave',
    city: 'Fort Worth',
    state: 'TX',
    zipCode: '76102',
    propertyType: 'single_family',
    source: 'facebook',
    status: 'qualified',
    tags: ['pre-foreclosure'],
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    motivation: 'very_high',
    estimatedValue: 225000,
  },
  {
    id: '3',
    firstName: 'Michael',
    lastName: 'Williams',
    email: 'mike@example.com',
    phone: '5555551234',
    address: '789 Pine Rd',
    city: 'Arlington',
    state: 'TX',
    zipCode: '76010',
    propertyType: 'multi_family',
    source: 'referral',
    status: 'appointment_set',
    tags: ['investor'],
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    updatedAt: new Date().toISOString(),
    motivation: 'medium',
    estimatedValue: 450000,
  },
  {
    id: '4',
    firstName: 'Emily',
    lastName: 'Davis',
    email: 'emily@example.com',
    phone: '5552223333',
    address: '321 Elm St',
    city: 'Plano',
    state: 'TX',
    zipCode: '75024',
    propertyType: 'single_family',
    source: 'driving_for_dollars',
    status: 'offer_made',
    tags: ['vacant', 'absentee'],
    createdAt: new Date(Date.now() - 259200000).toISOString(),
    updatedAt: new Date().toISOString(),
    motivation: 'high',
    estimatedValue: 165000,
  },
]

const mockPipelineStages = [
  { id: '1', name: 'New', count: 12, value: 1800000, color: '#3B82F6' },
  { id: '2', name: 'Contacted', count: 8, value: 1200000, color: '#8B5CF6' },
  { id: '3', name: 'Qualified', count: 6, value: 900000, color: '#F59E0B' },
  { id: '4', name: 'Under Contract', count: 4, value: 600000, color: '#10B981' },
]

export default function DashboardPage() {
  return (
    <div className="min-h-screen">
      <Header
        title="Dashboard"
        description="Welcome back! Here's what's happening with your business."
      />

      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Total Leads"
            value={mockStats.totalLeads}
            change={{ value: 12, label: 'vs last month' }}
            icon={Users}
          />
          <StatsCard
            title="Active Deals"
            value={mockStats.activeDeals}
            change={{ value: 8, label: 'vs last month' }}
            icon={Target}
          />
          <StatsCard
            title="Pipeline Value"
            value={`$${(mockStats.totalDealValue / 1000000).toFixed(1)}M`}
            change={{ value: 15, label: 'vs last month' }}
            icon={DollarSign}
          />
          <StatsCard
            title="Conversion Rate"
            value={`${mockStats.conversionRate}%`}
            change={{ value: 2.3, label: 'vs last month' }}
            icon={TrendingUp}
          />
        </div>

        {/* Second row stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatsCard
            title="Closed This Month"
            value={mockStats.closedDealsThisMonth}
            change={{ value: 33, label: 'vs last month' }}
            icon={CheckCircle}
            iconColor="text-green-600"
          />
          <StatsCard
            title="Appointments This Week"
            value={mockStats.appointmentsThisWeek}
            icon={Calendar}
            iconColor="text-purple-600"
          />
        </div>

        {/* Quick Actions */}
        <QuickActions />

        {/* Pipeline Overview */}
        <PipelineOverview stages={mockPipelineStages} />

        {/* Recent Leads */}
        <RecentLeads leads={mockLeads} />
      </div>
    </div>
  )
}
