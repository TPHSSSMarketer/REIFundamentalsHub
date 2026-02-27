import { generateMotivatedSellerHTML } from './motivated-seller'
import { generateCashBuyerHTML } from './cash-buyer'
import { generatePropertyEvaluationHTML } from './property-evaluation'
import { generateWholesaleDealsHTML } from './wholesale-deals'
import { LeadCaptureTemplate } from '@/services/leadCaptureApi'

export const templates: LeadCaptureTemplate[] = [
  {
    id: 'motivated-seller',
    name: 'We Buy Houses',
    description: 'Fast cash offers for motivated sellers looking to sell quickly',
    category: 'seller',
    previewColor: '#2563eb',
    generateHtml: generateMotivatedSellerHTML,
  },
  {
    id: 'cash-buyer',
    name: 'Find Off-Market Deals',
    description: 'Build a buyer list and send exclusive off-market opportunities',
    category: 'buyer',
    previewColor: '#1e293b',
    generateHtml: generateCashBuyerHTML,
  },
  {
    id: 'property-evaluation',
    name: 'Property Evaluation',
    description: 'Free property valuations to capture qualified leads',
    category: 'evaluation',
    previewColor: '#16a34a',
    generateHtml: generatePropertyEvaluationHTML,
  },
  {
    id: 'wholesale-deals',
    name: 'Wholesale Deal Alerts',
    description: 'Build exclusive buyer network for wholesale opportunities',
    category: 'wholesale',
    previewColor: '#ea580c',
    generateHtml: generateWholesaleDealsHTML,
  },
]

export function getTemplateById(id: string): LeadCaptureTemplate | undefined {
  return templates.find((t) => t.id === id)
}

export function getTemplatesByCategory(category: string): LeadCaptureTemplate[] {
  return templates.filter((t) => t.category === category)
}
