# Onboard

Volunteer management for **any nonprofit**: a robotics club, a free clinic, a youth sports league, a food pantry. The demo data is built around our FBLA partner, **Robolution CLT**, a Charlotte, NC nonprofit that runs free VEX IQ robotics programs for grades 4–9 at Title I schools.
Built for **FBLA 2026–27 Coding & Programming — "Serving the Community: Nonprofit Volunteer Management."**

Onboard is a **local web app**: a React client and an Express + Prisma ORM 8 + SQLite server, both running on the presenter's laptop and opened in any modern browser at `http://localhost:3000`. No cloud account and nothing to install for users.

## Made for every kind of organization

Each organization chooses its **kind** (STEM & education, Health, Sports & recreation, Community service, Other) when it is created, then tunes everything in **Manage → Organization settings**:

| Setting              | Robolution CLT (STEM) | A free clinic (Health) | A youth league (Sports) |
| -------------------- | --------------------- | ---------------------- | ----------------------- |
| A place it serves    | School                | Clinic                 | Field                   |
| The people it serves | Students              | Patients               | Players                 |
| An equipment item    | Kit                   | Equipment              | Gear bag                |
| Priority flag        | Title I               | Underserved area       | Scholarship site        |
| Served range         | Grades                | none                   | Ages                    |

Menus, forms, filters, rule messages, reports and the help assistant all use these words. Organizations can also switch off **equipment tracking**, **priority sites** and **guest volunteers**, and edit their own **skill catalog** and **event roles** (Judge, Referee… or Screener, Greeter…).

**Scheduling.** A _program_ is something that repeats (a weekly club, a season); a _session_ is one date of it. "Repeat every week" creates a whole season of sessions in one click, and a _one-time event_ (a fundraiser) needs no program at all. Skills can carry a short description that volunteers see when they pick them.

**Two ways in for newcomers.** The sign-in page offers **Create an account** (`/signup`): a permanent account, signed in right away, optionally applying to an organization. It also offers **Volunteer at one event: no account** (`/help-once`): pick an upcoming event an organization opened to guests and give a name, email and phone. Each guest sign-up is for that one event, and the person is stored as a contact who can't sign in. If they create an account later with the same email, it takes over their past events and hours.

**Adding volunteers.** Volunteers → **Add volunteer** adds someone directly (existing accounts are linked; new people get a temporary password to pass on), and **Copy application link** shares the sign-up page (`/signup?org=…`) with your organization preselected. On a session, **Add anyone else** puts any of your volunteers on it.

**Two modes for everyone.** The **Volunteer / Organize** switch at the top of the sidebar is always there. Owners and Admins can volunteer like anyone else. Someone who doesn't run an organization yet and switches to Organize gets an empty page with **Create an organization**.

**Leaving and removing.** Volunteers leave an organization from **Profile → My organizations → Leave**. Admins and Owners remove a volunteer with **Remove from [organization]** on the volunteer's page. Either way, upcoming shifts there are cancelled and waitlisted volunteers move up. Past shifts and hours stay, and so does any role the person holds. They can apply again later.

**Volunteer requirements.** Each organization lists what volunteers must complete before serving: a training, a background check, a TB test, a CPR card, a concussion course. Each item can renew every _N_ months. Every volunteer has a checklist showing **Complete**, **Expiring soon** (within 30 days), **Expired** or **Missing**. Volunteers can't be made Active, or join shifts and events, until their checklist is current.

## Quick start

Requires **Node.js 22.5 or newer** (Prisma 8's SQLite driver uses Node's built-in `node:sqlite`).

```bash
npm install
npm run dev     # development: UI at http://localhost:5173 (hot reload) + API on :3000
npm run demo    # production build, served by Express at http://localhost:3000 — use this for the presentation
```

The first run creates `data/onboard.db`, applies the migrations and loads the demo data. Nothing else to set up; `.env.example` lists the optional settings (`PORT`, `DATABASE_PATH`, `DEMO_MODE`).

| Script                                  | What it does                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `npm start`                             | Applies migrations, then starts Express serving the API and the built UI        |
| `npm test`                              | Vitest: rules, domain algorithms, and API tests against a real temporary SQLite |
| `npm run db:fresh`                      | Deletes the local database, re-migrates and re-seeds                            |
| `npm run db:emit`                       | Regenerates `contract.json` / `contract.d.ts` after editing `contract.prisma`   |
| `npm run db:plan -- --name <change>`    | Plans a migration from the contract change (commit the folder it writes)        |
| `npm run typecheck` · `lint` · `format` | TypeScript, ESLint, Prettier                                                    |

Node prints an `ExperimentalWarning` for `node:sqlite` on startup; it's expected and harmless.

## Roles: one login, many organizations

Roles are **relationships between a person and an organization**, not account types.

