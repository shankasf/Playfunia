# Kidz 4 Fun Digital Platform

The PlayFunia digital platform is a full-stack playground experience that brings the indoor play center online. It unifies marketing pages, party bookings, memberships, events, family accounts, and staff tooling at our Crossgates Mall location (Albany, NY). This repository contains all services, infrastructure scripts, and documentation required to run the platform locally or deploy it in the cloud.

---

## Table of Contents
1. [Solution Overview](#solution-overview)
2. [Tech Stack & Key Dependencies](#tech-stack--key-dependencies)
3. [End-to-End Architecture](#end-to-end-architecture)
4. [Repository Structure](#repository-structure)
5. [Environments & Secrets](#environments--secrets)
6. [Getting Started](#getting-started)
7. [Backend Service](#backend-service)
8. [Frontend Application](#frontend-application)
9. [Database & Seeding](#database--seeding)
10. [Authentication & Sessions](#authentication--sessions)
11. [API Reference (High Level)](#api-reference-high-level)
12. [Testing Strategy](#testing-strategy)
13. [Development Workflow](#development-workflow)
14. [Deployment Considerations](#deployment-considerations)
15. [Roadmap & Next Steps](#roadmap--next-steps)

---

## Solution Overview
**Business goal**: Digitally extend the Kidz 4 Fun brand by providing guardians with an intuitive way to explore facilities, reserve parties, purchase play passes, RSVP for events, and manage family profiles. Staff members manage bookings, memberships, waivers, and content via secure APIs.

**Core capabilities**
- **Marketing Microsite**: Responsive, themed landing pages for admissions, memberships, parties, events, testimonials, FAQs, and contact information.
- **Account & Authentication**: Guardian registration, login, JWT-based sessions, and stored membership data.
- **Booking Engine**: Endpoints for party reservations, schedule availability, price estimates, cancellation, and admin status updates. Uses industry-standard cart-based checkout.
- **Payment Processing**: Integrated Square payment gateway with full payment model (no deposits), idempotent transactions, and pre-validation of availability before charging.
- **Email Service**: OTP verification and booking confirmation emails via integrated email service.
- **Content Services**: CMS-like APIs for FAQs, announcements, testimonials, and front-page highlights.
- **Data Integration**: Supabase (PostgreSQL) for users, children, memberships, packages, bookings, events, waivers, testimonials, FAQs, announcements, and content. Dynamic pricing fetched from database.
- **Virtual Concierge Chatbot**: React widget + FastAPI service backed by OpenAI and local ChromaDB RAG, guiding families with up-to-date facility info. Enhanced UI with markdown support and typing indicators.
- **Admin Dashboard**: Comprehensive admin panel for managing bookings, users, and system settings with role-based access control.
- **Infrastructure**: Docker Compose orchestrations, environment templates, and seeding scripts for realistic data.

---

## Tech Stack & Key Dependencies
- **Frontend**: React 19, TypeScript, React Router v6, CSS Modules, custom hooks.
- **Backend**: Node.js 20+, Express 5, TypeScript, Zod validation, JWT, bcrypt, Pino logging.
- **Database**: Supabase (PostgreSQL).
- **Chatbot Assistant**: Python 3.10+, FastAPI, Uvicorn, Chromadb persistent store, OpenAI `gpt-4o-mini` + `text-embedding-3-small`.
- **Tooling**: Nodemon, ts-node-dev, ESLint, Prettier, Husky (planned), dotenv, concurrently, Docker Compose.

---

## End-to-End Architecture
```
┌────────────────────────────────────────────┐
│                 Browser UI                 │
│  React + TypeScript + Router + Context     │
└───────▲───────────────────────────────┬────┘
        │  HTTPS/REST (fetch)           │
        │  JWT Bearer token             │
┌───────┴──────────────────────────┐    │
│       Express API (backend)      │◄───┘
│  • Auth, bookings, memberships   │
│  • Content, testimonials, FAQ    │
│  • Admin routes + middleware     │
└───────▲──────────────────────────┘
        │  Supabase Client          │
        │                            │
┌───────┴──────────────────────────┐
│       Supabase (PostgreSQL)      │
│  • Users / Children / Waivers    │
│  • Memberships / Packages        │
│  • Bookings / Events / Tickets   │
│  • Content (FAQ, testimonials)   │
└──────────────────────────────────┘

FastAPI Chatbot (Python) runs alongside frontend/backend, enriches answers with Chroma RAG, and calls OpenAI completions.
```

---

## Repository Structure
```
.
├── backend/
│   ├── src/
│   │   ├── app.ts              # Express app factory (CORS, logging, routes)
│   │   ├── index.ts            # Bootstrap, DB connect, server listen with error handling
│   │   ├── config/             # env loader (dotenv + zod) and Supabase connection
│   │   ├── controllers/        # REST controllers (auth, bookings, users, waivers, content, events)
│   │   ├── middleware/         # authGuard, role checks, request logging
│   │   ├── models/             # Database models (User, Child, Booking, Membership, etc.)
│   │   ├── routes/             # Route composition modules
│   │   ├── schemas/            # Zod validation definitions
│   │   ├── services/           # Business logic (auth, booking, content, party packages, refunds, reconciliation)
│   │   └── utils/              # Async handler, password hashing, JWT helpers, logging, currency, retry
│   ├── scripts/seed.ts         # Database seed script for demo data
│   ├── Dockerfile              # Development Dockerfile
│   ├── package.json, tsconfig  # Backend configuration
│   └── .env / .env.example     # Environment variables
│
├── frontend/
│   ├── public/                 # Static assets and CRA entry point
│   ├── src/
│   │   ├── api/                # Fetch helper with auth token support
│   │   ├── assets/             # Image/font placeholders
│   │   ├── components/         # Layout, common buttons, home sections
│   │   ├── context/            # AuthContext for JWT session storage
│   │   ├── data/               # Sample data fallback mirroring backend content
│   │   ├── hooks/              # useHomeContent (fetch + sample fallback)
│   │   ├── pages/              # Routed pages (Home, Memberships, Parties, Events, Testimonials, FAQ, Contact, Account)
│   │   ├── styles/             # Global CSS variables/theme + module styles
│   │   └── App.tsx, index.tsx  # Router setup and bootstrap
│   ├── package.json            # CRA config
│   └── start-dev.bat           # Launch script for frontend + backend
│
├── chatbot_service/            # FastAPI chatbot with OpenAI + ChromaDB RAG
├── docker/                     # Docker Compose/environment configs
├── docs/                       # Additional documentation (future design docs)
├── kidz4fun.txt                # Source-of-truth business information (locations, pricing, policies)
├── start-dev.bat               # Root helper to start backend/frontend in separate windows
└── README.md                   # Project documentation (you are here)
```

---

## Environments & Secrets

All services use a **single `.env` file in the project root**. This centralized approach ensures consistency across all services.

```
Playfunia/
├── .env                 ← Single source of truth for all services
├── .env.example         ← Template with all required variables
├── backend/            (loads from ../.env)
├── frontend/           (uses REACT_APP_* variables)
└── chatbot_service/    (loads from ../.env)
```

### Required Environment Variables

| Category | Variable | Description |
|----------|----------|-------------|
| **Supabase** | `SUPABASE_URL` | Supabase project URL |
| | `SUPABASE_ANON_KEY` | Supabase anonymous key (frontend) |
| | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (backend) |
| **Backend** | `JWT_SECRET` | Secret for JWT signing |
| | `PORT` | Backend server port (default: 5000) |
| | `FRONTEND_URL` | Frontend URL for CORS |
| **Frontend** | `REACT_APP_API_URL` | Backend API URL |
| | `REACT_APP_SUPABASE_URL` | Supabase URL for auth |
| | `REACT_APP_SUPABASE_ANON_KEY` | Supabase anon key for auth |
| | `REACT_APP_CHATBOT_URL` | Chatbot service base URL |
| **Payments** | `SQUARE_ACCESS_TOKEN` | Square API access token |
| | `SQUARE_APPLICATION_ID` | Square application ID |
| | `SQUARE_LOCATION_ID` | Square location ID |
| | `SQUARE_ENVIRONMENT` | `sandbox` or `production` |
| **Chatbot** | `OPENAI_API_KEY` | OpenAI API key |
| | `OPENAI_MODEL` | Model to use (default: gpt-4o-mini) |

### Setup

1. Copy the template: `cp .env.example .env`
2. Fill in your values (get Supabase keys from your project dashboard)
3. For Google OAuth, configure it in Supabase Dashboard → Authentication → Providers → Google

The repo includes `.env.example` templates. Never commit production credentials. Use secret managers (e.g., Azure Key Vault, AWS Secrets Manager) for deployments.

---

## Getting Started

### Prerequisites
- Node.js ≥ 20, npm ≥ 10
- Python 3.12+ (for chatbot service)
- Supabase account
- Git

### Installation

1. **Clone & install dependencies**:
   ```bash
   git clone <repo-url>
   cd Playfunia
   npm install --prefix backend
   npm install --prefix frontend
   ```

2. **Configure environment** (single .env file in project root):
   ```bash
   cp .env.example .env
   # Edit .env with your Supabase credentials, JWT secret, etc.
   ```

3. **Set up chatbot** (optional):
   ```bash
   cd chatbot_service
   python -m venv venv
   source venv/bin/activate  # or venv\Scripts\activate on Windows
   pip install -r requirements.txt
   ```

4. **Populate sample data**:
   ```bash
   npm run seed --prefix backend
   ```
   This imports memberships, packages, events, testimonials, etc. Set `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` in `.env` for admin access.

5. **Run locally**:
   ```bash
   # Option 1: Using Docker Compose (recommended)
   cd docker && docker-compose up

   # Option 2: Manual
   npm run dev --prefix backend    # Terminal 1
   npm start --prefix frontend     # Terminal 2
   cd chatbot_service && uvicorn main:app --reload  # Terminal 3 (optional)
   ```

6. **Access**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5001/api/health
   - Chatbot: http://localhost:8000

---

## Backend Service
- **Entry**: `src/index.ts` – loads env, connects to Supabase, instantiates Express, logs port conflicts.
- **Express Stack**: JSON body parser, CORS (configurable origins), Pino HTTP logger.
- **Routing** (`src/routes/index.ts`)
  - `/api/health`
  - `/api/auth` (register, login)
  - `/api/users` (profile `GET /me`)
  - `/api/bookings` (create, list, cancel, availability, estimate, admin status updates)
  - `/api/party-packages`
  - `/api/memberships`
  - `/api/events`
  - `/api/content` (FAQs, testimonials, announcements) – public GET + admin-protected POST/PUT.
  - `/api/waivers` (sign/list) – guardian-protected.
- **Auth**: Zod-validated DTOs, bcrypt password hashing, JWT signing/verification, `authGuard` + `requireRoles` middleware.
- **Services**: Booking availability conflict detection (Luxon), price estimation with overage fees, email uniqueness, membership assignment, waiver upsert.
- **Logging**: Pino logger with pretty transport in development.

---

## Frontend Application
- **State Management**: Lightweight hooks and context. `AuthContext` handles JWT storage, profile refresh, and route greeting.
- **Routing**: SPA with nested layout `Layout.tsx` + `Outlet`; pages for home, memberships, parties, events, testimonials, FAQ, contact, and account.
- **Design System**: CSS variables for Kidz 4 Fun palette, reusable `PrimaryButton`, global typography via Google Fonts.
- **Content Hooks**: `useHomeContent` fetches data from backend; automatically falls back to `sampleData.ts` derived from `kidz4fun.txt` so the site remains populated offline.
- **Account Page**: Login/registration forms calling backend; post-auth greeting, membership display, logout.
- **Navigation**: Header with responsive menu, route-aware active states, account button updated after login.

---

## Database & Seeding
- **Supabase Tables**: Users, Children, Memberships, PartyPackages, Bookings, Events, Tickets, Waivers, FAQs, Testimonials, Announcements.
- **Seed Script** (`npm run seed --prefix backend`): Resets tables, inserts guardian, child profiles, memberships, packages, events, testimonials, FAQs, announcements, and sample bookings.
- **Data Sources**: The seed data and frontend fallback derive from `kidz4fun.txt` to keep website content synced with marketing facts.

---

## Authentication & Sessions

Authentication is handled by **Supabase Auth** with the following features:

- **Email/Password**: Traditional signup and login
- **Magic Link**: Passwordless email login
- **Google OAuth**: Social login (requires configuration in Supabase Dashboard)
- **Password Reset**: Email-based password recovery

### Configuration

1. Set Supabase credentials in `.env`:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   REACT_APP_SUPABASE_URL=https://your-project.supabase.co
   REACT_APP_SUPABASE_ANON_KEY=your-anon-key
   ```

2. For Google OAuth:
   - Go to Supabase Dashboard → Authentication → Providers → Google
   - Add your Google Client ID and Secret
   - Add redirect URI to Google Cloud Console: `https://your-project.supabase.co/auth/v1/callback`

### How It Works
- **Frontend**: Uses `@supabase/supabase-js` for auth, stores session in localStorage
- **Backend**: Validates Supabase JWT tokens, syncs user profiles to local database
- **Protected Routes**: `authGuard` middleware validates tokens, `requireRoles` checks user roles

---

## API Reference (High Level)
> Detailed OpenAPI spec is a planned enhancement. Below is a summary of major endpoints:

| Method | Path                              | Description                                            |
|--------|-----------------------------------|--------------------------------------------------------|
| GET    | `/api/health`                     | Service health check                                   |
| POST   | `/api/auth/register`              | Create guardian account, returns `{ user, token }`     |
| POST   | `/api/auth/login`                 | Authenticate, returns `{ user, token }`                |
| GET    | `/api/users/me`                   | Fetch authenticated guardian profile                   |
| POST   | `/api/bookings`                   | Create booking for guardian                            |
| GET    | `/api/bookings`                   | List guardian bookings                                 |
| POST   | `/api/bookings/availability`      | Check slot availability                                |
| POST   | `/api/bookings/estimate`          | Estimate booking cost                                  |
| PATCH  | `/api/bookings/:id/cancel`        | Cancel guardian booking                                |
| GET    | `/api/bookings/admin`             | Admin list of all bookings                             |
| PATCH  | `/api/bookings/:id/status`        | Admin status update                                    |
| GET    | `/api/memberships`                | Public memberships list                                |
| GET    | `/api/party-packages`             | Public party packages list                             |
| GET    | `/api/events`                     | Public events list                                     |
| GET    | `/api/content/faqs`               | Public FAQs                                            |
| POST   | `/api/content/faqs`               | Admin create FAQ                                       |
| PUT    | `/api/content/faqs/:id`           | Admin update FAQ                                       |
| ...    | (Similar for testimonials/ann.)   |                                                        |
| POST   | `/api/waivers`                    | Guardian signs waiver                                  |
| GET    | `/api/waivers`                    | Guardian lists signed waivers                          |
| GET    | `/api/admin/users`                | Admin list all users                                   |
| POST   | `/api/admin/users`                | Admin create new user                                  |
| PUT    | `/api/admin/users/:id`            | Admin update user                                      |
| DELETE | `/api/admin/users/:id`            | Admin delete user                                      |
| POST   | `/api/chatbot/message`            | Send message to AI chatbot                             |
| POST   | `/api/refunds`                    | Admin: Create refund for a payment                     |
| GET    | `/api/refunds/:id`                | Admin: Get refund status                               |
| GET    | `/api/refunds/payment/:paymentId` | Admin: List refunds for a payment                      |
| GET    | `/api/refunds`                    | Admin: List all refunds with pagination                |
| POST   | `/api/admin/reconciliation/run`   | Admin: Manually trigger event reconciliation           |
| GET    | `/api/admin/reconciliation/status`| Admin: Check reconciliation scheduler status           |

---

## Testing Strategy
- **Current**: Manual QA via seeded data, API testing with Postman/Thunder Client, React manual flows.
- **Planned**:
  - Backend: Jest + Supertest for controllers/services, Mongoose memory server for isolation.
  - Frontend: React Testing Library + MSW for API mocks, Cypress for end-to-end flows.
  - Lint/format hooks (Husky) to enforce standards before commit.

---

## Development Workflow
1. Create feature branch (`git checkout -b feature/...`).
2. Update `.env` as needed; leverage `npm run seed --prefix backend` to reset data.
3. Run `./start-dev.bat` to launch both services.
4. Code changes – ensure ESLint/Prettier compliance (`npm run lint --prefix frontend`, `npm run lint --prefix backend`).
5. Add/adjust tests (planned).
6. Submit PR with summary, testing evidence, screenshots/gifs.

---

## Deployment Considerations
- **Hosting**: Containerize via Docker Compose or deploy separately (e.g., Vercel for frontend + Render/Heroku for backend).
- **Database**: Supabase hosted PostgreSQL with Row Level Security (RLS) enabled. Consider regional deployment if the two locations require low latency.
- **Secrets**: Use environment-specific vaults; never bake secrets into images.
- **CI/CD**: GitHub Actions for lint/test/build; automated deploy to staging/production on approved PRs.
- **Monitoring**: Pino logs aggregated via ELK/Datadog; health checks via `/api/health`.
- **Scaling**: Stateless backend allows horizontal scaling. Use Redis (future) for rate limiting or session caching if necessary.

---

## Performance Optimizations

The platform includes several performance optimizations for fast page loads and responsive user experience:

### Client-Side Caching (SWR)
- **SWR Library**: Implements stale-while-revalidate pattern for instant page refreshes
- **Global Configuration**: Centralized SWR config with automatic revalidation on focus/reconnect
- **Cached Endpoints**: Home content, memberships, party packages, events, FAQs, testimonials, Instagram feed
- **Fallback Data**: Sample data displayed while fetching, ensuring content is always visible

### Backend Performance
- **HTTP Cache Headers**: Public endpoints cached with `Cache-Control` (60s-5min based on content type)
- **gzip Compression**: Enabled globally for all API responses
- **Parallel Queries**: `Promise.all()` used extensively for concurrent database operations
- **Connection Pooling**: Supabase client with optimized connection handling

### Database Optimizations
- **Comprehensive Indexes**: 32+ indexes on critical query paths (users, memberships, bookings, events, waivers)
- **Query Limits**: All list queries bounded to prevent unbounded fetches
- **Optimized Joins**: Selective column fetching to reduce payload sizes

### Expected Performance
| Action | Performance |
|--------|-------------|
| Page refresh | Instant (cached data shown immediately) |
| Initial load | < 500ms (parallel fetches) |
| API responses | < 100ms (indexed queries + caching) |

---

## Industry-Standard E-commerce Checkout Pipeline

The platform implements a **market-standard checkout flow** following best practices used by major e-commerce companies:

### Checkout Flow (6 Phases)

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: PRE-VALIDATION (Before Payment)                       │
│  • Verify package/membership exists and is active               │
│  • Check slot availability (prevents double-booking)            │
│  • Return HTTP 409 Conflict for unavailable slots               │
├─────────────────────────────────────────────────────────────────┤
│  PHASE 2: CREATE ORDER                                          │
│  • Create order record with status "Pending"                    │
│  • Generate idempotency key (order_id + sourceId)               │
├─────────────────────────────────────────────────────────────────┤
│  PHASE 3: PROCESS PAYMENT                                       │
│  • Charge payment with idempotency key                          │
│  • On failure: Update order to "Failed" status                  │
│  • On success: Record payment in database                       │
├─────────────────────────────────────────────────────────────────┤
│  PHASE 4: FULFILL ITEMS                                         │
│  • Update order status to "Processing"                          │
│  • Create tickets/memberships/bookings                          │
│  • Track fulfillment errors per item (no abort on single fail)  │
├─────────────────────────────────────────────────────────────────┤
│  PHASE 5: UPDATE ORDER STATUS                                   │
│  • "Completed" - all items fulfilled                            │
│  • "Partial" - some items had fulfillment errors                │
├─────────────────────────────────────────────────────────────────┤
│  PHASE 6: SEND NOTIFICATIONS (Async)                            │
│  • Fire-and-forget pattern (non-blocking)                       │
│  • Customer sees confirmation immediately                       │
│  • Email/SMS sent in background                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Cart-Based Checkout

All purchases follow the **standard e-commerce cart pattern**:

| Action | Behavior |
|--------|----------|
| Add to Cart | Frontend only (localStorage) - NO database record |
| Checkout | Database record created AFTER successful payment |
| Party Bookings | Only appear in admin list after payment confirmed |

### Payment Model

**Full payment required** for all purchase types:
- Tickets: Full amount at checkout
- Memberships: Full amount at checkout
- Party Bookings: Full amount at checkout (no deposits)

### PDF Receipts

PDF receipts are generated for all purchase types:
- **Tickets**: Order receipt with ticket codes
- **Memberships**: Membership activation receipt
- **Party Bookings**: Booking confirmation with package details

Receipts are:
- Attached to confirmation emails
- Stored in database with verification hash
- Include unique receipt numbers (TR-, MR-, BR- prefixes)

---

## Square Payment Production Features

The platform includes production-ready Square payment features for reliability and security:

### Refund Processing API

Full refund flow via Square Refunds API:

| Feature | Description |
|---------|-------------|
| **Validation** | Checks payment is COMPLETED, within 1 year, under 20 refund limit |
| **Idempotency** | Deterministic keys prevent duplicate refunds |
| **Partial Refunds** | Support for partial amount refunds |
| **Status Tracking** | pending → processing → completed/failed/rejected |
| **External Sync** | Refunds made via Square Dashboard are synced via webhooks |

**API Endpoints (Admin only):**
```
POST   /api/refunds                    - Create refund
GET    /api/refunds/:id                - Get refund by ID
GET    /api/refunds/payment/:paymentId - List refunds for a payment
GET    /api/refunds?status=completed   - List with filters
```

### Duplicate Payment Prevention

Frontend protections against double-charging:

- **Ref-based blocking**: Synchronous guard prevents concurrent submissions
- **Double-guard pattern**: Both React state and ref for reliability
- **Error recovery**: Re-enables button on payment errors for retry
- **Accessibility**: `aria-busy` and `aria-disabled` attributes

### Webhook Event Reconciliation

Automated recovery of missed webhook events:

| Feature | Description |
|---------|-------------|
| **Square Events API** | Fetches events within 28-day window |
| **Deduplication** | Compares against webhook_events table |
| **Auto-processing** | Missed events processed through normal flow |
| **Hourly scheduler** | Runs automatically in production |
| **Manual trigger** | Admin endpoint for on-demand reconciliation |

**Admin Endpoints:**
```
POST /api/admin/reconciliation/run?hours=24  - Manual trigger
GET  /api/admin/reconciliation/status        - Scheduler status
```

---

## Roadmap & Next Steps
**Completed:**
- ✅ Chatbot FastAPI service integrated with enhanced UI (markdown support, typing indicators)
- ✅ Square payment integration for secure checkout
- ✅ Email service for OTP verification and booking confirmations
- ✅ Admin dashboard with user management and booking controls
- ✅ Dynamic pricing fetched from Supabase database
- ✅ SWR caching for instant page refreshes and improved UX
- ✅ Database indexes for optimized query performance
- ✅ **Industry-standard e-commerce checkout pipeline**
- ✅ **Full payment model (no deposits) for all purchase types**
- ✅ **Pre-validation of slot availability before payment**
- ✅ **Async (non-blocking) email/SMS notifications**
- ✅ **PDF receipts for all purchase types (tickets, memberships, bookings)**
- ✅ **Cart-based checkout (database records created only after payment)**
- ✅ **Idempotent payment processing to prevent duplicates**
- ✅ **Graceful partial fulfillment handling**
- ✅ **Refund Processing API** - Full refund flow via Square Refunds API with validation and idempotency
- ✅ **Duplicate Payment Prevention** - Ref-based frontend guards against double-submit
- ✅ **Webhook Event Reconciliation** - Automated recovery of missed webhook events

**In Progress:**
- Implement guardian portal features (child management, waiver uploads, loyalty points)
- Add automated tests and CI pipelines
- Implement i18n for multilingual support (EN/ES)
- Enhance accessibility (WCAG 2.1) evaluations and keyboard navigation
- Add analytics and reporting features to admin dashboard

For any questions, consult `kidz4fun.txt` for business context or reach out to the engineering team. Happy hacking!

