# REI Fundamentals Hub - GHL Dashboard Wrapper

A simplified React-based dashboard wrapper for GoHighLevel (GHL) designed for REI Fundamentals Hub. This app provides an intuitive interface that hides GHL's complexity while exposing only the features needed for real estate investing business.

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

### Quick Actions
- **New Opportunity** - Create deals quickly
- **Add Contact** - Add new contacts
- **Send SMS** - Quick SMS composer
- **Track Package** - USPS Tracking integration
- **Launch Voice Agent** - VoiceHub integration
- **Create Content** - ContentHub integration

## Tech Stack

- **Frontend**: React 18 + Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Data Fetching**: React Query (TanStack Query)
- **Drag & Drop**: @dnd-kit
- **Routing**: React Router v6
- **API**: Axios to GHL REST API

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
cp .env.example .env
```

4. Configure your `.env`:
```env
VITE_GHL_API_KEY=your_gohighlevel_api_key
VITE_GHL_LOCATION_ID=your_location_id
VITE_GHL_API_BASE_URL=https://services.leadconnectorhq.com
VITE_GHL_API_VERSION=2021-07-28
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
│   ├── Integrations/    # USPS, VoiceHub, ContentHub links
│   ├── Settings/        # Settings page
│   └── Common/          # Shared components (Layout, Modals, etc.)
├── services/
│   ├── ghl.ts          # GHL API wrapper
│   └── auth.ts         # Authentication utilities
├── hooks/
│   ├── useGHL.ts       # React Query hooks for GHL data
│   └── useStore.ts     # Zustand store
├── utils/
│   └── helpers.ts      # Utility functions
├── types/
│   └── index.ts        # TypeScript type definitions
├── App.tsx             # Main app with routing
├── main.tsx            # Entry point
└── index.css           # Global styles
```

## Routes

| Path | Description |
|------|-------------|
| `/dashboard` | Main dashboard with KPIs and activity feed |
| `/pipeline` | Kanban-style deal pipeline |
| `/contacts` | Contact list and management |
| `/integrations` | Third-party integration links |
| `/settings` | API configuration settings |

## GHL API Endpoints Used

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

## Deployment

The app can be deployed to any static hosting platform:

### Vercel
```bash
npm run build
# Deploy dist/ folder
```

### Netlify
```bash
npm run build
# Deploy dist/ folder with _redirects for SPA
```

## Phase 2 Enhancements (Future)

- [ ] USPS Tracking module integration
- [ ] VoiceHub launch functionality
- [ ] ContentHub AI integration
- [ ] Custom pipeline stage editor
- [ ] Reporting/analytics views
- [ ] Email automation triggers
- [ ] Zapier integration
- [ ] Google Calendar sync

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting a PR.

## License

This project is licensed under the MIT License.
