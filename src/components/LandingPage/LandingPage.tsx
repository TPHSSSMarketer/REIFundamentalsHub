import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Zap,
  Phone,
  Search,
  Kanban,
  Star,
  CalendarCheck,
  Smartphone,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  ArrowRight,
  Users,
  Building2,
  Briefcase,
} from 'lucide-react'

const features = [
  {
    name: 'DealCloser AI',
    tagline: 'Your 24/7 Follow-Up Machine',
    description:
      'Never lose a deal again. DealCloser AI keeps your leads warm with intelligent, real-time SMS, email, and DM follow-up — personalized to the conversation.',
    icon: Zap,
    color: 'bg-accent-100 text-accent-600',
  },
  {
    name: 'CallCommander AI',
    tagline: 'Your Inbound Call Assistant that Talks Like a Human',
    description:
      'CallCommander AI answers calls, qualifies sellers, captures property info, and schedules appointments — all while you\'re out closing deals or off the clock.',
    icon: Phone,
    color: 'bg-primary-100 text-primary-600',
  },
  {
    name: 'LeadGen AI',
    tagline: 'Get More Motivated Sellers On Autopilot',
    description:
      'Tap into cutting-edge data tools and targeting strategies to identify off-market sellers ready to act — before your competition even knows they exist.',
    icon: Search,
    color: 'bg-emerald-100 text-emerald-600',
  },
  {
    name: 'REI Pipeline Manager',
    tagline: 'Track Every Lead, Deal, and Dollar with Ease',
    description:
      'Visually manage your deals from first contact to close with drag-and-drop simplicity. Perfect for keeping your follow-ups and profits on track.',
    icon: Kanban,
    color: 'bg-blue-100 text-blue-600',
  },
  {
    name: 'Reputation Booster',
    tagline: 'Dominate Local Search & Build Trust Fast',
    description:
      'Automate review requests, boost your Google profile, and build trust with sellers — even before they speak to you.',
    icon: Star,
    color: 'bg-yellow-100 text-yellow-600',
  },
  {
    name: 'Smart Scheduler',
    tagline: 'Let Leads Book Directly Into Your Calendar',
    description:
      'Ditch the back-and-forth. Let sellers and buyers book meetings with you in real time based on your actual availability.',
    icon: CalendarCheck,
    color: 'bg-purple-100 text-purple-600',
  },
  {
    name: 'Mobile Command App',
    tagline: 'Your Entire Real Estate Business In Your Pocket',
    description:
      'Access your CRM, follow-ups, leads, and call data from anywhere. Whether you\'re in the field or at a closing, you\'re always in control.',
    icon: Smartphone,
    color: 'bg-teal-100 text-teal-600',
  },
]

const benefits = [
  'Built specifically for wholesalers & creative dealmakers',
  'Everything in one platform (no more duct-taped tools)',
  'Automated follow-up and voice AI closes more deals',
  'Simple enough to launch in 24–48 hours',
  'Full onboarding, setup, and templates included',
  'No long-term contracts',
]

const audiences = [
  {
    title: 'Do Wholesaling',
    description: 'Need consistent motivated seller leads',
    icon: Building2,
  },
  {
    title: 'Work Subject-To / Creative Finance',
    description: 'Want to close with less competition',
    icon: Briefcase,
  },
  {
    title: 'Are Solopreneurs',
    description: 'Need systems without hiring a team',
    icon: Users,
  },
]

interface FaqItem {
  category: string
  question: string
  answer: string
}

