# Kidz 4 Fun Digital Platform

The Kidz 4 Fun digital platform is a full MERN-stack playground experience that brings the indoor play center online. It unifies marketing pages, party bookings, memberships, events, family accounts, and staff tooling across two physical locations (Poughkeepsie, NY and Deptford, NJ). This repository contains all services, infrastructure scripts, and documentation required to run the platform locally or deploy it in the cloud.

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
- **Booking Engine**: Endpoints for party reservations, schedule availability, price estimates, cancellation, admin status updates.
- **Content Services**: CMS-like APIs for FAQs, announcements, testimonials, and front-page highlights.
- **Data Integration**: MongoDB schemas for users, children, memberships, packages, bookings, events, waivers, testimonials, FAQs, announcements, and content.
- **Virtual Concierge Chatbot**: React widget + FastAPI service backed by OpenAI and local ChromaDB RAG, guiding families with up-to-date facility info.
- **Infrastructure**: Docker Compose orchestrations, environment templates, and seeding scripts for realistic data.

---

## Tech Stack & Key Dependencies
- **Frontend**: React 19, TypeScript, React Router v6, CSS Modules, custom hooks.
- **Backend**: Node.js 20+, Express 5, TypeScript, Mongoose 8, Zod validation, JWT, bcrypt, Pino logging.
- **Database**: MongoDB 7 (Atlas or self-hosted).
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
        │  Mongoose ODM             │
        │                            │
┌───────┴──────────────────────────┐
│          MongoDB Atlas           │
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
│   │   ├── config/             # env loader (dotenv + zod) and mongoose connection
│   │   ├── controllers/        # REST controllers (auth, bookings, users, waivers, content, events)
│   │   ├── middleware/         # authGuard, role checks, request logging
│   │   ├── models/             # Mongoose schemas (User, Child, Booking, Membership, etc.)
│   │   ├── routes/             # Route composition modules
│   │   ├── schemas/            # Zod validation definitions
│   │   ├── services/           # Business logic (auth, booking, content, party packages)
│   │   └── utils/              # Async handler, password hashing, JWT helpers, logging
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
├── chatbot/                    # FastAPI skeleton (future virtual concierge)
├── docker/                     # Docker Compose/environment configs
├── docs/                       # Additional documentation (future design docs)
├── kidz4fun.txt                # Source-of-truth business information (locations, pricing, policies)
├── start-dev.bat               # Root helper to start backend/frontend in separate windows
└── README.md                   # Project documentation (you are here)
```

---

## Environments & Secrets
| Service   | File                    | Variables                                                                                             |
|-----------|------------------------|--------------------------------------------------------------------------------------------------------|
| Backend   | `backend/.env`         | `NODE_ENV`, `PORT`, `MONGO_URL`, `JWT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `FRONTEND_URL`, `CORS_ORIGIN`, `DEFAULT_ADMIN_EMAIL`, `DEFAULT_ADMIN_PASSWORD` |
| Frontend  | `frontend/.env` (opt.) | `REACT_APP_API_URL` (defaults to `http://localhost:5000/api`), `REACT_APP_STRIPE_PUBLISHABLE_KEY`    |
| Chatbot   | `chatbot/.env` (future)| `OPENAI_API_KEY`, `BACKEND_BASE_URL`, etc.                                                            |

The repo includes `.env.example` templates. Never commit production credentials. Use secret managers (e.g., Azure Key Vault, AWS Secrets Manager) for deployments.

---

## Getting Started
1. **Prerequisites**: Node.js ≥ 20, npm ≥ 10, Python 3.12+, MongoDB local instance or Atlas cluster, PowerShell 5+ (Windows), Git.
2. **Clone & install**:
   ```bash
   git clone <repo-url>
   cd Kidz4Fun
   npm install --prefix backend
   npm install --prefix frontend
   python -m venv chatbot/.venv && chatbot/.venv/Scripts/activate && pip install -r chatbot/requirements.txt  # optional
   ```
3. **Configure environment**: Copy `.env.example` to `.env` in each service; populate Mongo URL, JWT secret, etc.
4. **Populate sample data**: `npm run seed --prefix backend` (imports memberships, packages, events, testimonials, etc.). Optionally define `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` in `backend/.env`; the backend will upsert this account with admin + staff roles on startup so you have credentials ready for the dashboard.
5. **Run locally**:
   - Quick start: `./start-dev.bat` (opens backend and frontend servers in separate terminals).
   - Manual: `npm run dev --prefix backend` and `npm start --prefix frontend`.
6. **Access**: Visit `http://localhost:3000` (frontend). Backend health check at `http://localhost:5000/api/health`.

---

## Backend Service
- **Entry**: `src/index.ts` – loads env, connects Mongo, instantiates Express, logs port conflicts.
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
- **MongoDB Collections**: Users, Children, Memberships, PartyPackages, Bookings, Events, Tickets, Waivers, FAQs, Testimonials, Announcements.
- **Seed Script** (`npm run seed --prefix backend`): Resets collections, inserts guardian, child profiles, memberships, packages, events, testimonials, FAQs, announcements, and sample bookings.
- **Data Sources**: The seed data and frontend fallback derive from `kidz4fun.txt` to keep website content synced with marketing facts.

---

## Authentication & Sessions
- **JWT Secret**: Configured via `backend/.env` (`JWT_SECRET`).
- **Storage**: Frontend stores token in `localStorage` under `kidz4fun_token`, attaches to API calls via `api/client.ts` helper.
- **Protected Routes**: `authGuard` ensures `/api/bookings`, `/api/waivers`, `/api/users/me` require valid tokens. `requireRoles('admin','staff')` protects admin operations (e.g., `/api/bookings/admin`).

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
- **Database**: MongoDB Atlas cluster with IP allow-list and TLS. Consider multi-region if the two locations require low latency.
- **Secrets**: Use environment-specific vaults; never bake secrets into images.
- **CI/CD**: GitHub Actions for lint/test/build; automated deploy to staging/production on approved PRs.
- **Monitoring**: Pino logs aggregated via ELK/Datadog; health checks via `/api/health`.
- **Scaling**: Stateless backend allows horizontal scaling. Use Redis (future) for rate limiting or session caching if necessary.

---

## Roadmap & Next Steps
- Hook chatbot FastAPI service to backend for concierge assistance.
- Finalize Stripe onboarding for production keys and extend deposit handling to membership payments.
- Implement guardian portal features (child management, waiver uploads, loyalty points).
- Build admin dashboard UI (analytics, booking calendar, content editor).
- Add automated tests and CI pipelines.
- Implement i18n for multilingual support (EN/ES).
- Enhance accessibility (WCAG 2.1) evaluations and keyboard navigation.

For any questions, consult `kidz4fun.txt` for business context or reach out to the engineering team. Happy hacking!

