/**
 * Default trust badges, testimonials, and FAQ items for each template.
 * These are used when the user hasn't customized these sections.
 * Each template has its own set of defaults relevant to that template type.
 */

import { TrustBadge, Testimonial, FAQItem } from './index'

// ── Trust Badge Defaults ─────────────────────────────────

export const defaultTrustBadges: Record<string, TrustBadge[]> = {
  motivated_sellers: [
    { icon: 'award', bold: 'A+', text: 'BBB Rated' },
    { icon: 'star', bold: '4.9/5', text: 'Google Reviews' },
    { icon: 'home', bold: '500+', text: 'Homes Purchased' },
    { icon: 'clock', bold: '7 days', text: 'Average Close Time' },
  ],
  cash_buyers: [
    { icon: 'award', bold: 'A+', text: 'BBB Rated' },
    { icon: 'star', bold: '4.9/5', text: 'Investor Reviews' },
    { icon: 'dollar', bold: '200+', text: 'Deals Funded' },
    { icon: 'clock', bold: 'Weekly', text: 'New Deals Added' },
  ],
  investor_agent: [
    { icon: 'award', bold: 'A+', text: 'BBB Rated' },
    { icon: 'star', bold: '4.9/5', text: 'Google Reviews' },
    { icon: 'home', bold: '500+', text: 'Deals Closed' },
    { icon: 'users', bold: '15+ Yrs', text: 'Experience' },
  ],
  agent: [
    { icon: 'award', bold: 'Top 1%', text: 'Local Agent' },
    { icon: 'star', bold: '4.9/5', text: 'Client Reviews' },
    { icon: 'home', bold: '300+', text: 'Homes Sold' },
    { icon: 'clock', bold: 'Free', text: 'Home Valuation' },
  ],
  company_credibility: [
    { icon: 'award', bold: '15+ Yrs', text: 'In Business' },
    { icon: 'star', bold: '4.9/5', text: 'Google Rating' },
    { icon: 'home', bold: '1,000+', text: 'Clients Served' },
    { icon: 'shieldCheck', bold: 'Licensed', text: '& Insured' },
  ],
  mobile_homes: [
    { icon: 'award', bold: 'A+', text: 'BBB Rated' },
    { icon: 'star', bold: '4.9/5', text: 'Google Reviews' },
    { icon: 'home', bold: '300+', text: 'Mobile Homes Bought' },
    { icon: 'clock', bold: '14 days', text: 'Average Close Time' },
  ],
  land: [
    { icon: 'award', bold: 'A+', text: 'BBB Rated' },
    { icon: 'star', bold: '4.9/5', text: 'Google Reviews' },
    { icon: 'home', bold: '500+', text: 'Parcels Purchased' },
    { icon: 'clock', bold: '21 days', text: 'Average Close Time' },
  ],
  rent_to_own: [
    { icon: 'award', bold: 'A+', text: 'BBB Rated' },
    { icon: 'star', bold: '4.9/5', text: 'Resident Reviews' },
    { icon: 'home', bold: '100+', text: 'Families Housed' },
    { icon: 'clock', bold: '30 Day', text: 'Move In' },
  ],
  owner_finance: [
    { icon: 'award', bold: 'A+', text: 'BBB Rated' },
    { icon: 'star', bold: '4.9/5', text: 'Buyer Reviews' },
    { icon: 'home', bold: '150+', text: 'Homes Financed' },
    { icon: 'dollar', bold: 'Low', text: 'Down Payment' },
  ],
  note_buying: [
    { icon: 'award', bold: 'A+', text: 'BBB Rated' },
    { icon: 'star', bold: '4.9/5', text: 'Client Reviews' },
    { icon: 'dollar', bold: '$50M+', text: 'Notes Purchased' },
    { icon: 'clock', bold: '10 days', text: 'Average Close' },
  ],
}

// ── Testimonial Defaults ─────────────────────────────────

