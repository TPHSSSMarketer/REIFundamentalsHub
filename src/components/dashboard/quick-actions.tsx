'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  UserPlus,
  Send,
  Calendar,
  FileText,
  Megaphone,
  PenTool,
} from 'lucide-react'

const actions = [
  {
    name: 'Add Lead',
    description: 'Create a new lead',
    icon: UserPlus,
    href: '/dashboard/leads?action=new',
    color: 'bg-blue-500',
  },
  {
    name: 'Send SMS',
    description: 'Quick message',
    icon: Send,
    href: '/dashboard/leads?action=sms',
    color: 'bg-green-500',
  },
  {
    name: 'Schedule',
    description: 'Book appointment',
    icon: Calendar,
    href: '/dashboard/pipeline?action=schedule',
    color: 'bg-purple-500',
  },
  {
    name: 'New Campaign',
    description: 'Launch marketing',
    icon: Megaphone,
    href: '/dashboard/marketing?action=new',
    color: 'bg-orange-500',
  },
  {
    name: 'Create Content',
    description: 'AI-powered content',
    icon: PenTool,
    href: '/dashboard/content',
    color: 'bg-pink-500',
  },
  {
    name: 'Support',
    description: 'Get help',
    icon: FileText,
    href: '/dashboard/support?action=new',
    color: 'bg-gray-500',
  },
]

export function QuickActions() {
  return (
    <div className="rounded-xl border bg-card p-6">
      <h3 className="font-semibold mb-4">Quick Actions</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {actions.map((action) => (
          <Link key={action.name} href={action.href}>
            <div className="flex flex-col items-center justify-center p-4 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer group">
              <div
                className={`rounded-full p-3 ${action.color} text-white mb-2 group-hover:scale-110 transition-transform`}
              >
                <action.icon className="h-5 w-5" />
              </div>
              <p className="font-medium text-sm">{action.name}</p>
              <p className="text-xs text-muted-foreground">{action.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
