# REI Hub - Real Estate Investor CRM Dashboard

A user-friendly GoHighLevel CRM wrapper built specifically for real estate investors. This application simplifies the most powerful GHL features into an easy-to-use dashboard.

## Features

### Lead Management
- Track and manage all your real estate leads
- Filter by status, source, and motivation level
- Quick actions: call, text, email directly from the interface
- Import/export functionality

### Deal Pipeline
- Visual Kanban-style deal tracking
- Drag-and-drop deals between stages
- Track ARV, repair costs, and potential profit
- Real-time pipeline value calculations

### Marketing Hub
- Manage SMS, email, and direct mail campaigns
- Track campaign performance and ROI
- Quick send functionality for one-off messages
- Campaign analytics dashboard

### AI Content Creator
- Generate marketing content with AI
- Create SMS, emails, direct mail, social posts, and scripts
- Customize tone and target audience
- Save templates for reuse

### Support System
- Submit support tickets for customization requests
- Track ticket status and history
- Priority-based support queue

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand + React Query
- **Authentication**: NextAuth.js
- **API**: GoHighLevel REST API

## Getting Started

### Prerequisites
- Node.js 18+
- GoHighLevel account with API access

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-repo/rei-fundamentals-hub.git
cd rei-fundamentals-hub
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Configure your `.env.local`:
```env
GHL_API_KEY=your_gohighlevel_api_key
GHL_LOCATION_ID=your_location_id
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret
OPENAI_API_KEY=your_openai_api_key  # Optional, for AI content
```

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000)

### Demo Credentials
- Email: `demo@reihub.com`
- Password: `demo123`

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   ├── dashboard/         # Dashboard pages
│   └── login/             # Authentication
├── components/            # React components
│   ├── dashboard/         # Dashboard-specific components
│   ├── layout/            # Layout components
│   ├── leads/             # Lead management components
│   └── ui/                # Reusable UI components
├── lib/                   # Utility functions
├── services/              # API services (GHL integration)
└── types/                 # TypeScript type definitions
```

## Key Pages

| Path | Description |
|------|-------------|
| `/` | Landing page |
| `/login` | Authentication |
| `/dashboard` | Main dashboard with KPIs |
| `/dashboard/leads` | Lead management |
| `/dashboard/pipeline` | Deal pipeline (Kanban) |
| `/dashboard/marketing` | Marketing campaigns |
| `/dashboard/content` | AI content creator |
| `/dashboard/support` | Support tickets |
| `/dashboard/settings` | Account settings |

## GoHighLevel Integration

This app integrates with the following GHL endpoints:
- Contacts (leads)
- Opportunities (deals)
- Pipelines
- Campaigns
- Conversations (messaging)
- Calendars
- Workflows

## Customization

Need changes? Use the built-in support ticket system to request:
- Custom fields
- New pipeline stages
- Additional integrations
- UI/UX modifications
- Workflow automations

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting a PR.

## License

This project is licensed under the MIT License.
