# Onboard — Requirements & Architecture

_Formerly “RoboHub”. Renamed when the app was generalized from robotics to any nonprofit (Phases 1–3, Nov 2026)._

**Project:** FBLA 2026–27 Coding & Programming — _Serving the Community: Nonprofit Volunteer Management_
**Partner nonprofit:** Robolution CLT (Charlotte, NC 501(c)(3)) — free VEX IQ robotics enrichment for grades 4–9, focused on Title I schools
**Platform:** Local web app — React client served by an Express server on the presenter's laptop (`http://localhost:3000`), SQLite database file on the same laptop
**Team:** Solo
**Status:** UI and Express + Prisma ORM 8 + SQLite server implemented, connected and tested. Generalized for any kind of nonprofit: per-org words, features, skill catalog, event roles and a volunteer requirements checklist.

---

## Part 1 — Requirements

### 1.1 Problem statement

Robolution CLT runs school-year and summer robotics programs at partner schools using volunteer mentors. Today, mentor recruitment happens through a general contact form, and there is no system for scheduling mentors across schools, tracking service hours, managing robotics kits, or reporting impact to sponsors. Onboard gives organization leaders and volunteers one place to **recruit, organize, manage, and monitor** volunteers and service activities.

### 1.2 Goals

1. Replace ad-hoc recruiting with a structured volunteer pipeline.
2. Make sure every session is properly staffed with qualified, trained mentors.
3. Keep accurate, approved records of volunteer hours and participation.
4. Produce customizable reports for leaders, sponsors, and volunteers.
5. Score at the "Exceeds Expectations" level on every line of the FBLA rating sheet.

### 1.2a Guiding principle — UX is sacrosanct

**User experience is the top priority and is never traded away for a feature.** Every screen is designed to get the user to their goal in the fewest possible clicks. If a feature cannot be added without harming clarity or adding friction, the UX wins and the feature is reshaped or cut. Concretely:

- **Minimize clicks.** Every core task is reachable in **≤ 3 clicks**; the most frequent tasks (approve hours, assign a mentor, check in) target **1–2 clicks**. Click counts are measured per task (see §2.10) and treated as acceptance criteria, not aspirations.
- **No dead ends.** Every screen offers a clear next action; empty states tell the user exactly what to do.
- **Bring the action to the data.** Inline actions (assign, approve, check in) live on the row/card, so the user never navigates away to act.
- **Sensible defaults.** Forms and filters pre-fill the common case so the user confirms rather than constructs.
- **Consistency over novelty.** Reused components mean a pattern learned once works everywhere.

This principle outranks feature scope in every tradeoff and is the lens for the UX rubric lines (UX design, intuitiveness, navigation).

### 1.3 Users & roles

**The account is an organization, not a person.** A _person_ is one identity who can hold a management role in one or more organizations **and** volunteer (including for other organizations). Roles are therefore not account types — they are relationships between a person and an organization.