export const defaultTestimonials: Record<string, Testimonial[]> = {
  motivated_sellers: [
    { name: 'Sarah M.', title: 'Homeowner', quote: 'I was facing foreclosure and didn\'t know what to do. They gave me a fair offer and we closed in 10 days. Saved my credit and gave me a fresh start.', stars: 5 },
    { name: 'James T.', title: 'Inherited Property', quote: 'I inherited a house that needed a ton of work. They bought it as-is and I didn\'t have to lift a finger. The whole process was smooth and professional.', stars: 5 },
    { name: 'Maria G.', title: 'Quick Sale', quote: 'After my divorce, I needed to sell quickly and move on. They made a fair offer the same day I called and we closed in two weeks. Highly recommend!', stars: 5 },
  ],
  cash_buyers: [
    { name: 'David R.', title: 'Fix & Flip Investor', quote: 'I\'ve been on their buyers list for 6 months and already closed 3 deals. The properties are accurately described and the numbers always work.', stars: 5 },
    { name: 'Lisa M.', title: 'Buy & Hold Investor', quote: 'Best source for off-market rental properties in the area. They understand what investors need and deliver quality deals consistently.', stars: 5 },
    { name: 'Alex K.', title: 'New Investor', quote: 'As a first-time investor, their team guided me through the entire process. Found an amazing deal on my first rental property.', stars: 5 },
  ],
  investor_agent: [
    { name: 'Michael P.', title: 'Home Seller', quote: 'They gave me options I didn\'t know I had. Whether cash offer or traditional listing, they explained everything clearly. Sold my home in 2 weeks.', stars: 5 },
    { name: 'Sandra W.', title: 'Property Investor', quote: 'Their dual expertise in investing and real estate made all the difference. Found me a great investment property below market value.', stars: 5 },
    { name: 'Chris L.', title: 'First-Time Buyer', quote: 'They helped us find our dream home and negotiated a great deal. Their investment background gave us insights other agents couldn\'t provide.', stars: 5 },
  ],
  agent: [
    { name: 'Tom B.', title: 'Homeowner', quote: 'Their home valuation was spot on. We listed at the right price and sold in just one weekend. Professional service from start to finish.', stars: 5 },
    { name: 'Rachel H.', title: 'First-Time Seller', quote: 'I had no idea my home was worth that much! They provided a detailed valuation and helped me sell for top dollar. Couldn\'t be happier.', stars: 5 },
    { name: 'Kevin D.', title: 'Relocating', quote: 'Needed to sell fast due to a job transfer. They priced my home perfectly and had it under contract in 5 days. Incredible agent.', stars: 5 },
  ],
  company_credibility: [
    { name: 'Robert J.', title: 'Client', quote: 'Working with this team was the best decision we made. Their experience and integrity set them apart from every other company we talked to.', stars: 5 },
    { name: 'Patricia M.', title: 'Repeat Client', quote: 'We\'ve done multiple transactions with them over the years. Every single one was handled professionally. They\'re our go-to for all things real estate.', stars: 5 },
    { name: 'Andrew S.', title: 'Referred Client', quote: 'A friend recommended them and I\'m so glad they did. Transparent, honest, and they delivered exactly what they promised. Five stars across the board.', stars: 5 },
  ],
  mobile_homes: [
    { name: 'Linda W.', title: 'Mobile Home Seller', quote: 'Sold my 1995 singlewide that I thought nobody would want. They made a fair offer and closed fast. No repairs needed!', stars: 5 },
    { name: 'Mike R.', title: 'Park Owner', quote: 'They bought 3 vacant mobile homes from my park. Professional, quick, and they handled all the title work. Great experience.', stars: 5 },
    { name: 'Teresa H.', title: 'Quick Sale', quote: 'Fast, honest, and professional. They paid what they promised. Highly recommended!', stars: 5 },
  ],
  land: [
    { name: 'George K.', title: 'Land Owner', quote: 'Had 40 acres I\'d been trying to sell for years. They made a fair cash offer and closed in 3 weeks. No realtor fees!', stars: 5 },
    { name: 'Susan P.', title: 'Inherited Land', quote: 'Inherited land in another state and had no idea what to do with it. They handled everything remotely and made it so easy.', stars: 5 },
    { name: 'Bill D.', title: 'Multiple Parcels', quote: 'Sold them 5 lots that had been sitting on the market forever. One offer for all of them and a smooth closing. Wish I\'d called sooner.', stars: 5 },
  ],
  rent_to_own: [
    { name: 'Marcus D.', title: 'Tenant-Buyer', quote: 'I never thought I could buy a home with my credit score. They gave me a real chance to become a homeowner. Building equity every month feels amazing!', stars: 5 },
    { name: 'Jennifer K.', title: 'Family of 4', quote: 'We were stuck renting for years. Now we have a path to homeownership. Our kids have their own rooms and we are building something real for our family.', stars: 5 },
    { name: 'Robert T.', title: 'Rent-to-Own Owner', quote: 'The whole process was transparent and fair. They treated us like partners, not problems. Excited to finish my lease and own this home outright!', stars: 5 },
  ],
  owner_finance: [
    { name: 'Angela R.', title: 'New Homeowner', quote: 'After being turned down by 3 banks, they helped me get into my own home with owner financing. The monthly payment is less than my old rent!', stars: 5 },
    { name: 'Carlos M.', title: 'Self-Employed Buyer', quote: 'Being self-employed made it impossible to get a traditional mortgage. Owner financing was the perfect solution. Great home, fair terms.', stars: 5 },
    { name: 'Diana S.', title: 'Single Mom', quote: 'Finally, a path to homeownership that does not require perfect credit. Highly recommend!', stars: 5 },
  ],
  note_buying: [
    { name: 'Frank H.', title: 'Note Seller', quote: 'Sold my mortgage note for a great price. They were transparent about their evaluation process and closed in just 10 days. Very professional.', stars: 5 },
    { name: 'Barbara L.', title: 'Private Lender', quote: 'I had 3 performing notes I wanted to liquidate. They gave me competitive offers on all three and handled everything. Smooth transactions.', stars: 5 },
    { name: 'Steve W.', title: 'Estate Executor', quote: 'Needed to sell a mortgage note as part of settling an estate. They made a complex situation simple. Fair price, fast close.', stars: 5 },
  ],
}