const faqItems: FaqItem[] = [
  {
    category: 'General',
    question: 'What is REIFundamentalsHUB?',
    answer:
      'REIFundamentalsHUB is an all-in-one software suite built specifically for real estate investors. It helps you automate lead intake, manage contacts, launch marketing campaigns, generate contracts, and close deals — all from one centralized platform.',
  },
  {
    category: 'General',
    question: 'Who is REIFundamentalsHUB for?',
    answer:
      "It's designed for real estate wholesalers, subject-to investors, lease option pros, and creative dealmakers who want to scale without hiring a big team. Whether you're brand new or experienced, the HUB acts like your full-time assistant.",
  },
  {
    category: 'General',
    question: 'Do I need to be tech-savvy to use the platform?',
    answer:
      'Nope. REIFundamentalsHUB is built with simplicity in mind. It comes with step-by-step tutorials, automations already set up, and our team is here to support you every step of the way.',
  },
  {
    category: 'Features',
    question: 'What tools are included in REIFundamentalsHUB?',
    answer:
      'The HUB includes tools for lead generation, follow-up automation, contract generation, pipeline management, SMS/email marketing, task reminders, and more. Every tool is designed to replace hours of manual work.',
  },
  {
    category: 'Features',
    question: 'Can I customize workflows and automations?',
    answer:
      'Yes! You can fully customize your follow-up sequences, pipelines, tags, triggers, and even how leads move through your system.',
  },
  {
    category: 'Features',
    question: 'Does the platform include built-in marketing tools?',
    answer:
      'Absolutely. You can launch SMS blasts, email campaigns, ringless voicemails, landing pages, and even track KPIs — all without needing third-party tools.',
  },
  {
    category: 'Security',
    question: 'Is my data secure?',
    answer:
      'Yes. REIFundamentalsHUB uses encrypted data storage, secure login protocols, and role-based access to protect your business and your leads.',
  },
  {
    category: 'Security',
    question: 'Can I add team members or VAs?',
    answer:
      'Yes — you can give team members access to specific areas like follow-up, CRM, or marketing without giving full admin access.',
  },
  {
    category: 'Billing',
    question: 'How much does REIFundamentalsHUB cost?',
    answer:
      'Pricing depends on your plan level and number of users. We offer flexible monthly and annual options.',
  },
  {
    category: 'Billing',
    question: 'Are there any hidden fees?',
    answer:
      'No hidden fees. Your subscription includes full access to the tools, automations, and training. SMS and call usage are pay-as-you-go and clearly itemized.',
  },
  {
    category: 'Billing',
    question: 'Can I cancel at any time?',
    answer:
      'Yes. There are no contracts or long-term commitments. Cancel anytime from your dashboard.',
  },
  {
    category: 'Support',
    question: 'Do you offer onboarding help?',
    answer:
      'Yes — every user gets access to a guided onboarding path, video tutorials, live Q&A calls, and support from real investors who use the platform.',
  },
  {
    category: 'Support',
    question: 'Is there live support available?',
    answer:
      'Yes, we offer chat support during business hours, a support ticket system, and optional 1-on-1 onboarding or tech help if needed.',
  },
  {
    category: 'Support',
    question: 'Will you help me get my first deal using the HUB?',
    answer:
      "100%. Our system is designed to guide you step-by-step — from launching your first campaign to closing your first deal. If you need accountability or deal coaching, that's available too.",
  },
]