- Anyone can **create an organization** and becomes its **Owner**.
- Owners appoint **Admins** and **Coordinators**. Admins appoint Coordinators. Every organization always keeps at least one Owner.
- **Ownership is offered, not given.** An Owner offers it from Team & roles to someone already in the organization (a role holder or a volunteer). The person accepts or declines on their Home page, within 14 days. Nothing changes until they accept. The last Owner steps down by handing over: they stay Owner until the offer is accepted, then step down at that moment.
- Anyone can **volunteer** with any organization. Their standing (Applied → Interviewed → Trained → Active → Inactive, plus that organization's requirements checklist) is tracked **separately in each organization**. Skills and availability live once on the person's profile.
- Sessions marked **Open to everyone** accept a one-time guest sign-up from anyone. It shows up in that person's schedule and hours, but doesn't add the organization to their switcher.

| Capability                                                                           | Coordinator | Admin | Owner |
| ------------------------------------------------------------------------------------ | :---------: | :---: | :---: |
| Sessions, rosters, check-in, hour approval, view volunteers                          |      ✓      |   ✓   |   ✓   |
| Sites & programs, equipment, recruitment, checklists, reports, organization settings |             |   ✓   |   ✓   |
| Appoint Coordinators                                                                 |             |   ✓   |   ✓   |
| Appoint Admins, offer ownership, edit the organization                               |             |       |   ✓   |

### Built for first-time users

The app shows one short menu at a time. A **Volunteer / Organize** switch sits at the top of the sidebar (people who only volunteer never see it):

| Volunteer                                            | Organize (the org picked in the switcher)                     |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| **Home**: your next shift, 3 suggestions, your hours | **Home**: one "Needs your attention" list, one button per row |
| Find a shift                                         | Schedule (Sessions · Calendar · Programs)                     |
| My shifts (List · Calendar)                          | Volunteers (People · New volunteers)                          |
| My hours (and certificates)                          | Hours                                                         |
| Profile (About me · My organizations)                | Reports                                                       |
|                                                      | Settings (Organization · places · equipment · Team & roles)   |

Related screens are tabs under one menu item. App settings, the Help Center and sign-out live in the account menu under your name. One **Help** button explains the current screen and answers questions. Labels use everyday words ("Ready to serve", "3 of 4 spots open", "Needs 2 more volunteers"). Forms show the essentials first, with the rest under "More options". Tables start simple: search, sort and Download. **More tools** turns on the AG Grid Enterprise features (column filters, grouping, pivot, charts).

### Demo logins (fictional data)

| Person        | Email                           | Password        | Roles                                                                                           |
| ------------- | ------------------------------- | --------------- | ----------------------------------------------------------------------------------------------- |
| Alex Morgan   | `alex.morgan@robolutionclt.org` | `Onboard2026`   | Owner of Robolution CLT · Coordinator at Queen City STEM Alliance · active Robolution volunteer |
| Maya Chen     | `maya.chen@example.com`         | `Volunteer2026` | Coordinator at Robolution CLT · volunteer                                                       |
| Jordan Rivera | `jordan.rivera@example.com`     | `Volunteer2026` | Volunteer at Robolution CLT · guest judge at Queen City's scrimmage                             |

The sign-in screen has one-click buttons for all three. Other seeded people include Marcus Johnson (Robolution Admin) and Priya Patel (Owner of Queen City, Robolution volunteer). Demo data is generated **relative to today** and can be restored from **Settings → Reset demo data**.

## Walkthroughs for judging

**Journey A, volunteer (Jordan):** Home → _I'm here — check in_ (today's "Open Build Lab") → _Suggested for you_ → Sign up → My shifts → My hours → download the Robolution certificate.

**Journey B, manager (Alex):** Home → _Needs your attention_ → "Eastway needs 3 more volunteers" → _Find volunteers_ → Assign → back on Home, _Approve_ hours inline → Reports → _Sponsor impact_ → Export PDF.

**Journey C, multi-org (Alex):** org switcher → Queen City STEM Alliance (now a Coordinator, so the menu shrinks) → Settings → Team & roles (read-only) → switch back → appoint a Coordinator → switch to **Volunteer** to see Alex's own shifts.

## How Onboard meets the prompt

| Prompt       | Features                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Recruit**  | Public application (choose an org) · pipeline per org · requirements checklists with renewals · one-click applications to more orgs · re-engagement alerts          |
| **Organize** | Organizations with their own words, roles and settings · sites, programs, shifts and events · sign-ups, waitlists, guest events · volunteer matching · calendars    |
| **Manage**   | One identity across orgs · profiles and availability · check-in/out · hour approval (never your own) · equipment inventory · 8 format + 14 meaning validation rules |
| **Monitor**  | Staffing-risk alerts · custom report builder · PDF/CSV export · per-org service certificates · role-aware help assistant                                            |

The same mapping appears in the app on **FBLA challenge**.

## Architecture

