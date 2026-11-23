/**
 * @file The REST API, one line per endpoint in `client/src/lib/api/contract.ts`.
 *
 * Layering (§2.7): route (here) → middleware (session, same-origin, rate limits) → service
 * (business rules + org-scoped permissions) → repository (Prisma) → SQLite.
 *
 * URL scheme (§2.5):
 *   /api/auth/…, /api/public/…        signing in, creating an account, one-time guest help
 *   /api/me/…                         the signed-in person, across every org
 *   /api/orgs/:orgId/…                management of one org (Membership required)
 *   /api/sites|programs|sessions|signups|hours|items/:id/…
 *                                     an entity by id; its org is looked up and checked
 */
import { Router } from 'express';
import { config } from '../config';
import { applyLimiter, clearSessionCookie, loginLimiter, setSessionCookie } from '../middleware';
import { createSession, deleteSession } from '../repositories/authRepository';
import { reseed } from '../prisma/seed';
import * as account from '../services/accountService';
import * as catalog from '../services/catalogService';
import { currentUser } from '../services/context';
import * as guests from '../services/guestService';
import * as hours from '../services/hourService';
import * as ownership from '../services/ownershipService';
import * as insight from '../services/insightService';
import * as orgs from '../services/orgService';
import * as sessions from '../services/sessionService';
import * as settings from '../services/settingsService';
import * as volunteers from '../services/volunteerService';
import { AppError } from '@shared/errors';
import type { Store } from '../store';
import {
  body,
  handlers,
  hourQuery,
  includeArchived,
  limitOf,
  param,
  sessionFilters,
  volunteerQuery,
} from './handlers';

/**
 * Builds the API router.
 * @param store - Data store.
 * @returns Router mounted at `/api`.
 */
