import { generateHTML as motivatedSellers } from './motivated-sellers'
import { generateHTML as cashBuyers } from './cash-buyers'
import { generateHTML as investorAgentHybrid } from './investor-agent-hybrid'
import { generateHTML as agentLanding } from './agent-landing'
import { generateHTML as companyCredibility } from './company-credibility'
import { generateHTML as mobileHomes } from './mobile-homes'
import { generateHTML as landBuying } from './land-buying'
import { generateHTML as rentToOwn } from './rent-to-own'
import { generateHTML as ownerFinance } from './owner-finance'
import { generateHTML as noteBuying } from './note-buying'

export interface TemplateConfig {
  company_name: string
  headline: string
  description: string
  phone: string
  email: string
  primary_color: string
  market?: string
  logo_url?: string
  form_fields: string[]
  slug?: string
}

export interface TemplateInfo {
  id: string
  name: string
  description: string
  category: string
  targetLead: string
  cta: string
  defaultColor: string
  defaultHeadline: string
  defaultDescription: string
  generateHTML: (config: TemplateConfig) => string
}

export const templates: TemplateInfo[] = [
  {
    id: 'motivated_sellers',
    name: 'Motivated Sellers',
    description: 'Attract homeowners looking to sell fast for cash',
    category: 'seller',
    targetLead: 'Home sellers',
    cta: 'Get My Cash Offer',
    defaultColor: '#1a3a5c',
    defaultHeadline: 'We Buy Houses Fast For Cash',
    defaultDescription: 'Get a fair cash offer on your house today. No repairs, no commissions, no hassle.',
    generateHTML: motivatedSellers,
  },
  {
    id: 'cash_buyers',
    name: 'Cash Buyers',
    description: 'Build your buyers list with off-market deal seekers',
    category: 'buyer',
    targetLead: 'Property buyers',
    cta: 'Join Our Buyers List',
    defaultColor: '#2d2d2d',
    defaultHeadline: 'Get Exclusive Off-Market Deals',
    defaultDescription: 'Join our VIP buyers list and get first access to below-market investment properties.',
    generateHTML: cashBuyers,
  },
  {
    id: 'investor_agent',
    name: 'Investor/Agent Hybrid',
    description: 'Capture both seller and agent leads',
    category: 'hybrid',
    targetLead: 'Sellers + Agents',
    cta: 'Get Started Today',
    defaultColor: '#0d9488',
    defaultHeadline: 'Real Estate Solutions For Every Situation',
    defaultDescription: 'Whether you\'re buying, selling, or investing — we have a solution for you.',
    generateHTML: investorAgentHybrid,
  },
  {
    id: 'agent',
    name: 'Agent Landing Page',
    description: 'Generate listing leads with free home valuations',
    category: 'agent',
    targetLead: 'Homeowners',
    cta: 'Get Free Home Valuation',
    defaultColor: '#059669',
    defaultHeadline: 'What\'s Your Home Really Worth?',
    defaultDescription: 'Get a free, no-obligation home valuation from a local real estate expert.',
    generateHTML: agentLanding,
  },
  {
    id: 'company_credibility',
    name: 'Company Credibility',
    description: 'Build trust and establish your brand',
    category: 'branding',
    targetLead: 'General inquiries',
    cta: 'Contact Us',
    defaultColor: '#1e3a5f',
    defaultHeadline: 'Your Trusted Local Real Estate Partner',
    defaultDescription: 'Learn about our team, our values, and why hundreds of homeowners trust us.',
    generateHTML: companyCredibility,
  },
  {
    id: 'mobile_homes',
    name: 'Mobile Homes',
    description: 'Target mobile/manufactured home sellers',
    category: 'seller',
    targetLead: 'Mobile home sellers',
    cta: 'Get My Mobile Home Offer',
    defaultColor: '#d97706',
    defaultHeadline: 'We Buy Mobile Homes For Cash',
    defaultDescription: 'Sell your mobile home fast. Any condition, any age. Get a fair cash offer today.',
    generateHTML: mobileHomes,
  },
  {
    id: 'land',
    name: 'Land Buying & Selling',
    description: 'Capture land owner leads',
    category: 'seller',
    targetLead: 'Land owners',
    cta: 'Get a Land Offer',
    defaultColor: '#4d7c0f',
    defaultHeadline: 'We Buy Land — Any Size, Any Condition',
    defaultDescription: 'Sell your vacant land fast for cash. No listing fees, no waiting, no hassle.',
    generateHTML: landBuying,
  },
  {
    id: 'rent_to_own',
    name: 'Rent-to-Own',
    description: 'Attract tenant-buyers looking to own',
    category: 'buyer',
    targetLead: 'Tenant buyers',
    cta: 'Apply for Rent-to-Own',
    defaultColor: '#7c3aed',
    defaultHeadline: 'Own Your Dream Home — No Bank Needed',
    defaultDescription: 'Rent-to-own homes available now. Build equity while you live in your future home.',
    generateHTML: rentToOwn,
  },
  {
    id: 'owner_finance',
    name: 'Owner Financing',
    description: 'Market owner-financed properties',
    category: 'buyer',
    targetLead: 'Buyers needing financing',
    cta: 'See Available Homes',
    defaultColor: '#dc2626',
    defaultHeadline: 'Owner Financing Available — Move In Fast',
    defaultDescription: 'No bank qualification needed. Low down payment. Flexible terms. Your new home awaits.',
    generateHTML: ownerFinance,
  },
  {
    id: 'note_buying',
    name: 'Note Buying & Selling',
    description: 'Target mortgage note holders',
    category: 'notes',
    targetLead: 'Note holders',
    cta: 'Get a Note Quote',
    defaultColor: '#475569',
    defaultHeadline: 'Sell Your Mortgage Note For Cash',
    defaultDescription: 'Get a competitive cash offer for your performing or non-performing mortgage note.',
    generateHTML: noteBuying,
  },
]

export function getTemplateById(id: string): TemplateInfo | undefined {
  return templates.find(t => t.id === id)
}

export function getTemplatesByCategory(category: string): TemplateInfo[] {
  return templates.filter(t => t.category === category)
}