function FaqAccordion({ item }: { item: FaqItem }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="font-medium text-slate-800 pr-4">{item.question}</span>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-slate-400 shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />
        )}
      </button>
      {isOpen && (
        <div className="px-4 pb-4">
          <p className="text-slate-600 leading-relaxed">{item.answer}</p>
        </div>
      )}
    </div>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-32">
            <div className="flex items-center">
              <img src="/logo.png" alt="REI Fundamentals Hub" className="h-28 object-contain" />
            </div>
            <div className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-sm text-slate-600 hover:text-primary-700 transition-colors">
                Features
              </a>
              <a href="#who-is-this-for" className="text-sm text-slate-600 hover:text-primary-700 transition-colors">
                Who It's For
              </a>
              <a href="#faq" className="text-sm text-slate-600 hover:text-primary-700 transition-colors">
                FAQ
              </a>
              <Link
                to="/dashboard"
                className="px-4 py-2 bg-accent-600 text-white text-sm font-medium rounded-lg hover:bg-accent-700 transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-800 via-primary-700 to-primary-900" />
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-accent-500 rounded-full filter blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary-400 rounded-full filter blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-22">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
              Close More Real Estate Deals with{' '}
              <span className="text-accent-400">Automation & AI</span>
            </h1>
            <p className="text-xl md:text-2xl text-primary-200 mb-4">
              Built for Wholesalers + Subject-To Investors
            </p>
            <p className="text-lg text-primary-300 max-w-3xl mx-auto mb-8">
              REIFundamentals Hub is your all-in-one marketing engine, lead manager, and virtual
              acquisition assistant. Everything you need to find, follow up, and close deals —
              without hiring a team.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/dashboard"
                className="px-8 py-4 bg-accent-600 text-white font-semibold rounded-xl hover:bg-accent-700 transition-colors text-lg shadow-lg shadow-accent-600/25"
              >
                Get Started Today
              </Link>
              <a
                href="#features"
                className="px-8 py-4 bg-white/10 text-white font-semibold rounded-xl hover:bg-white/20 transition-colors text-lg border border-white/20"
              >
                See It In Action
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Bar */}
      <section className="bg-slate-50 border-b border-slate-200 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-slate-500 text-sm font-medium">
            Trusted by real estate investors closing deals across the country
          </p>
        </div>
      </section>

      {/* Problem Statement */}
      <section className="py-10 md:py-14">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-6">
            Are you tired of chasing dead leads, missing calls, and managing 10 different tools?
          </h2>
          <p className="text-lg text-slate-600 leading-relaxed">
            Welcome to REIFundamentals Hub — the all-in-one software suite designed for real estate
            investors by investors who actually do deals. From marketing automation to lead follow-up
            to AI-powered voice calls, REIFundamentals Hub gives you every tool you need to
            consistently find and close motivated sellers — all under one roof.
          </p>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-10 md:py-14 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4">
              Here's What You Get Inside REIFundamentals Hub
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Seven powerful tools working together to help you find, follow up, and close more deals.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => (
              <div
                key={feature.name}
                className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg hover:border-primary-300 transition-all group"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${feature.color}`}>
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-1 group-hover:text-primary-700 transition-colors">
                  {feature.name}
                </h3>
                <p className="text-sm font-medium text-accent-600 mb-3">{feature.tagline}</p>
                <p className="text-sm text-slate-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who Is This For */}
      <section id="who-is-this-for" className="py-10 md:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4">
              Designed for Real Estate Investors Who:
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {audiences.map((audience) => (
              <div
                key={audience.title}
                className="text-center p-8 bg-white rounded-xl border border-slate-200 hover:shadow-md transition-shadow"
              >
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <audience.icon className="w-8 h-8 text-primary-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">{audience.title}</h3>
                <p className="text-slate-600">{audience.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-10 md:py-14 bg-gradient-to-br from-primary-800 to-primary-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 text-center">
              Why REIFundamentals Hub Beats Every Other CRM or Investor Tool Stack
            </h2>
            <p className="text-primary-300 text-center mb-8 text-lg">
              Everything you need, nothing you don't.
            </p>
            <div className="space-y-4">
              {benefits.map((benefit) => (
                <div key={benefit} className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-accent-400 shrink-0 mt-0.5" />
                  <span className="text-white text-lg">{benefit}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Placeholder */}
      <section className="py-10 md:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4">
              Investors Are Closing Deals in Weeks, Not Months
            </h2>
            <p className="text-lg text-slate-600">
              See what real estate investors are saying about REIFundamentals Hub.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-slate-200 p-6"
              >
                <div className="flex items-center gap-1 mb-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-slate-600 italic mb-4">
                  "REIFundamentals Hub completely transformed how I manage my deals. The AI follow-up alone has helped me close deals I would have lost."
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                    <span className="text-primary-700 font-bold text-sm">R{i}</span>
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">REI Investor</p>
                    <p className="text-sm text-slate-500">Wholesaler</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-10 md:py-14 bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-lg text-slate-600">
              Everything you need to know about REIFundamentals Hub.
            </p>
          </div>

          <div className="space-y-3">
            {faqItems.map((item, index) => (
              <FaqAccordion key={index} item={item} />
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-10 md:py-16 bg-gradient-to-br from-primary-800 via-primary-700 to-primary-900 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 right-20 w-64 h-64 bg-accent-500 rounded-full filter blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
            Ready to Ignite Your Deals?
          </h2>
          <p className="text-xl text-primary-200 mb-4">
            Let us show you how it works — no pressure, no tech skills needed.
          </p>
          <p className="text-primary-300 mb-8">
            We'll show you how investors are closing their first deals within 14–30 days
            using our tools — even with ZERO tech experience.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/dashboard"
              className="flex items-center gap-2 px-8 py-4 bg-accent-600 text-white font-semibold rounded-xl hover:bg-accent-700 transition-colors text-lg shadow-lg shadow-accent-600/25"
            >
              Get Started Now
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="#features"
              className="px-8 py-4 bg-white/10 text-white font-semibold rounded-xl hover:bg-white/20 transition-colors text-lg border border-white/20"
            >
              Book Your Free Demo
            </a>
          </div>
          <p className="text-primary-400 text-sm mt-6">
            No contracts. No tech headaches. Just more deals.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-primary-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Brand */}
            <div className="md:col-span-2">
              <div className="inline-flex items-center mb-4 bg-white rounded-lg p-2">
                <img src="/logo.png" alt="REI Fundamentals Hub" className="h-14 object-contain" />
              </div>
              <p className="text-primary-400 text-sm mb-1">
                Power Up Your Real Estate Business
              </p>
              <p className="text-primary-400 text-sm max-w-md">
                The all-in-one software suite designed for real estate investors
                by investors who actually do deals.
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-primary-400">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#who-is-this-for" className="hover:text-white transition-colors">Who It's For</a></li>
                <li><a href="#faq" className="hover:text-white transition-colors">FAQ</a></li>
                <li><Link to="/dashboard" className="hover:text-white transition-colors">Dashboard</Link></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-primary-400">
                <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Refund Policy</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-primary-800 mt-10 pt-6 text-center">
            <p className="text-sm text-primary-500">
              &copy; {new Date().getFullYear()} REI Fundamentals Hub. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