// ── FAQ Defaults ──────────────────────────────────────────

export const defaultFAQs: Record<string, FAQItem[]> = {
  motivated_sellers: [
    { question: 'Do you really buy houses in any condition?', answer: 'Yes! We buy houses in any condition — damaged, outdated, fire damage, foundation issues, hoarding situations, you name it. We handle all repairs ourselves after closing.' },
    { question: 'How fast can you close?', answer: 'We can close in as few as 7 days, or on whatever timeline works best for you. Need 30 or 60 days? No problem. You pick the closing date and we will make it happen.' },
    { question: 'Are there any fees or commissions?', answer: 'Absolutely not. There are zero fees, zero commissions, and zero closing costs. The cash offer we make is the amount you receive. No surprises.' },
    { question: 'How is the offer price determined?', answer: 'We evaluate your property based on location, condition, comparable sales, and current market conditions. Our goal is to make a fair, competitive offer that works for both sides.' },
    { question: 'Am I obligated to accept your offer?', answer: 'Not at all. Our offers are 100% no-obligation. If the number does not work for you, there is no pressure and no hard feelings.' },
  ],
  cash_buyers: [
    { question: 'How do I get on your buyers list?', answer: 'Simply fill out the form above with your investment criteria. Once approved, you will receive exclusive deal alerts before they hit the open market.' },
    { question: 'What types of properties do you offer?', answer: 'We source a variety of investment properties including fix-and-flip opportunities, turnkey rentals, multi-family units, and wholesale deals. Something for every strategy.' },
    { question: 'Is there a fee to join?', answer: 'No! Joining our buyers list is completely free. We make our money on the deal, not from our investors. You only pay when you find a deal you love.' },
    { question: 'How quickly do deals go?', answer: 'Our best deals move fast — often within 24-48 hours. We recommend being pre-approved and ready to move quickly when the right property comes along.' },
    { question: 'What areas do you cover?', answer: 'We source deals across the region. Contact us to learn about our current inventory areas and upcoming deal flow.' },
  ],
  investor_agent: [
    { question: 'Do you work with both buyers and sellers?', answer: 'Yes! We are uniquely positioned as both investors and licensed agents. Whether you want a cash offer, traditional listing, or investment guidance, we have you covered.' },
    { question: 'What makes you different from a regular agent?', answer: 'Our investment background means we understand numbers, ROI, and creative deal structures that most agents never think of. We bring investor-level insights to every transaction.' },
    { question: 'Can you help me find investment properties?', answer: 'Absolutely. We help investors source, analyze, and acquire properties that match their investment criteria and financial goals.' },
    { question: 'How fast can you close if I need a cash offer?', answer: 'We can close cash offers in as few as 7-14 days. If you need more time, we work on your schedule. No pressure, no obligation.' },
    { question: 'Do you charge commissions?', answer: 'For cash offers, there are zero commissions or fees. For traditional listings, standard agent commissions apply but we negotiate the best deal for you.' },
  ],
  agent: [
    { question: 'Is the home valuation really free?', answer: 'Yes, 100% free with no strings attached. We provide a detailed comparative market analysis based on recent sales, current listings, and market trends in your area.' },
    { question: 'How accurate is the valuation?', answer: 'Our valuations are based on real-time market data and comparable sales. We personally review every valuation for accuracy — no algorithms or guesswork.' },
    { question: 'Am I obligated to list with you?', answer: 'Not at all. The valuation is yours to keep regardless. We hope you will consider us when you are ready, but there is zero pressure or obligation.' },
    { question: 'How long does the valuation take?', answer: 'You will receive your detailed home valuation within 24 hours of submitting your information. For the most accurate results, we may schedule a brief walkthrough.' },
    { question: 'What areas do you serve?', answer: 'We serve the local area and surrounding communities. Enter your address above to see if your property falls within our coverage area.' },
  ],
  company_credibility: [
    { question: 'How long has your company been in business?', answer: 'We have been serving our community for over 15 years. In that time, we have helped more than 1,000 clients successfully achieve their real estate goals.' },
    { question: 'Are all team members licensed and insured?', answer: 'Yes, absolutely. Every member of our team maintains current licenses and comprehensive insurance coverage. We are fully compliant with all state and federal regulations.' },
    { question: 'What areas do you serve?', answer: 'We serve the local area and surrounding communities. Contact us to learn about our service areas. We are expanding regularly to better serve our growing client base.' },
    { question: 'Can you provide references from past clients?', answer: 'We are happy to provide references from satisfied clients. Our track record speaks for itself with hundreds of successful transactions.' },
    { question: 'How are you different from other companies?', answer: 'Our combination of experience, integrity, and community focus sets us apart. We prioritize transparency, put our clients first, and have the proven results to back up our commitment.' },
  ],
  mobile_homes: [
    { question: 'Do you buy mobile homes in any condition?', answer: 'Yes! We buy mobile homes in any condition — old, damaged, in parks, on private land. Single-wide, double-wide, any year. We handle all repairs after purchase.' },
    { question: 'Do I need to own the land?', answer: 'No! We buy mobile homes whether you own the land or are in a mobile home park. We handle the title transfer and park approval if needed.' },
    { question: 'How fast can you close?', answer: 'We typically close within 14-21 days, but we can move faster if needed. We work on your timeline and make the process as smooth as possible.' },
    { question: 'Are there any fees?', answer: 'Zero fees, zero commissions. We cover all closing costs. The amount we offer is the amount you receive at closing.' },
    { question: 'What if I still owe money on my mobile home?', answer: 'We can still make an offer! We work with lien holders regularly and can often pay off your remaining balance at closing. Every situation is different, so reach out and we will evaluate yours.' },
  ],
  land: [
    { question: 'What types of land do you buy?', answer: 'We buy all types of land — vacant lots, acreage, farmland, wooded land, desert land, even landlocked parcels. No parcel is too big or too small for us to consider.' },
    { question: 'Do you buy land with back taxes?', answer: 'Yes! We regularly purchase land with tax liens or back taxes owed. We handle the tax resolution as part of the closing process.' },
    { question: 'How do you determine the offer price?', answer: 'We evaluate based on location, size, access, utilities, zoning, comparable sales, and current market conditions. Our goal is a fair offer that works for both parties.' },
    { question: 'Can you close remotely?', answer: 'Absolutely. We close land deals remotely all the time. Everything can be handled via mail, email, and wire transfer. No need to travel.' },
    { question: 'How long does closing take?', answer: 'Land closings typically take 14-30 days depending on title research. We move as quickly as possible and keep you informed every step of the way.' },
  ],
  rent_to_own: [
    { question: 'What credit score do I need?', answer: 'We work with people of all credit backgrounds. Even if your credit is not perfect, we can find a solution. We evaluate the whole picture, not just a number.' },
    { question: 'How long are the typical lease terms?', answer: 'Lease terms are typically 2-5 years, depending on what works for you. We customize the agreement so you have time to save for a down payment and improve your credit if needed.' },
    { question: 'What percentage of rent goes toward the purchase?', answer: 'Typically, 15-25% of your monthly rent payment is credited toward your eventual purchase price. The exact percentage depends on the home and your agreement.' },
    { question: 'What happens if I need to move during the lease?', answer: 'We understand life happens. There may be early termination options, or we can work with you on your specific situation.' },
    { question: 'Who is responsible for maintenance and repairs?', answer: 'As the tenant-buyer, you are responsible for standard maintenance like any other homeowner would be. We handle major structural issues covered by insurance.' },
  ],
  owner_finance: [
    { question: 'What credit score do I need for owner financing?', answer: 'There is no minimum credit score requirement. We evaluate your overall financial situation including income stability, down payment amount, and ability to make monthly payments.' },
    { question: 'How much is the down payment?', answer: 'Down payments typically range from 5-15% depending on the property and your qualifications. We work with you to find a down payment amount that fits your budget.' },
    { question: 'What are the typical interest rates?', answer: 'Interest rates for owner-financed properties are competitive with current market rates. Exact terms depend on the property, down payment, and loan structure.' },
    { question: 'Can I refinance later?', answer: 'Absolutely! Many of our buyers refinance into a traditional mortgage after 1-3 years once their credit has improved. We encourage this path to build your financial future.' },
    { question: 'What is the condition of the homes?', answer: 'All of our owner-financed homes are in move-in ready condition. We invest in making sure every property meets our quality standards before listing.' },
  ],
  note_buying: [
    { question: 'What types of notes do you buy?', answer: 'We purchase performing and non-performing mortgage notes, land contracts, trust deeds, and seller-financed notes. Both residential and commercial notes are welcome.' },
    { question: 'How do you determine the value of my note?', answer: 'We evaluate based on the remaining balance, interest rate, payment history, borrower creditworthiness, property value, and current market conditions.' },
    { question: 'Can I sell a partial note?', answer: 'Yes! You do not have to sell the entire note. We can purchase a portion of your remaining payments, allowing you to get cash now while retaining some future income.' },
    { question: 'How long does the process take?', answer: 'From initial quote to closing, the process typically takes 10-21 days. We perform due diligence on the property and borrower to ensure a smooth transaction.' },
    { question: 'Is there a minimum note balance?', answer: 'We consider notes of all sizes, but typically work with balances of $10,000 or more. Contact us with your specific note details for a quick evaluation.' },
  ],
}

/**
 * Get defaults for a given template ID.
 */
export function getTemplateDefaults(templateId: string) {
  return {
    trust_badges: defaultTrustBadges[templateId] || defaultTrustBadges.motivated_sellers,
    testimonials: defaultTestimonials[templateId] || defaultTestimonials.motivated_sellers,
    faq_items: defaultFAQs[templateId] || defaultFAQs.motivated_sellers,
  }
}