export function apiRouter(store: Store): Router {
  const r = Router();
  const { read, write } = handlers(store);
  const db = store.db;

  // ---- Health ----
  r.get('/health', async (_req, res) => {
    const data = await store.current();
    res.json({ ok: true, organizations: data.organizations.length, demoMode: config.demoMode });
  });

  // ---- Auth (FR-1) ----
  r.post('/auth/login', loginLimiter(), async (req, res) => {
    const user = await store.read((data) => account.verifyLogin(data, req.body));
    const { token, expiresAt } = await createSession(db, user.id);
    setSessionCookie(res, token, expiresAt);
    // The token travels only in the httpOnly cookie; it is never exposed to JavaScript.
    res.json({ user, token: '' });
  });
  r.get('/auth/me', async (req, res) => {
    const data = await store.current();
    const stored = req.userId ? data.users.find((u) => u.id === req.userId) : undefined;
    res.json(stored ? currentUser(data, stored.id) : null);
  });
  r.post('/auth/logout', async (req, res) => {
    if (req.sessionToken) await deleteSession(db, req.sessionToken);
    clearSessionCookie(res);
    res.status(204).end();
  });

  // ---- Public (no sign-in) ----
  r.get('/public/orgs', async (_req, res) => res.json(await store.read(account.publicOrgs)));
  // Creating an account signs the person in right away.
  r.post('/public/applications', applyLimiter(), async (req, res) => {
    const user = await store.write((draft) => account.apply(draft, req.body));
    const { token, expiresAt } = await createSession(db, user.id);
    setSessionCookie(res, token, expiresAt);
    res.status(201).json(user);
  });
  // One-time help without an account (FR-4c).
  r.get('/public/guest-sessions', async (_req, res) =>
    res.json(await store.read(guests.guestSessions)),
  );
  r.post('/public/guest-signups', applyLimiter(), async (req, res) =>
    res.status(201).json(await store.write((draft) => guests.guestSignUp(draft, req.body))),
  );

  // ---- Me: the signed-in person, across orgs ----
  r.post(
    '/me/tour-complete',
    write((d, me) => account.completeTour(d, me)),
  );
  r.get(
    '/me/orgs',
    read((d, me) => orgs.myOrgs(d, me)),
  );
  r.get(
    '/me/profile',
    read((d, me) => account.myProfile(d, me)),
  );
  r.put(
    '/me/profile',
    write((d, me, req) => account.updateProfile(d, me, req.body)),
  );
  r.get(
    '/me/sessions/open',
    read((d, me, req) => sessions.browseSessions(d, me, sessionFilters(req))),
  );
  r.get(
    '/me/signups',
    read((d, me) => sessions.mySignUps(d, me)),
  );
  r.get(
    '/me/hours',
    read((d, me) => hours.myHours(d, me)),
  );
  r.post(
    '/me/hours',
    write((d, me, req) => hours.createHourLog(d, me, req.body), 201),
  );
  r.get(
    '/me/recommended-sessions',
    read((d, me, req) => insight.recommendForMe(d, me, limitOf(req))),
  );
  r.get(
    '/me/filter-presets',
    read((d, me) => insight.listPresets(d, me)),
  );
  r.post(
    '/me/filter-presets',
    write((d, me, req) => insight.savePreset(d, me, body(req).name, body(req).filters), 201),
  );
  r.delete(
    '/me/filter-presets/:id',
    write((d, me, req) => insight.removePreset(d, me, param(req, 'id'))),
  );

  // ---- Organizations (FR-2, FR-3c) ----
  r.get(
    '/orgs',
    read((d, me) => orgs.directory(d, me)),
  );
  r.post(
    '/orgs',
    write((d, me, req) => orgs.createOrg(d, me, req.body), 201),
  );
  r.post(
    '/orgs/:orgId/volunteers/me',
    write((d, me, req) => orgs.joinAsVolunteer(d, me, param(req, 'orgId')), 201),
  );
  // Leaving: ends your own volunteer place (a role there stays).
  r.delete(
    '/orgs/:orgId/volunteers/me',
    write((d, me, req) => volunteers.leaveOrg(d, me, param(req, 'orgId'))),
  );
  r.get(
    '/orgs/:orgId/members',
    read((d, me, req) => orgs.members(d, me, param(req, 'orgId'))),
  );
  r.post(
    '/orgs/:orgId/members',
    write((d, me, req) => orgs.appoint(d, me, param(req, 'orgId'), req.body), 201),
  );
  // Ownership offers (FR-3f): nobody becomes an Owner without accepting.
  r.get(
    '/orgs/:orgId/ownership-offers',
    read((d, me, req) => ownership.orgOffers(d, me, param(req, 'orgId'))),
  );
  r.post(
    '/orgs/:orgId/ownership-offers',
    write((d, me, req) => ownership.offerOwnership(d, me, param(req, 'orgId'), req.body), 201),
  );
  r.get(
    '/me/ownership-offers',
    read((d, me) => ownership.myOffers(d, me)),
  );
  r.post(
    '/ownership-offers/:offerId/accept',
    write((d, me, req) => ownership.answerOffer(d, me, param(req, 'offerId'), true)),
  );
  r.post(
    '/ownership-offers/:offerId/decline',
    write((d, me, req) => ownership.answerOffer(d, me, param(req, 'offerId'), false)),
  );
  r.delete(
    '/ownership-offers/:offerId',
    write((d, me, req) => ownership.withdrawOffer(d, me, param(req, 'offerId'))),
  );
  // Before the `:membershipId` routes, so "me" isn't read as an id.
  r.post(
    '/orgs/:orgId/members/me/step-down',
    write((d, me, req) => orgs.stepDown(d, me, param(req, 'orgId'))),
  );
  r.put(
    '/orgs/:orgId/members/:membershipId',
    write((d, me, req) =>
      orgs.changeRole(d, me, param(req, 'orgId'), param(req, 'membershipId'), body(req).orgRole),
    ),
  );
  r.delete(
    '/orgs/:orgId/members/:membershipId',
    write((d, me, req) =>
      orgs.removeMember(d, me, param(req, 'orgId'), param(req, 'membershipId')),
    ),
  );

  // ---- Organization settings and requirements (Phases 2 and 3) ----
  r.put(
    '/orgs/:orgId/settings',
    write((d, me, req) => settings.updateSettings(d, me, param(req, 'orgId'), req.body)),
  );
  r.get(
    '/orgs/:orgId/requirements',
    read((d, _me, req) => settings.listRequirements(d, param(req, 'orgId'))),
  );
  r.post(
    '/orgs/:orgId/requirements',
    write((d, me, req) => settings.createRequirement(d, me, param(req, 'orgId'), req.body), 201),
  );
  r.put(
    '/requirements/:id',
    write((d, me, req) => settings.updateRequirement(d, me, param(req, 'id'), req.body)),
  );
  r.post(
    '/requirements/:id/move',
    write((d, me, req) => settings.moveRequirement(d, me, param(req, 'id'), body(req).direction)),
  );
  r.delete(
    '/requirements/:id',
    write((d, me, req) => settings.archiveRequirement(d, me, param(req, 'id'))),
  );

  // ---- An org's volunteers (FR-5, FR-6, FR-8) ----
  r.get(
    '/orgs/:orgId/volunteers',
    read((d, me, req) =>
      volunteers.listVolunteers(d, me, param(req, 'orgId'), volunteerQuery(req)),
    ),
  );
  r.post(
    '/orgs/:orgId/volunteers',
    write((d, me, req) => volunteers.addVolunteer(d, me, param(req, 'orgId'), req.body), 201),
  );
  // Registered before `/:userId` so "metrics" isn't read as a person id.
  r.get(
    '/orgs/:orgId/volunteers/metrics',
    read((d, me, req) => volunteers.volunteerMetrics(d, me, param(req, 'orgId'))),
  );
  r.delete(
    '/orgs/:orgId/volunteers/:userId',
    write((d, me, req) =>
      volunteers.removeVolunteer(d, me, param(req, 'orgId'), param(req, 'userId')),
    ),
  );
  r.get(
    '/orgs/:orgId/volunteers/:userId',
    read((d, me, req) => volunteers.getVolunteer(d, me, param(req, 'orgId'), param(req, 'userId'))),
  );
  r.post(
    '/orgs/:orgId/volunteers/:userId/status',
    write((d, me, req) =>
      volunteers.setStatus(
        d,
        me,
        param(req, 'orgId'),
        param(req, 'userId'),
        body(req).status,
        body(req).note,
      ),
    ),
  );
  // Requirements checklist (Phase 3): record or clear one completion.
  r.put(
    '/orgs/:orgId/volunteers/:userId/requirements/:requirementId',
    write((d, me, req) =>
      volunteers.recordCompletion(
        d,
        me,
        param(req, 'orgId'),
        param(req, 'userId'),
        param(req, 'requirementId'),
        req.body,
      ),
    ),
  );
  r.delete(
    '/orgs/:orgId/volunteers/:userId/requirements/:requirementId',
    write((d, me, req) =>
      volunteers.clearCompletion(
        d,
        me,
        param(req, 'orgId'),
        param(req, 'userId'),
        param(req, 'requirementId'),
      ),
    ),
  );
  r.get(
    '/orgs/:orgId/volunteers/:userId/signups',
    read((d, me, req) =>
      sessions.signUpsForVolunteer(d, me, param(req, 'orgId'), param(req, 'userId')),
    ),
  );

  // ---- An org's catalog, schedule, hours and insights ----
  r.get(
    '/orgs/:orgId/sites',
    read((d, me, req) => catalog.listSites(d, me, param(req, 'orgId'), includeArchived(req))),
  );
  r.post(
    '/orgs/:orgId/sites',
    write((d, me, req) => catalog.createSite(d, me, param(req, 'orgId'), req.body), 201),
  );
  r.get(
    '/orgs/:orgId/programs',
    read((d, me, req) => catalog.listPrograms(d, me, param(req, 'orgId'), includeArchived(req))),
  );
  r.get(
    '/orgs/:orgId/sessions',
    read((d, me, req) => sessions.listSessions(d, me, param(req, 'orgId'), sessionFilters(req))),
  );
  r.get(
    '/orgs/:orgId/hours',
    read((d, me, req) => hours.listHours(d, me, param(req, 'orgId'), hourQuery(req))),
  );
  r.get(
    '/orgs/:orgId/equipment',
    read((d, me, req) => catalog.listEquipment(d, me, param(req, 'orgId'))),
  );
  r.post(
    '/orgs/:orgId/equipment',
    write((d, me, req) => catalog.createEquipment(d, me, param(req, 'orgId'), req.body), 201),
  );
  r.get(
    '/orgs/:orgId/alerts/staffing',
    read((d, me, req) => insight.staffingRisks(d, me, param(req, 'orgId'))),
  );
  r.get(
    '/orgs/:orgId/alerts/inactivity',
    read((d, me, req) => insight.inactivity(d, me, param(req, 'orgId'))),
  );
  r.post(
    '/orgs/:orgId/reports/run',
    read((d, me, req) => insight.report(d, me, param(req, 'orgId'), req.body)),
  );
  r.get(
    '/orgs/:orgId/dashboard',
    read((d, me, req) => insight.dashboard(d, me, param(req, 'orgId'))),
  );

  // ---- Sites & programs by id (FR-9, FR-10) ----
  r.put(
    '/sites/:id',
    write((d, me, req) => catalog.updateSite(d, me, param(req, 'id'), req.body)),
  );
  r.delete(
    '/sites/:id',
    write((d, me, req) => catalog.removeSite(d, me, param(req, 'id'))),
  );
  r.post(
    '/sites/:id/archive',
    write((d, me, req) => catalog.toggleSiteArchive(d, me, param(req, 'id'))),
  );
  r.post(
    '/programs',
    write((d, me, req) => catalog.createProgram(d, me, req.body), 201),
  );
  r.put(
    '/programs/:id',
    write((d, me, req) => catalog.updateProgram(d, me, param(req, 'id'), req.body)),
  );
  r.delete(
    '/programs/:id',
    write((d, me, req) => catalog.removeProgram(d, me, param(req, 'id'))),
  );
  r.post(
    '/programs/:id/archive',
    write((d, me, req) => catalog.toggleProgramArchive(d, me, param(req, 'id'))),
  );

  // ---- Sessions & sign-ups (FR-11–FR-16, FR-22) ----
  r.post(
    '/sessions',
    write((d, me, req) => sessions.createSession(d, me, req.body), 201),
  );
  r.post(
    '/sessions/bulk',
    write((d, me, req) => sessions.createRepeatingSessions(d, me, req.body), 201),
  );
  r.get(
    '/sessions/:id',
    read((d, me, req) => sessions.getSession(d, me, param(req, 'id'))),
  );
  r.put(
    '/sessions/:id',
    write((d, me, req) => sessions.updateSession(d, me, param(req, 'id'), req.body)),
  );
  r.post(
    '/sessions/:id/cancel',
    write((d, me, req) => sessions.cancelSession(d, me, param(req, 'id'))),
  );
  r.post(
    '/sessions/:id/signups',
    write((d, me, req) => sessions.signUp(d, me, param(req, 'id'), body(req).role), 201),
  );
  r.post(
    '/sessions/:id/assign',
    write(
      (d, me, req) => sessions.assign(d, me, param(req, 'id'), body(req).userId, body(req).role),
      201,
    ),
  );
  r.get(
    '/sessions/:id/recommendations',
    read((d, me, req) => insight.recommend(d, me, param(req, 'id'), limitOf(req))),
  );
  r.post(
    '/signups/:id/cancel',
    write((d, me, req) => sessions.cancelSignUp(d, me, param(req, 'id'))),
  );
  r.post(
    '/signups/:id/check-in',
    write((d, me, req) => sessions.checkIn(d, me, param(req, 'id'))),
  );
  r.post(
    '/signups/:id/check-out',
    write((d, me, req) => sessions.checkOut(d, me, param(req, 'id'))),
  );
  r.post(
    '/signups/:id/no-show',
    write((d, me, req) => sessions.markNoShow(d, me, param(req, 'id'))),
  );

  // ---- Hours (FR-19) & items (V-S10) by id ----
  r.post(
    '/hours/:id/review',
    write((d, me, req) =>
      hours.reviewHours(d, me, param(req, 'id'), body(req).status, body(req).note),
    ),
  );
  r.post(
    '/equipment/:id/checkout',
    write((d, me, req) => catalog.checkOutEquipment(d, me, param(req, 'id'), body(req).programId)),
  );
  r.post(
    '/equipment/:id/return',
    write((d, me, req) => catalog.returnEquipment(d, me, param(req, 'id'))),
  );

  // ---- Assistant (FR-23) ----
  r.post(
    '/assistant/ask',
    read((d, me, req) => insight.ask(d, me, body(req).question, body(req).orgId)),
  );

  // ---- Meta ----
  r.get('/meta/skills', async (_req, res) => res.json(await store.read(insight.skills)));
  r.post('/meta/reset-demo', async (req, res) => {
    if (!config.demoMode) throw new AppError('NOT_FOUND', "That API endpoint doesn't exist.");
    const me = await store.read((data) => currentUser(data, req.userId));
    await store.exclusive((client) => reseed(client));
    // Everyone who is still in the demo data stays signed in, in this browser and others.
    const stillHere = (await store.current()).users.some(
      (u) => u.email.toLowerCase() === me.email.toLowerCase(),
    );
    if (!stillHere) clearSessionCookie(res);
    res.status(204).end();
  });

  return r;
}