| Concept                        | What it is                                                                                                                                   | Example                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| **Organization**               | The tenant/account. Owns schools, programs, sessions, kits.                                                                                  | Robolution CLT             |
| **Owner**                      | A person with full control of an org (billing, members, delete).                                                                             | A Robolution co-founder    |
| **Admin**                      | A person who manages an org's programs, sessions, volunteers, reports.                                                                       | A program lead             |
| **Coordinator**                | A person with limited management rights (e.g., one school's sessions).                                                                       | A site lead                |
| **Volunteer**                  | A _capability_ any person has: sign up, check in, log hours. Standing (applied→active, training, clearance) is tracked **per organization**. | Anyone, including an Owner |
| **School Contact** _(stretch)_ | Read-only access to one school's schedule.                                                                                                   | A partner teacher          |

**Key implication:** the same person can be an Owner of Robolution _and_ an active volunteer at Robolution _and_ a volunteer for a different org's event — all one identity. Management permissions come from **Membership** (person ↔ org + role); volunteering comes from **OrgVolunteer** standing and **SignUps** that attach to the person, not to an org.

**Belonging vs. one-time help.** A person can create and belong to **multiple organizations**. The org switcher lists _every org the person is part of_ — i.e., where they hold a **Membership** (Owner/Admin/Coordinator) **or** an ongoing registered **OrgVolunteer** standing — each shown with the person's role in that org. **A one-time (guest) sign-up does not make someone "part of" an org** and is _not_ listed in the switcher; it appears only under **My Volunteering** (schedule/hours). This keeps the org list meaningful: it shows standing relationships, not every event ever attended.

### 1.4 Prompt coverage (maps to rubric "Functionality & Relevance")

| Prompt verb  | Onboard features                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Recruit**  | Volunteer application form, applicant pipeline (Applied → Interviewed → Trained → Active → Inactive), re-engagement alerts |
| **Organize** | Schools, programs, sessions, competition events, role slots, sign-ups, waitlists, smart matching                           |
| **Manage**   | Volunteer profiles, skills, availability, training/clearance status, hour approval, kit inventory                          |
| **Monitor**  | Dashboards, staffing-risk alerts, attendance tracking, customizable reports and exports                                    |

This mapping is shown in-app on a **"How Onboard Meets the Challenge"** page and in the README.

### 1.5 Functional requirements

#### Accounts & access

- **FR-1** A person logs in with one identity (email + password, hashed); their account is not tied to a single role. The session is carried in an httpOnly cookie.
- **FR-2** Permissions are derived per organization from the person's Membership role (Owner/Admin/Coordinator); a person who manages multiple orgs uses an **org switcher** to choose the active org.
- **FR-2b** A person can volunteer for sessions in any org where they hold ACTIVE, cleared volunteer standing — including orgs they do not manage.
- **FR-3** First-run setup: when the database is empty, the server seeds demo data (including a second org to show cross-org volunteering), and a setup screen can create the first **Organization** (e.g., Robolution CLT) and its first **Owner** instead.
- **FR-3b** The UI offers a "Manage" context (for orgs the person administers) and a "My Volunteering" context (the person's own sign-ups and hours across all orgs); switching contexts does not require a separate account.
- **FR-3e2** **Everyone has the Volunteer / Organize switch.** Owners and Admins volunteer too, in Volunteer mode; Organize never shows volunteer items such as certificates or My hours.
  - Someone who runs no organization and switches to Organize sees an empty Organize Home with **Create an organization**.
  - Signing in lands on Organize Home for people who run an org, and on Volunteer Home for everyone else, unless they last chose Organize.
  - The chosen mode is remembered per browser.
- **FR-3c** A person can **create a new organization** and becomes its first Owner. The **org switcher lists every org the person belongs to** (a Membership _or_ an ongoing OrgVolunteer standing), each labeled with their role (Owner/Admin/Coordinator/Volunteer). Selecting an org the person manages sets it as the active org for the Manage context.
- **FR-3e** Anyone can step down from an org (`POST /api/orgs/:orgId/members/me/step-down`), except its last Owner, who hands over through an ownership offer (FR-3f). Open screens catch up when their tab becomes active again: the person's organizations, role and menu refresh, and so does the Team & roles list. If someone else signs in on the same browser in another tab, older tabs offer to continue as that person instead of quietly acting as them.
- **FR-3f** **Ownership is offered, not given.** An Owner offers it to someone already in the organization: a role holder, or anyone with a volunteer standing.
  - The person accepts or declines from their Home page.
  - Nothing changes until they accept. Roles can't be set to Owner directly.
  - One offer is open per org, and it ends after 14 days.
  - Owners can cancel an open offer. A declined offer shows on Team & roles until dismissed.
  - The last Owner steps down by handing over: the offer carries `stepDown`, and accepting it makes the new Owner and removes the old one in one write.
  - Stored in `OwnershipOffer`: id, orgId, fromUserId, toUserId, stepDown, status, createdAt.
- **FR-3d** A **one-time guest sign-up** (a SignUp to another org's session without ongoing standing there) does **not** appear in the org switcher; it shows only under My Volunteering. Guest sign-ups are allowed only for sessions the owning org marks **open to guests** (e.g., a public competition or judging role).

#### Recruitment

- **FR-4** Create an account (`/signup`): name, contact, affiliation, skills, availability, experience, transportation and a password. Choosing an organization is optional (it files an application there). The person is signed in right away.
- **FR-4c** Volunteer at one event without an account (`/help-once`). The page lists upcoming sessions marked open to guests that still have room. The person gives a name, email and phone for one of them. They are stored as a passwordless contact that can never sign in. A guest sign-up is refused when:
  - the session is full or has started;
  - the person is already on it or booked at an overlapping time;
  - the email belongs to an account (the person must sign in instead).

  An account created later with the same email takes over the contact and its history.

- **FR-4b** Organizers can add a volunteer directly (existing accounts are linked; new people get a temporary password) and copy a sign-up link with their org preselected (`/signup?org=…`; old `/apply` links redirect).
- **FR-5** Admin moves applicants through pipeline stages; each change is timestamped.
- **FR-6** Volunteers cannot be made Active, or join shifts and events, until every item on the organization's **requirements checklist** is complete and not expired (see FR-36).

#### Volunteer profiles

- **FR-7** Volunteers edit their profile, skills, and weekly availability. Skills are picked from each organization's own list, one group per organization the person is part of; skills no organization lists any more appear under "Other skills" so they can be removed.
- **FR-8** Admin can view, search, filter, and deactivate volunteers.
- **FR-8b** Volunteers can leave an organization, from My organizations. Admins and Owners can remove a volunteer, from the volunteer's page. Either way:
  - the volunteer standing goes, with its pipeline history and checklist;
  - upcoming shifts there are cancelled, and waitlists move up;
  - ownership offers to them from that org are withdrawn;
  - past shifts and hours stay, for reports and the certificate;
  - a management role is untouched (Step down gives it up);
  - the person can apply again.

#### Sites, programs & sessions

- **FR-9** Admin creates/edits sites — the places the org serves, called whatever the org calls them (School, Clinic, Field…): name, address, ZIP, optional priority flag (e.g. Title I), optional grade or age range served, contact.
- **FR-10** Admin creates programs (site, type: year-round or seasonal, dates, participants per session, optional participants-per-volunteer ratio, description).
- **FR-11** Admin creates sessions within a program (date, start/end time, title, required skills from the org's catalog, volunteers needed, session type: Regular shift / Event / Training).
- **FR-11b** "Repeat every week" creates one session per chosen weekday up to a last date, in one transaction (max 100); if any date breaks a rule, none are created (`POST /api/sessions/bulk`).
- **FR-11c** One-time events (a fundraiser) need no program: they are filed under a hidden "One-time events" program of their place (`Program.oneOff`).
- **FR-12** Event sessions get role slots from the org's own event-role list (Referee, Judge… or Screener, Greeter…).

#### Scheduling & participation

- **FR-13** Volunteers browse open sessions with smart filters and sign up.
- **FR-14** Full sessions offer a waitlist; a cancellation auto-promotes the next person.
- **FR-15** Admin can assign volunteers directly using recommendations.
- **FR-16** Check-in / check-out at sessions records attendance; missed sessions are marked No-Show.
- **FR-17** Calendar view (month/week) of sessions, color + icon coded by staffing status.

#### Hours

- **FR-18** Hours auto-generate from check-in/out; volunteers may also submit manual hour logs.
- **FR-19** Admin approves or rejects hour logs with an optional note.
- **FR-20** Volunteers download a PDF service-hours certificate (approved hours only).

#### Equipment inventory _(optional feature)_

- **FR-21** Track lendable equipment (robot kits, blood-pressure cuffs, gear bags…): asset tag, name, condition, assigned program; check out and return. Orgs that lend nothing switch it off.

#### Intelligent features

- **FR-22 Volunteer Matching:** ranked volunteer recommendations per session with a visible "why recommended" explanation.
- **FR-23 Help Assistant:** chat panel that answers how-to questions and data questions, running locally with no external AI service.
- **FR-24 Staffing-Risk Alerts:** flag upcoming sessions likely to be understaffed and volunteers inactive 30+ days.
- **FR-25 Smart Filters:** combinable filters (e.g., priority sites + Tuesday + a skill + next 14 days) with saved filter presets.

#### Reports & analysis

- **FR-26 Custom Report Builder:** choose metric, group-by, date range, filters, and chart type; output table + chart.
- **FR-27 Preset reports:** Sponsor Impact Report (priority sites vs. others), Volunteer Hours Summary, Site Summary, Attendance & Reliability, Equipment Utilization — each titled in the org's own words.
- **FR-28** Export any report to PDF and CSV.
- **FR-29** CSV import for real organizational data (volunteers, sites, sessions).

#### Serving any organization (added with the generalization, Phases 1–3)

- **FR-33** Each organization picks a **kind** (STEM & education, Health, Sports & recreation, Community service, Other) that sets its starting words, skills and event roles.
- **FR-34** **Organization settings** (Admin and up) edit the org's words — a place it serves, the people it serves, an equipment item, the priority flag, and whether sites keep a grade or age range. Every screen, rule message, report and assistant answer uses them.
- **FR-35** Orgs can switch off **equipment tracking**, **priority sites** and **guest volunteers**; menus, filters, forms and report presets hide what's off. The skill catalog and event roles are edited there too.
- **FR-36** **Volunteer requirements:** each org lists what volunteers must complete (training, background check, TB test, CPR…), optionally valid for _N_ months. Each volunteer's checklist shows Complete, Expiring soon (≤ 30 days), Expired or Missing; Admins record, renew or undo completions. An outstanding item blocks activation and new shift/event sign-ups (FR-6, V-S5).

#### Help & guidance

- **FR-30** First-run guided tour per role.
- **FR-31** Context-sensitive help (F1 / "?" button) on every screen.
- **FR-32** Searchable Help Center with FAQ.

### 1.6 Input validation requirements

Every rule produces a specific, friendly inline message. No input can crash the app.

**Format (syntactic)**

| ID   | Rule                                                           |
| ---- | -------------------------------------------------------------- |
| V-F1 | Required fields not empty / not whitespace only                |
| V-F2 | Email matches valid email format                               |
| V-F3 | Phone matches US format (10 digits)                            |
| V-F4 | ZIP code is 5 digits                                           |
| V-F5 | Dates and times are real, parseable values                     |
| V-F6 | Numeric fields (hours, counts) are numbers within type limits  |
| V-F7 | Text fields within max lengths; names contain valid characters |
| V-F8 | Password meets minimum strength                                |

**Meaning (semantic)**

| ID    | Rule                                                                                                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V-S1  | Session end time is after start time                                                                                                                                           |
| V-S2  | Session date falls inside its program's start/end dates                                                                                                                        |
| V-S3  | Program end date is after start date                                                                                                                                           |
| V-S4  | A volunteer cannot be double-booked in overlapping sessions                                                                                                                    |
| V-S5  | Volunteer must be Active and trained/cleared in the owning org to join a student-facing session — except sessions flagged `openToGuests`, which allow a one-time guest sign-up |
| V-S6  | Logged hours cannot exceed session length or be in the future                                                                                                                  |
| V-S7  | Manual hour log ≤ 12 hours per day                                                                                                                                             |
| V-S8  | Volunteers meet the program's participant ratio, when it sets one                                                                                                              |
| V-S9  | Sign-up blocked when session is full (offer waitlist instead)                                                                                                                  |
| V-S10 | An equipment item cannot be checked out to two programs at once                                                                                                                |
| V-S11 | A served range is plausible (grades K–12 or ages 0–120)                                                                                                                        |
| V-S12 | No duplicate volunteer emails or duplicate site names                                                                                                                          |
| V-S13 | Volunteer availability must cover the session time to sign up                                                                                                                  |
| V-S14 | Cannot delete a site/program that has sessions with logged hours (archive instead)                                                                                             |

### 1.7 Non-functional requirements

| ID    | Requirement                                                                                                                                                                                                                                                                       |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-1 | **Local web app:** runs entirely on the presenter's laptop and is used through a browser at `http://localhost:3000`; no external server or cloud service (internet is not needed at runtime, though Wi-Fi is available)                                                           |
| NFR-2 | **Reliability:** no unhandled errors; global error handlers on UI and API                                                                                                                                                                                                         |
| NFR-3 | **Performance:** server start + first page load under 5 seconds; screens respond in under 300 ms with demo data                                                                                                                                                                   |
| NFR-4 | **Accessibility:** target WCAG 2.1 AA (see 2.10)                                                                                                                                                                                                                                  |
| NFR-5 | **Usability (sacrosanct):** UX is never sacrificed for a feature; any core task reachable in ≤ 3 clicks, high-frequency tasks in 1–2; zero spelling errors (see §1.2a)                                                                                                            |
| NFR-6 | **Battery-friendly:** must run a full demo on laptop battery (no power at competition)                                                                                                                                                                                            |
| NFR-7 | **Privacy & security:** passwords hashed; session in an httpOnly, SameSite cookie that slides (8 hours idle, 30 days at most) and is renewed in place without losing work; API bound to localhost only; same-origin (no CORS); login rate-limited; demo data uses fictional names |
| NFR-8 | **Maintainability:** layered modular code, TSDoc on all exported functions, lint-clean                                                                                                                                                                                            |
| NFR-9 | **Portability:** server runs with Node.js on Windows and macOS; client supports current Chrome and Edge (Firefox and Safari as a bonus); responsive down to phone width                                                                                                           |

### 1.8 Rubric traceability

| Rating-sheet item                       | Points | Where it's satisfied                                 |
| --------------------------------------- | ------ | ---------------------------------------------------- |
| Coding language selection               | 5      | §2.1 stack rationale + presentation pitch            |
| Comments, naming, formatting            | 5      | §2.11 code standards (TSDoc, ESLint, Prettier)       |
| Modular program                         | 10     | §2.3 layered architecture, §2.4 folder structure     |
| UX: journey, rationale, accessibility   | 10     | §2.9 user journeys, §2.10 accessibility              |
| Intuitive UI / instructions             | 5      | FR-30–32, onboarding tour, inline hints              |
| Navigation + intelligent feature        | 5      | Sidebar nav, Help Center, FR-22–25                   |
| Input validation (syntactic + semantic) | 5      | §1.6, §2.7                                           |
| Addresses all parts of prompt           | 10     | §1.4 + in-app "How Onboard Meets the Challenge" page |
| Presentable, customizable reports       | 10     | FR-26–28, §2.8                                       |
| Data storage & structures               | 5      | §2.5 data model, §2.6 in-memory structures           |

### 1.9 Scope

**Must have (MVP):** auth & roles, volunteer pipeline, schools/programs/sessions, sign-ups + waitlist, check-in & hours, validation, mentor matching, help assistant, report builder + PDF/CSV, accessibility settings, onboarding, one-command local launch (`npm run demo`).

**Should have:** staffing-risk alerts, saved filter presets, calendar view, certificates, CSV import.

**Could have (stretch):** kit inventory, school-contact role, dark mode, data backup/restore.

**Out of scope:** cloud hosting or online sync, email/SMS sending, payments/donations.

### 1.10 Open questions for Robolution

1. How are mentors recruited and approved today? What training or background check is required?
2. How many sessions per program, and what is the target mentor-to-student ratio?
3. Who are typical volunteers (high school, college, adult professionals)?
4. What happens at the end-of-program competition, and which volunteer roles are needed?
5. How are kits and volunteer hours tracked now?
6. Permission to use Robolution's name, logo, and real (anonymized) data in the app and presentation.

---

## Part 2 — Architecture

### 2.1 Technology stack

| Layer        | Technology                                          | Purpose                                                                                                                                                                                          |
| ------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Language     | **TypeScript** (frontend + backend)                 | Full-stack static typing, one language                                                                                                                                                           |
| Frontend     | **React + Vite**                                    | Component-based UI, fast build, dev proxy to the API                                                                                                                                             |
| Styling      | **Tailwind CSS**                                    | Consistent design system, themes, scaling                                                                                                                                                        |
| Routing      | **React Router**                                    | Clean URLs, role-guarded routes                                                                                                                                                                  |
| Data grids   | **AG Grid (Enterprise)**                            | All record tables — sort, multi-filter, pagination, keyboard nav, ARIA, plus Enterprise features: set filters, row grouping/aggregation, master-detail rows, Excel export, and integrated charts |
| Charts       | **AG Charts (Enterprise)**                          | Dashboard and report charts — same vendor as the grid, one theming model, light/dark aware; Enterprise unlocks integrated grid→chart creation and advanced series                                |
| Backend      | **Node.js + Express**                               | Local REST API; also serves the built client                                                                                                                                                     |
| ORM          | **Prisma ORM 8** (release candidate, SQLite target) | Type-safe data contract (`contract.prisma`), planned migrations, typed queries; no engine binaries, uses Node's built-in `node:sqlite` (Node ≥ 22.5)                                             |
| Database     | **SQLite**                                          | Embedded ACID relational DB, single file on the laptop                                                                                                                                           |
| Validation   | **Zod**                                             | Shared format schemas (client + server)                                                                                                                                                          |
| PDF / CSV    | **jsPDF** (+ autotable); AG Grid CSV export         | Report and certificate exports                                                                                                                                                                   |
| Fuzzy search | **Fuse.js**                                         | Help assistant matching, search                                                                                                                                                                  |
| Auth         | **bcrypt** + httpOnly session cookie                | Password hashing, role checks                                                                                                                                                                    |
| Testing      | **Vitest**                                          | Unit tests for services and validation                                                                                                                                                           |
| Quality      | **ESLint + Prettier + TSDoc**                       | Formatting, naming, documentation                                                                                                                                                                |

> **⚠ Licensing note (decision needed):** AG Grid Enterprise and AG Charts Enterprise are **commercial, paid products**, not free. Without a valid license key the app still runs, but it prints a console warning and shows a **"For evaluation only" watermark** over the grid/charts — which would look unfinished to judges and must be disclosed in the README. Options: (a) obtain a license key (AG Grid offers free keys for some students/educational and non-commercial use — verify current eligibility before relying on it); (b) if no licensed key is available, fall back to AG Grid/AG Charts **Community** (MIT, free) and implement set filters, grouping, and chart export manually. The FBLA guidelines require documenting all libraries and their licenses, so whichever path is chosen, record the product, version, license type, and key source in `docs/credits.md`.

**Selection rationale (presentation pitch):** TypeScript provides full-stack type safety across a single codebase. React's component-based architecture keeps the UI modular, and Express exposes a RESTful API with a layered service architecture. Record-heavy screens use **AG Grid Enterprise**, an industry-standard data grid, and dashboards use **AG Charts Enterprise** from the same vendor, so grids and charts share one theme and we avoid re-implementing sorting, filtering, grouping, and accessibility by hand. Enterprise features — set filters, row grouping with aggregation, master-detail rows, Excel export, and integrated grid→chart creation — let a report be built from a grid with almost no custom code (subject to the licensing note above). SQLite is an embedded, ACID-compliant relational database with no server dependency, and Prisma ORM 8 provides a typed data contract, reviewed migration plans and type-safe queries with no native engine to download. Onboard runs as a **local web app**: one command starts the server on the laptop, and the app opens in any modern browser — nothing to install for users, no cloud account, and the same responsive UI works on a phone or tablet.

### 2.2 System overview

```
┌──────────────────────────── Presenter's laptop ─────────────────────────────┐
│                                                                             │
│  Browser  (http://localhost:3000)                                           │
│   • React + Tailwind pages & components                                     │
│   • Zod form validation                                                     │
│   • AG Grid tables, AG Charts, report builder                               │
│   • Help assistant panel                                                    │
│                     │  HTTP/JSON, same origin, httpOnly session cookie      │
│                     ▼                                                       │
│  Express server  (Node, bound to 127.0.0.1:3000)                            │
│   • serves built client (dist/) + falls back to index.html for app routes   │
│   • /api/*  routes → middleware → services → repositories                   │
│   • `npm start` applies Prisma migrations first; seeds demo data if empty   │
│                     │                                                       │
│                     ▼                                                       │
│  Prisma ORM 8 → SQLite  (data/onboard.db, via node:sqlite)                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

In development, Vite serves the client on `localhost:5173` with hot reload and proxies `/api` to Express, so the browser always sees a single origin.

**Security settings:** API bound to localhost only; same-origin requests (no CORS); httpOnly, SameSite=Strict session cookie (no tokens stored in JavaScript; the database stores only a SHA-256 hash of each token, a sign-in ends after 8 hours without activity, extended at most every 15 minutes as the person works, and never lasts past 30 days; when it ends on a signed-in screen, a "Please sign in again" dialog keeps the screen and its unsaved input); JSON-only request bodies plus an `Origin` check on every state-changing request; `helmet` security headers including a strict Content-Security-Policy (`default-src 'self'`); rate limit on the login route; passwords hashed with bcrypt.

### 2.3 Backend layering

```
Request → Route → Middleware (auth, role, Zod validation) → Service → Repository → Prisma/SQLite
                                                              │
                                              business rules, semantic validation,
                                              matching, reports, assistant
```

- **Routes:** HTTP only — parse request, call one service method, return response.
- **Middleware:** session cookie → signed-in person, same-origin guard, rate limits, centralized error handler. Org-scoped role checks and Zod validation run at the top of each service, so no route can skip them.
- **Services:** all business logic; no HTTP or SQL knowledge.
- **Repositories:** all database access through Prisma; no business rules.
- **Shared:** Zod schemas, types, and enums imported by both frontend and backend.

**How reads and writes work.** One nonprofit's data is a few hundred rows, and the smart features (matching, risk, reports, assistant) need most of it at once. So the server keeps one in-memory **snapshot** of the dataset, loaded through Prisma on first use. Read routes call services against the snapshot (Map/Set lookups, §2.6). Write routes run the service on a **draft copy**. A **unit of work** then compares the draft with the snapshot and issues only the needed Prisma `create` / `update` / `delete` calls, in **one transaction**. The draft becomes the new snapshot only after the commit. Writes are queued one at a time, so the cache and the database can never disagree. A failed rule or permission check throws before anything is written. The same pure domain functions (`shared/domain/`) run in the server and in the UI's mock.

### 2.4 Folder structure

```
onboard/
├── README.md                    # setup, usage, prompt mapping, credits & licenses
├── package.json                 # dev / build / start / demo scripts
├── .env.example                 # PORT, DATABASE_PATH, DEMO_MODE
├── prisma.config.ts             # Prisma CLI: contract, database file, migrations folder
├── vite.config.ts               # client build, /api dev proxy, CSP for production
├── data/                        # onboard.db (SQLite) — git-ignored
├── shared/                      # imported by BOTH client and server
│   ├── schemas/                 # Zod schemas (volunteer, session, hourLog, ...)
│   ├── types/                   # shared TS types & DTOs
│   ├── enums.ts                 # OrgRole, VolunteerStatus, SessionType, ...
│   ├── permissions.ts           # org-scoped permission matrix
│   ├── rules.ts                 # semantic validation rules (V-S1 … V-S14)
│   ├── domain/                  # matching, risk, reports, assistant, views — pure functions
│   ├── demo/seed.ts             # deterministic demo data
│   └── utils/                   # PriorityQueue, distance
├── server/
│   ├── index.ts                 # opens DB, seeds if empty, listens on 127.0.0.1:PORT (next free port if busy)
│   ├── app.ts                   # Express setup, helmet, static dist/ + SPA fallback
│   ├── config.ts · store.ts     # settings · cached snapshot + transactional unit of work
│   ├── routes/                  # every contract.ts endpoint, one line each
│   ├── middleware/              # session cookie, same-origin guard, rate limits, errorHandler
│   ├── services/                # accountService, orgService, volunteerService, catalogService,
│   │                            # sessionService (sign-ups, waitlist, check-in), hourService,
│   │                            # insightService (matching, risk, reports, assistant, presets)
│   ├── repositories/            # tables.ts (row ↔ domain mapping), snapshotRepository, authRepository
│   └── prisma/
│       ├── contract.prisma      # data contract (Prisma 8)
│       ├── contract.json/.d.ts  # emitted by `prisma contract emit`
│       ├── migrations/          # committed migration plans
│       ├── db.ts                # Prisma client factory
│       └── seed.ts              # demo seeding and reset (bcrypt hashes)
├── client/
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── routes/              # route definitions, role guards
│       ├── pages/               # Dashboard, Volunteers, Sessions, Calendar,
│       │                        # Reports, Help, Settings, Apply, ...
│       ├── components/
│       │   ├── ui/              # Button, FormField, Modal, Pill, StatTile — shared primitives
│       │   ├── DataGrid.tsx     # one AG Grid wrapper reused by every table
│       │   └── Chart.tsx        # one AG Charts wrapper reused by every chart
│       ├── gridConfig/          # column definitions per entity (volunteerCols, sessionCols, ...)
│       ├── features/            # assistant/, reportBuilder/, matching/, tour/
│       ├── hooks/               # useApi, useAuth, useSettings
│       ├── context/             # AuthContext, OrgContext, AccessibilityContext
│       └── lib/                 # api client, formatters, pdf/csv export
├── docs/
│   ├── ux/                      # user journeys, wireframes, design rationale
│   └── credits.md               # libraries, licenses, copyrighted material
└── tests/                       # Vitest: rules, matching, reports, schemas; tests/api (supertest)
```

### 2.5 Data model

**Identity is separated from organization and from volunteering.** `User` is a pure identity. Management rights live on `Membership` (person ↔ org + role). Volunteering standing lives on `OrgVolunteer` (person ↔ org), while the person's reusable attributes (skills, availability) live once on `VolunteerProfile`. `SignUp` and `HourLog` attach to the `User`, so a person can participate in sessions owned by **any** org.

```
Organization ─1:*─ Membership ─*:1─ User ─1:1─ VolunteerProfile ─*:*─ Skill
     │                                 │                    └─1:*─ Availability
     ├─1:*─ OrgVolunteer ─*:1──────────┤   (volunteer standing + checklist, per org)
     │          ├─1:*─ StatusChange     │
     │          └─1:*─ VolunteerRequirement ─*:1─ Requirement ─*:1─ Organization
     ├─1:*─ OrgSkill ─*:1─ Skill · ├─1:*─ OrgEventRole
     ├─1:*─ Site ─1:*─ Program ─1:*─ Session ─*:*─ Skill (required)
     ├─1:*─ Equipment ─*:1(opt)─ Program │
     │                                  ├─1:*─ SignUp ─*:1─ Session   (any org's session)
     └──────────────────────────────── └─1:*─ HourLog ─(opt)*:1─ Session
```

| Entity                   | Key fields                                                                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Organization**         | id, name (unique), timezone, description, createdAt, sector, siteTerm, participantTerm, equipmentTerm, priorityLabel, rangeKind, featureEquipment, featurePriority, featureGuests |
| **User**                 | id, firstName, lastName, email (unique), passwordHash, phone?, zip?, createdAt — _identity only, no role_                                                                         |
| **Membership**           | id, orgId, userId, orgRole, createdAt — management rights _(unique orgId+userId)_                                                                                                 |
| **VolunteerProfile**     | id, userId (unique, 1:1), experienceLevel, hasTransportation, bio? — global, reused across orgs                                                                                   |
| **OrgVolunteer**         | id, orgId, userId, status, createdAt — volunteer standing per org _(unique orgId+userId)_                                                                                         |
| **Requirement**          | id, orgId, name, description, validMonths?, position, archived — what the org asks volunteers to complete                                                                         |
| **VolunteerRequirement** | orgVolunteerId, requirementId, completedAt, expiresAt?, recordedBy _(composite PK)_                                                                                               |
| **OrgSkill**             | orgId, skillId, position, description? — the org's skill catalog, with optional one-line explanations                                                                             |
| **OrgEventRole**         | id, orgId, name, position — the org's event roles                                                                                                                                 |
| **Skill**                | id, name — shared names; each org's catalog lists the ones it uses                                                                                                                |
| **VolunteerSkill**       | profileId, skillId _(composite PK — skills belong to the person)_                                                                                                                 |
| **Availability**         | id, profileId, dayOfWeek, startTime, endTime                                                                                                                                      |
| **StatusChange**         | id, orgVolunteerId, fromStatus, toStatus, changedBy, changedAt, note                                                                                                              |
| **Site**                 | id, orgId, name, address, zip, priority, rangeMin?, rangeMax?, contactName, contactEmail _(name unique per org)_                                                                  |
| **Program**              | id, siteId, name, type, startDate, endDate, participantCount, targetRatio?, description, archived, oneOff                                                                         |
| **Session**              | id, programId, type, date, startTime, endTime, title, volunteersNeeded, status, openToGuests (bool — allows one-time guest volunteers)                                            |
| **SignUp**               | id, sessionId, userId, role, status, waitlistPosition?, checkInAt?, checkOutAt? _(unique sessionId+userId)_                                                                       |
| **HourLog**              | id, userId, sessionId?, orgId, date, hours, description, status, reviewedBy?, reviewNote?                                                                                         |
| **Equipment**            | id, orgId, assetTag, name, condition, programId?, checkedOutAt? _(assetTag unique per org)_                                                                                       |
| **SessionSkill**         | sessionId, skillId _(composite PK — skills a session requires)_                                                                                                                   |
| **RoleSlot**             | id, sessionId, role, needed, position — event role slots (FR-12)                                                                                                                  |
| **FilterPreset**         | id, userId, name, filters (JSON text) — saved smart filters (FR-25)                                                                                                               |
| **AuthSession**          | id, tokenHash (unique), userId, createdAt, expiresAt, lastSeenAt — sign-ins behind the httpOnly cookie; `expiresAt` slides with activity, capped at 30 days from `createdAt`      |

**Storage conventions (Prisma 8, SQLite target).** Ids are text generated by the server with a readable prefix (`usr_…`, `ses_…`). Calendar dates are `YYYY-MM-DD` text, times `HH:mm` text, instants ISO-8601 text, the same as the JSON the API sends. Booleans are `Int` 0/1, because the SQLite target has no boolean column; the repository converts them. SQLite has no list columns, so skills use the `VolunteerSkill` / `SessionSkill` join tables.

**Permission rule:** a management action is allowed only if the acting user has a `Membership` in the target org with a sufficient `orgRole` (OWNER > ADMIN > COORDINATOR). A volunteer may join a regular shift or event only if they have an `OrgVolunteer` record that is ACTIVE with a current requirements checklist **in the org that owns that session** (semantic rule V-S5, org-scoped) — **unless** the session is `openToGuests`, which permits a one-time guest sign-up without ongoing standing (lighter check). "Part of an org" (and thus listed in the org switcher) = has a `Membership` **or** a non-guest `OrgVolunteer` standing; a guest sign-up alone does not count.

**Enums:** `OrgRole` (OWNER, ADMIN, COORDINATOR) · `VolunteerStatus` (APPLIED, INTERVIEWED, TRAINED, ACTIVE, INACTIVE) _(on OrgVolunteer)_ · `ExperienceLevel` (NEW, INTERMEDIATE, VETERAN) · `OrgSector` (STEM, HEALTH, SPORTS, COMMUNITY, OTHER) · `RangeKind` (GRADE, AGE, NONE) · `ProgramType` (ONGOING, SEASONAL) · `SessionType` (SHIFT, EVENT, TRAINING) · `SessionStatus` (SCHEDULED, COMPLETED, CANCELLED) · `SignUpStatus` (SIGNED_UP, WAITLISTED, CHECKED_IN, COMPLETED, NO_SHOW, CANCELLED) · `HourStatus` (PENDING, APPROVED, REJECTED) · `EquipmentCondition` (GOOD, NEEDS_REPAIR, MISSING_PARTS, RETIRED) · `RequirementState` (COMPLETE, EXPIRING, EXPIRED, MISSING — computed, never stored)

**Scope note:** the schema is multi-org by design. The demo seeds **Robolution CLT plus one partner org** so cross-org volunteering is visible, while day-to-day management uses an **org switcher** to act within one org at a time. Full multi-org management UI is a stretch goal; single-org management on this schema is the MVP.

### 2.6 In-memory data structures & scope

| Structure                                | Used for                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| `Array<T>` of typed objects              | Query results, table rows, report rows                                 |
| `Map<id, T>`                             | O(1) lookups when joining volunteers/sessions in matching & reports    |
| `Set<string>`                            | Volunteer skills vs. required skills (intersection), availability days |
| `PriorityQueue<T>` (custom, binary heap) | Top-K match ranking; waitlist ordering                                 |
| `Record<GroupKey, Aggregate>`            | Report group-by aggregation                                            |
| `enum` / union types                     | All statuses and roles — no magic strings                              |
| `Date`                                   | All dates and times; time math centralized in `utils/time.ts`          |

**Scope rules:** no global mutable state; config passed via dependency injection into services; React state kept at the lowest component that needs it, with Context only for auth, the active organization, and accessibility settings; constants in `UPPER_SNAKE_CASE` modules.

### 2.7 Validation architecture

1. **Client (format):** forms validate with shared Zod schemas on blur and submit; errors shown inline next to the field with ARIA `aria-describedby`.
2. **API (format):** each service starts by re-running the same Zod schema through `validate(schema, input)` (query strings get their own schemas in `routes/handlers.ts`) — never trust the client.
3. **Service (meaning):** semantic rules in `shared/rules.ts` (V-S1…V-S14), each a small pure function returning `{ ok } | { ok: false, field, message }`; services call them through `enforce(...)`.
4. **Errors:** a typed `AppError` (code, field, user message) → centralized error handler → consistent JSON → friendly UI message. Unknown errors are logged and shown as a generic safe message; the app never crashes.

Example messages: _"End time must be after 3:30 PM."_ · _"Jordan is already booked at Hidden Valley Elementary from 3:00–4:30 PM that day."_ · _"This volunteer hasn't completed training yet, so they can't be assigned to student sessions."_

### 2.8 Intelligent features

**Volunteer Matching (`matchingService`)**

1. **Hard filters:** status ACTIVE, requirements checklist current, available at session time, not double-booked.
2. **Weighted score (0–100):**

| Factor             | Weight | Calculation                                                        |
| ------------------ | ------ | ------------------------------------------------------------------ |
| Skill match        | 35%    | required skills ∩ volunteer skills ÷ required skills               |
| Reliability        | 25%    | completed ÷ (completed + no-shows), default for new volunteers     |
| Proximity          | 15%    | ZIP-centroid distance to the site, normalized                      |
| Experience balance | 15%    | boosts veterans if session has only new volunteers, and vice versa |
| Fair distribution  | 10%    | favors volunteers with fewer recent sessions                       |

3. Rank with a priority queue; return top 5 with a plain-language explanation per factor ("Has Block Coding skill · 95% attendance · 4 miles away").

**Help Assistant (`assistantService`)** — runs locally, no external AI service

- **How-to intents:** Fuse.js fuzzy search over a FAQ knowledge base (JSON) → answer + "Take me there" button.
- **Data intents:** pattern-matched questions mapped to safe service calls, e.g. "Who is free Tuesday?", "How many hours does Jordan have?", "Which sessions need volunteers this week?"
- Role-aware (volunteers only see their own data); suggests example questions; falls back to closest FAQ matches.

**Staffing-Risk Alerts (`riskService`)**

- Risk = (open slots ÷ needed) adjusted by signed-up volunteers' historical no-show rate and days until session. High / Medium / Low badges on dashboard.
- Inactivity: Active volunteers with no session in 30+ days listed for re-engagement.

**Smart Filters** — combinable filters on sessions and volunteers with saved presets.

### 2.9 Reports

**Report Builder parameters**

| Parameter | Options                                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------- |
| Metric    | Volunteer hours, sessions staffed %, attendance rate, no-show rate, active volunteers, new recruits, equipment in use |
| Group by  | Volunteer, site, program, month, skill, priority vs. other sites                                                      |
| Filters   | Date range, site, program type, volunteer status, skill                                                               |
| Output    | Table + chart (bar / line / pie), summary totals                                                                      |
| Export    | PDF (branded header, date, filters used) and CSV                                                                      |

**Presets:** Sponsor Impact Report · Volunteer Hours Summary · Site Summary · Attendance & Reliability · Equipment Utilization · Service-Hours Certificate (per volunteer).

**Enterprise leverage:** report tables use AG Grid row grouping + aggregation and **Excel export**; a grid can be turned into a chart via AG Grid's **integrated charts** without separate chart code. jsPDF still produces the branded PDF reports and the certificate (custom layout AG Grid can't generate). All exports are generated in the browser and saved through the browser's normal download flow.

### 2.10 UX design

**Design principle:** UX is sacrosanct (§1.2a) — minimize clicks, never trade clarity for a feature.

**Navigation (simplicity pass, Nov 2026):** a first-time user should never face more than one short menu. A **Volunteer / Organize** switch at the top of the sidebar picks the mode (people who manage nothing only see Volunteer). Each mode has about six items; related screens are **tabs** under one item (Volunteers → People · New volunteers; Settings → Organization · places · equipment · Team & roles; Schedule → Sessions · Calendar · Programs; My shifts → List · Calendar). A program is the ongoing activity (a weekly club, a season); a session is one date of it — the Programs tab shows each program as a card listing its upcoming sessions with an "Add a session" button. App settings, the Help Center and sign-out sit in the account menu under the person's name. The top bar has search and a single **Help** button (screen help + assistant). Breadcrumbs on detail pages.

**Home pages answer one question: "what needs me?"** Organize → Home is a single "Needs your attention" list (sessions short on volunteers, hours to approve, checklists due, new volunteers, people to re-engage), one sentence and one button per row; a new org sees a four-step "Get started" checklist. Volunteer → Home shows the next shift (with "I'm here — check in" on the day), three suggested shifts and the hours total. Statistics live in Reports.

**Progressive disclosure:** session cards show what, where, when, open spots and one action; details live on the session page. Forms show essentials first ("More options" holds the rest). Data grids start with search, sort and Download; **More tools** reveals AG Grid Enterprise filters, grouping, pivot and charts. Labels use everyday words (Ready to serve, Taking a break, 3 of 4 spots open, Urgent). The first-run tour is three cards per role. Every core task within 3 clicks. Clean, bookmarkable URLs (e.g. `/me/hours`), and the browser's back/forward buttons work throughout.

**Click budget (acceptance criteria).** Each core task has a target click count, verified in the manual test script:

| Task                                    | Target | How                                       |
| --------------------------------------- | ------ | ----------------------------------------- |
| Approve an hour log                     | 1      | Approve button on the Home attention list |
| Assign a recommended volunteer          | 1      | Assign button on the match row            |
| Check a volunteer in                    | 1      | Check-in toggle on the session roster row |
| Find a volunteer for an at-risk session | 2      | Home attention row → Find volunteers      |
| Sign up for a session (volunteer)       | 1      | Home → Suggested card → Sign up           |
| Run a preset report                     | 2      | Reports → preset                          |
| Build a custom report                   | ≤ 3    | Reports → set params → Run                |
| Download service-hours certificate      | 2      | My hours → Download                       |

**Click-reduction patterns:** global search + `/` shortcut jump straight to any record; inline row actions (no drill-in to act); bulk actions (approve/assign multiple selected rows at once); smart defaults pre-fill forms/filters; keyboard shortcuts for frequent actions; "undo" on destructive actions instead of a confirm dialog where safe.

**User journey A — Volunteer**
Apply → (admin approves & marks trained) → log in → guided tour → set availability → see "Suggested for you" on Home → sign up → "I'm here — check in" on Home → hours auto-logged → download certificate.

**User journey B — Admin**
Home's "Needs your attention" list shows a session short on volunteers → Find volunteers → view ranked recommendations with explanations → assign volunteers → after session, approve hours → open Report Builder → generate Sponsor Impact Report → export PDF.

**Design rationale:** role-based dashboards show only what each user needs; consistent card and table components reduce learning; status uses color **plus** icon **plus** text; empty states tell users what to do next; destructive actions require confirmation; Robolution brand colors (with permission) build trust for the real organization.

**Accessibility features**

- High-contrast theme and dark mode
- Font size scaling (rem-based) and dyslexia-friendly font option
- Full keyboard navigation, visible focus rings, skip-to-content link
- Semantic HTML landmarks and ARIA labels; form errors announced via `aria-live`
- Color-blind-safe chart palette; never color alone
- Reduced-motion respected (`prefers-reduced-motion`)
- Minimum 4.5:1 text contrast; large click targets
- Responsive layout down to phone width; works with browser zoom up to 200%

### 2.11 Code standards (rubric: comments & formatting)

- TSDoc on every exported function, class, and type: purpose, `@param`, `@returns`, `@throws`.
- File header comment describing each module's responsibility.
- Inline comments explain _why_ (e.g., weighting choices), not _what_.
- Naming: `camelCase` variables/functions, `PascalCase` components/types, `UPPER_SNAKE_CASE` constants, descriptive names.
- ESLint + Prettier enforced; zero lint warnings at submission.

### 2.11a Component reuse & concise code (DRY)

The goal is a small, readable codebase where judges can follow the logic quickly — not verbose, copy-pasted screens. Reuse is the default; new code is written only when nothing existing fits.

- **One grid, many tables.** A single `DataGrid` wrapper around AG Grid is reused for every record table. Each screen supplies only a **column-definition array** from `gridConfig/` plus its row data — no table markup is hand-written. Sorting, filtering, pagination, CSV export, keyboard navigation, and ARIA come from the grid, configured once.
- **One chart wrapper.** A single `Chart` component around AG Charts renders every bar/line/pie chart from a `{ data, series, type }` prop. The report builder and dashboards pass config, not new chart code.
- **Shared UI primitives.** `Button`, `FormField`, `Modal`, `Pill`, `StatTile` live in `components/ui/` and are reused everywhere; status pills derive their color/icon/label from a single `statusMeta` map so a status is defined in exactly one place.
- **Shared types & schemas.** Entity types, enums, and Zod schemas live in `shared/` and are imported by both client and server — the shape of a volunteer or session is declared once.
- **Config over duplication.** Differences between screens are expressed as data (column defs, field lists, chart config), not as repeated components.
- **Concise functions.** Small single-purpose functions; early returns over nested conditionals; no dead code or commented-out blocks at submission. Reuse before you write: if logic appears twice, extract it.

This directly supports the **modularity / "advanced knowledge of programming"** rubric line and keeps the demo code easy to explain in Q&A.

### 2.12 Testing

- **Vitest unit tests:** every semantic rule (V-S1…V-S14), matching score and ranking, risk calculation, report aggregation, Zod schemas.
- **API tests (supertest):** the real Express app and Prisma on a temporary, migrated, seeded SQLite database. They cover:
  - cookie sign-in and logout, one message for any failed login, and the rate limit;
  - org-scoped refusals and validation and rule errors;
  - cross-site request refusal;
  - guest sign-ups, waitlist promotion, and no self-approval of hours;
  - every org keeping an Owner;
  - writes surviving a restart, and refused writes changing nothing.
- **Manual test script:** each FR and user journey run with `npm run demo` on the presentation laptop, in Chrome and Edge, on battery.
- **Edge-case list:** empty database, max-length inputs, overlapping times, midnight boundaries, deleted references, browser refresh on a deep link, signing in as two different people in two browser profiles.

### 2.13 Running the app

- **Development:** `npm run dev` starts Vite (client, hot reload, `localhost:5173`) and the Express API together; Vite proxies `/api` to Express.
- **Production / demo:** `npm run build && npm start` — Express serves the built client and the API from one origin at `http://localhost:3000`. `npm run demo` does both and opens the browser.
- **Database:** `npm start` (and `npm run dev`) run `prisma db migrate` before the server starts. Prisma 8 doesn't apply migrations from app code. The SQLite file lives at `data/onboard.db`. When the database is empty, the server seeds realistic demo data (fictional names, real program structure). `npm run db:fresh` rebuilds it, and **Settings → Reset demo data** calls `POST /api/meta/reset-demo` (only when `DEMO_MODE=true`).
- **Schema changes:** edit `server/prisma/contract.prisma` → `npm run db:emit` → `npm run db:plan -- --name <change>` → review and commit the migration folder.
- **Configuration:** optional `.env` holds `PORT` (default 3000), `DATABASE_PATH` (default `./data/onboard.db`) and `DEMO_MODE` (default `true`); `.env.example` documents them. No secret is needed: session tokens are random and stored hashed.
- README covers install (Node.js 22.5+), the run commands, demo login credentials, features, prompt mapping, and full credits.

### 2.14 Documentation & credits (required by guidelines)

README must include: setup/run instructions, user guide, how the program addresses the prompt, source code location, all libraries/templates with licenses (React, Vite, Tailwind, React Router, Express, Prisma, SQLite, Zod, **AG Grid Enterprise + AG Charts Enterprise — commercial license; record key source and type**, jsPDF, Fuse.js, bcrypt, Vitest), and documentation of any copyrighted material (Robolution name/logo with written permission, icons, fonts).

### 2.15 Risks & mitigations

| Risk                                                             | Mitigation                                                                                                                                                                                                              |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrong page opened or a stale build during the demo               | Single `npm run demo` command builds, starts, and opens the browser; rehearse with it                                                                                                                                   |
| App crash during demo                                            | Global error handlers; rehearse on the production build; backup demo video                                                                                                                                              |
| No power at competition                                          | Rehearse full demo on battery; disable heavy animations                                                                                                                                                                 |
| Scope too large for solo developer                               | Strict MVP order; stretch features only after MVP is stable                                                                                                                                                             |
| Real data privacy                                                | Fictional names in demo; real aggregates only with permission                                                                                                                                                           |
| Port conflicts                                                   | `PORT` set in `.env`; server falls back to the next free port and prints the URL                                                                                                                                        |
| Browser differences                                              | Test the full script in Chrome and Edge (the demo browsers); Firefox/Safari as a bonus                                                                                                                                  |
| Prisma ORM 8 is a release candidate (SQLite target experimental) | Versions pinned exactly in `package.json`; all data access goes through one repository layer (`tables.ts` + `snapshotRepository.ts`), so a fix or a fallback touches two files; API tests run against the real database |
| AG Grid/Charts Enterprise license (watermark, cost)              | Secure a valid key before finals; document it in credits; keep Community as a tested fallback so the app never ships with an evaluation watermark                                                                       |

### 2.16 Build order

1. Express + Prisma + React skeleton runs locally with one command
2. Data model, seed data, auth & roles
3. Volunteers, sites, programs, sessions (CRUD + validation)
4. Sign-ups, waitlist, check-in, hours
5. Volunteer matching + staffing-risk alerts
6. Report builder + PDF/CSV exports
7. Help assistant, onboarding tour, Help Center
8. Accessibility settings and polish
9. Tests, README, credits, final demo build, presentation rehearsal