```
Browser (http://localhost:3000)
   │  same origin · httpOnly session cookie
   ▼
Express 5 (Node, bound to 127.0.0.1)
   ├─ helmet (CSP, no framing) · JSON-only bodies · same-origin check · login rate limit
   ├─ serves dist/ + falls back to index.html
   └─ /api/* → route → service → repository → Prisma ORM 8 → SQLite (data/onboard.db)
```

**How a request flows.** A route is one line that names a service function. `read` routes run against an in-memory snapshot of the whole dataset (one nonprofit is a few hundred rows, so matching, risk scoring and reports run in microseconds). `write` routes run the service on a copy of that snapshot, then the unit of work compares the copy with the original and writes only the changed rows through Prisma, all in **one transaction**. If a rule or permission check fails, nothing is written. Writes are queued one at a time, which is safe and simple for a single laptop.

```
server/
  index.ts                  entry: open DB, seed on first run, listen on 127.0.0.1 (next free port if busy)
  app.ts                    Express app: security headers, /api router, static UI + SPA fallback
  config.ts                 PORT, DATABASE_PATH, DEMO_MODE, session length, bcrypt cost
  store.ts                  cached snapshot for reads, serialized transactional writes
  routes/                   every endpoint of contract.ts, one line each; query-string parsing
  middleware/               session cookie → user, same-origin guard, rate limits, error handler
  services/                 business logic: accounts, orgs, settings + requirements, volunteers, catalog, sessions, hours, insights
  repositories/             tables.ts (row ↔ domain mapping), snapshotRepository (load + unit of work), authRepository
  prisma/
    contract.prisma         the data model (Prisma 8 contract; 23 tables)
    contract.json/.d.ts     emitted by `npm run db:emit`
    migrations/             committed migration plans, applied by `prisma db migrate`
    db.ts · seed.ts         Prisma client · demo seeding and reset
prisma.config.ts            Prisma CLI config (contract, database file, migrations folder)
client/src/
  app/ pages/ components/   shell, org switcher, guarded routes, one file per screen, UI kit, DataGrid (AG Grid)
  features/ context/ hooks/ assistant, tour, matching, sessions · Auth, Org, Accessibility · useAsync, useForm
  lib/api/contract.ts       ← the API contract (every method lists its REST route)
  lib/api/httpApi.ts        the API client used by the UI (same-origin /api, cookies)
shared/                     used by BOTH the client and the server
  enums.ts types/ schemas/  OrgRole, entities, Zod format rules (V-F1…V-F8)
  permissions.ts rules.ts   org-scoped permission matrix · semantic rules V-S1…V-S14
  terms.ts                  sector defaults and each org's words (School/Clinic/Field…)
  domain/                   matching, risk, reports, assistant, requirements, views (pure functions on a DataSnapshot)
  demo/seed.ts              deterministic demo data (bcrypt on the server, a fast hash in tests)
tests/                      Vitest unit tests + tests/api (supertest against Express + Prisma)
```

**Security in short.** Passwords are bcrypt-hashed. The session token is 256 random bits in an httpOnly, SameSite=Strict cookie; the database stores only its SHA-256 hash. A sign-in ends after 8 hours without activity (working keeps it going) and never lasts more than 30 days. If it ends mid-task, a "Please sign in again" dialog asks for the password over the same screen, so nothing typed is lost, and the new-organization wizard also keeps a draft in the browser tab. Creating an organization saves the org and every wizard choice in one all-or-nothing request. Resetting the demo keeps everyone in the demo data signed in. Every management endpoint checks the person's Membership **in that organization**, so an Owner of one org has no rights in another. All input is validated on the server with the same Zod schemas the forms use. Errors return `{ code, message, field }` with no stack traces.

### Data grid (Volunteers)

The Volunteers page uses **AG Grid Enterprise** through one reusable wrapper, `client/src/components/DataGrid.tsx`. It starts simple (quick search, sorting, Download). **More tools** adds per-column filters (set, text, number, date), drag-to-group, pivot mode with sums and averages, cell-range charts (select cells, then right-click → Chart), Excel and CSV export (all rows or only the selected ones), and expandable detail rows. Your layout is remembered per browser. Rows come from `GET /api/orgs/:orgId/volunteers/metrics`. Without a license key in `VITE_AG_GRID_LICENSE_KEY` the grid shows an evaluation watermark (see [`docs/credits.md`](docs/credits.md)).

## Accessibility

WCAG 2.1 AA target:

- Light, dark and high-contrast themes; text scaling to 150%; the Atkinson Hyperlegible dyslexia-friendly font; reduced motion.
- Skip link, visible focus rings, and labeled fields whose errors are announced via `aria-live`.
- Status is always shown as icon + text + color.
- Keyboard-only operation (F1 = help for this screen, `/` = search).
- Responsive down to phone width.

## Credits & licenses

See [`docs/credits.md`](docs/credits.md).
