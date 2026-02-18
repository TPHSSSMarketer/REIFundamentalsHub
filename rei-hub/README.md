# REI Fundamentals Hub

A CRM dashboard built for real estate investors. Provides an intuitive interface for managing contacts, deals, communication, and content generation.

## Features

### Dashboard Home
- Key metrics displayed in cards (Total Opportunities, Active Deals, Closed This Month, Pending Tasks)
- Pipeline value summary
- Recent activity feed
- Quick action buttons for common tasks

### Pipeline View (Kanban)
- Visual pipeline with configurable stages
- Drag-and-drop deals between stages
- Deal cards showing title, value, contact name
- Click to view deal details
- Real-time pipeline value calculations

### Contact Management
- List all contacts with search/filter
- Add new contacts with essential fields (name, phone, email, tags)
- View contact details and associated deals
- Quick SMS/email actions from contact cards

### AssistantHub
- **Voice Agents** - Manage AI voice agents for automated calls
- **SMS** - Compose and send SMS messages to contacts
- **Email** - Compose and send emails to contacts

### ContentHub
- **Social Posts** - Generate social media marketing content
- **Website Posts** - Generate website landing page content and blog posts
- AI-powered content generation with templates

### Quick Actions
- **New Opportunity** - Create deals quickly
- **Add Contact** - Add new contacts
- **Send SMS** - Quick SMS composer

## Tech Stack

- **Frontend**: React 18 + Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Data Fetching**: React Query (TanStack Query)
- **Drag & Drop**: @dnd-kit
- **Routing**: React Router v6
- **HTTP Client**: Axios

## Getting Started

### Prerequisites
- Node.js 18+
- CRM API access

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
cp .env.example .env
```

4. Configure your `.env`:
```env
VITE_API_KEY=your_api_key
VITE_API_LOCATION_ID=your_location_id
VITE_API_BASE_URL=https://services.leadconnectorhq.com
VITE_API_VERSION=2021-07-28
```

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
src/
├── components/
│   ├── Dashboard/       # Dashboard view components
│   ├── Pipeline/        # Pipeline/Kanban view
│   ├── Contacts/        # Contact management
│   ├── AssistantHub/    # Voice agents, SMS, and email
│   ├── ContentHub/      # Social media and website content generation
│   ├── Settings/        # Settings page
│   └── Common/          # Shared components (Layout, Modals, etc.)
├── services/
│   ├── api.ts           # CRM API wrapper
│   ├── api-extended.ts  # Extended API service
│   └── auth.ts          # Authentication utilities
├── hooks/
│   ├── useApi.ts        # React Query hooks for API data
│   ├── useStore.ts      # Zustand store
│   └── useDemoMode.ts   # Demo mode toggle
├── utils/
│   └── helpers.ts       # Utility functions
├── data/
│   └── mockData.ts      # Mock data for demo mode
├── types/
│   └── index.ts         # TypeScript type definitions
├── App.tsx              # Main app with routing
├── main.tsx             # Entry point
└── index.css            # Global styles
```

## Routes

| Path | Description |
|------|-------------|
| `/dashboard` | Main dashboard with KPIs and activity feed |
| `/pipeline` | Kanban-style deal pipeline |
| `/contacts` | Contact list and management |
| `/assistanthub` | Voice agents, SMS, and email communications |
| `/contenthub` | Social media and website content generation |
| `/settings` | API configuration settings |

## API Endpoints Used

- `GET /locations` - Get locations
- `GET /opportunities/pipelines` - Get pipelines
- `GET /opportunities/search` - Get deals
- `POST /opportunities` - Create deal
- `PUT /opportunities/{dealId}` - Update deal
- `GET /contacts` - Get contacts
- `POST /contacts` - Create contact
- `PUT /contacts/{contactId}` - Update contact
- `POST /conversations/messages` - Send SMS/Email

## Development

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linting
npm run lint
```

## Phase 2 Enhancements (Future)

- [ ] AssistantHub voice agent calling integration
- [ ] ContentHub AI integration
- [ ] Custom pipeline stage editor
- [ ] Reporting/analytics views
- [ ] Email automation triggers
- [ ] Calendar sync

## License

This project is licensed under the MIT License.
