import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Building2,
  Users,
  KanbanSquare,
  Megaphone,
  PenTool,
  LifeBuoy,
  ArrowRight,
  Check,
  Shield,
  Zap,
} from 'lucide-react'

const features = [
  {
    icon: Users,
    title: 'Lead Management',
    description: 'Track and manage all your real estate leads in one place with easy filtering and quick actions.',
  },
  {
    icon: KanbanSquare,
    title: 'Deal Pipeline',
    description: 'Visual drag-and-drop pipeline to track deals from lead to close. Never lose track of a deal again.',
  },
  {
    icon: Megaphone,
    title: 'Marketing Hub',
    description: 'Manage SMS, email, and direct mail campaigns. Track performance and ROI in real-time.',
  },
  {
    icon: PenTool,
    title: 'AI Content Creator',
    description: 'Generate compelling marketing content with AI. Create SMS, emails, scripts, and more in seconds.',
  },
  {
    icon: LifeBuoy,
    title: 'Built-in Support',
    description: 'Need changes? Submit a support ticket and our team will help you customize your experience.',
  },
  {
    icon: Shield,
    title: 'GHL Integration',
    description: 'Seamlessly integrates with GoHighLevel. All your data syncs automatically.',
  },
]

const benefits = [
  'No complex setup required',
  'Mobile-friendly dashboard',
  'Real-time lead notifications',
  'Automated follow-up sequences',
  'Detailed analytics and reporting',
  'Dedicated support team',
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <span className="font-bold text-xl">REI Hub</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login">
                <Button variant="ghost">Sign In</Button>
              </Link>
              <Link href="/login">
                <Button>Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Zap className="h-4 w-4" />
            Powered by GoHighLevel
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 dark:text-white mb-6">
            The Simple CRM for{' '}
            <span className="text-primary">Real Estate Investors</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            All the power of GoHighLevel, simplified for REI professionals.
            Track leads, manage deals, run campaigns, and close more deals.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/login">
              <Button size="lg" className="text-lg px-8">
                Start Free Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="#features">
              <Button variant="outline" size="lg" className="text-lg px-8">
                See Features
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Dashboard Preview */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="rounded-xl border bg-card shadow-2xl overflow-hidden">
            <div className="bg-muted px-4 py-2 border-b flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 min-h-[300px] flex items-center justify-center">
              <div className="text-center">
                <Building2 className="h-16 w-16 mx-auto text-primary mb-4" />
                <p className="text-lg font-medium">Clean, Modern Dashboard</p>
                <p className="text-muted-foreground">See all your KPIs at a glance</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Everything You Need to Close More Deals
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              A simplified interface that puts the most important GHL features at your fingertips.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="p-6 rounded-xl border bg-card hover:shadow-lg transition-shadow"
              >
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-6">
                Built for Real Estate Investors, Not Tech Experts
              </h2>
              <p className="text-xl text-muted-foreground mb-8">
                We took the most powerful features of GoHighLevel and made them
                incredibly simple to use. No technical knowledge required.
              </p>
              <ul className="space-y-4">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                      <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                    <span className="text-lg">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-gradient-to-br from-primary/20 to-primary/5 rounded-2xl p-8">
              <div className="bg-card rounded-xl p-6 shadow-lg">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">New Lead!</p>
                    <p className="text-sm text-muted-foreground">John Smith - Motivated Seller</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-muted rounded w-full" />
                  <div className="h-3 bg-muted rounded w-4/5" />
                  <div className="h-3 bg-muted rounded w-3/5" />
                </div>
                <div className="flex gap-2 mt-4">
                  <div className="h-8 bg-primary/20 rounded flex-1" />
                  <div className="h-8 bg-primary rounded flex-1" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-primary text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">
            Ready to Simplify Your REI Business?
          </h2>
          <p className="text-xl opacity-90 mb-8">
            Join hundreds of real estate investors who have streamlined their
            operations with REI Hub.
          </p>
          <Link href="/login">
            <Button size="lg" variant="secondary" className="text-lg px-8">
              Get Started Today
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Building2 className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold">REI Hub</span>
            </div>
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} REI Hub. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
