/**
 * @file API tests: the real Express app and Prisma 8 on a temporary, seeded SQLite database.
 *
 * Covers the guarantees the requirements doc promises: cookie sessions, org-scoped permissions,
 * validation and rule errors with friendly messages, the waitlist, one-time guests, no
 * self-approval of hours, every org keeping an Owner, and data surviving a restart.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '@shared/terms';
import { addDays, todayIso } from '@shared/time';
import type {
  MemberView,
  MyProfile,
  OrgAffiliation,
  Organization,
  Program,
  Site,
  SessionView,
  Volunteer,
} from '@shared/types';
import { createApp } from '../../server/app';
import { createDb } from '../../server/prisma/db';
import { Store } from '../../server/store';
import { startServer, type TestServer } from './harness';

let srv: TestServer;
beforeEach(async () => {
  srv = await startServer();
});
afterEach(async () => {
  await srv.close();
});

/**
 * Looks up an org id by name through the public endpoint.
 * @param name - Org name.
 * @returns Its id.
 */
async function orgId(name: string): Promise<string> {
  const res = await request(srv.app).get('/api/public/orgs').expect(200);
  return (res.body as Organization[]).find((o) => o.name === name)!.id;
}

/**
 * A public application that is available all week, so availability never blocks a sign-up.
 * @param email - Applicant email.
 * @param org - Org to apply to.
 * @returns Request body.
 */
const application = (email: string, org: string) => ({
  firstName: 'Test',
  lastName: email.split('@')[0],
  email,
  phone: '(704) 555-0199',
  affiliation: 'UNC Charlotte',
  zip: '28223',
  skills: ['Python'],
  availability: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    dayOfWeek: d,
    startTime: '00:00',
    endTime: '23:59',
  })),
  experienceLevel: 'INTERMEDIATE',
  hasTransportation: true,
  bio: '',
  orgId: org,
  password: 'Onboard2026x',
});

/**
 * Applies and signs in a new person.
 * @param email - Email.
 * @param org - Org to apply to.
 * @returns A cookie-keeping agent.
 */
async function newPerson(email: string, org: string) {
  await request(srv.app).post('/api/public/applications').send(application(email, org)).expect(201);
  const agent = request.agent(srv.app);
  await agent.post('/api/auth/login').send({ email, password: 'Onboard2026x' }).expect(200);
  return agent;
}

describe('sign-in', () => {
  it('sets an httpOnly, SameSite=Strict cookie and restores the session', async () => {
    const agent = request.agent(srv.app);
    const res = await agent
      .post('/api/auth/login')
      .send({ email: 'alex.morgan@robolutionclt.org', password: 'Onboard2026' })
      .expect(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/onboard_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.token).toBe('');
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.email).toBe('alex.morgan@robolutionclt.org');
    await agent.post('/api/auth/logout').expect(204);
    expect((await agent.get('/api/auth/me').expect(200)).body).toBeNull();
  });

  it('gives the same answer for an unknown email and a wrong password', async () => {
    const wrong = await request(srv.app)
      .post('/api/auth/login')
      .send({ email: 'alex.morgan@robolutionclt.org', password: 'not-it-123' })
      .expect(401);
    const unknown = await request(srv.app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'not-it-123' })
      .expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('refuses personal endpoints without a session', async () => {
    const res = await request(srv.app).get('/api/me/orgs').expect(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rate-limits repeated sign-in attempts', async () => {
    const app = createApp(srv.store);
    for (let i = 0; i < 10; i++)
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'x@example.com', password: 'wrong-pass-1' });
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'x@example.com', password: 'wrong-pass-1' })
      .expect(403);
  });
});

describe('staying signed in', () => {
  const HOUR = 3_600_000;
  const start = new Date('2026-11-20T15:00:00Z').getTime();
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Moves the clock the server sees.
   * @param ms - Milliseconds after the start.
   */
  const at = (ms: number) => vi.setSystemTime(start + ms);

  it('activity keeps a sign-in going and refreshes the cookie', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at(0);
    const alex = await srv.as('owner');
    // Within 15 minutes of the last extension: no new cookie.
    at(10 * 60_000);
    const quiet = await alex.get('/api/me/orgs').expect(200);
    expect(quiet.headers['set-cookie']).toBeUndefined();
    // Seven hours in: still signed in, and the cookie now runs 8 hours from here.
    at(7 * HOUR);
    const renewed = await alex.get('/api/me/orgs').expect(200);
    expect(String(renewed.headers['set-cookie'])).toMatch(/onboard_session=/);
    // Fourteen hours after signing in, but only seven since the last activity.
    at(14 * HOUR);
    await alex.get('/api/me/orgs').expect(200);
  });

  it('ends after 8 hours without activity', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at(0);
    const alex = await srv.as('owner');
    at(8 * HOUR + 60_000);
    const res = await alex.get('/api/me/orgs').expect(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED' });
    expect((await alex.get('/api/auth/me').expect(200)).body).toBeNull();
  });

  it('never lasts more than 30 days, however active', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at(0);
    const alex = await srv.as('owner');
    // Active every 7 hours for 30 days, so it never sits idle long enough to end that way.
    for (let hour = 0; hour <= 714; hour += 7) {
      at(hour * HOUR);
      await alex.get('/api/me/orgs').expect(200);
    }
    at(719 * HOUR);
    await alex.get('/api/me/orgs').expect(200);
    // 30 days and a minute: 6 hours since the last activity, but past the limit.
    at(30 * 24 * HOUR + 60_000);
    await alex.get('/api/me/orgs').expect(401);
  });

  it('resetting the demo keeps everyone else signed in', async () => {
    const alex = await srv.as('owner');
    const maya = await srv.as('coordinator');
    await alex.post('/api/meta/reset-demo').expect(204);
    await maya.get('/api/me/orgs').expect(200);
    await alex.get('/api/me/orgs').expect(200);
  });

  it('resetting the demo signs out people who are not in the demo data', async () => {
    const robolution = await orgId('Robolution CLT');
    const newcomer = await newPerson('newcomer@example.com', robolution);
    const alex = await srv.as('owner');
    await alex.post('/api/meta/reset-demo').expect(204);
    await newcomer.get('/api/me/orgs').expect(401);
  });
});

describe('org-scoped permissions', () => {
  it('lists each org with the role the person holds there', async () => {
    const alex = await srv.as('owner');
    const orgs = (await alex.get('/api/me/orgs').expect(200)).body as OrgAffiliation[];
    const roles = Object.fromEntries(orgs.map((a) => [a.org.name, a.role]));
    expect(roles).toMatchObject({
      'Robolution CLT': 'OWNER',
      'Queen City STEM Alliance': 'COORDINATOR',
    });
  });

  it('a Coordinator can view but not edit sites; Owner rank elsewhere grants nothing', async () => {
    const alex = await srv.as('owner');
    const qc = await orgId('Queen City STEM Alliance');
    await alex.get(`/api/orgs/${qc}/sites`).expect(200);
    const res = await alex
      .post(`/api/orgs/${qc}/sites`)
      .send({
        name: 'Should Not Exist',
        address: '1 Main St',
        zip: '28202',
        priority: false,
        rangeMin: 4,
        rangeMax: 8,
        contactName: 'Pat Lee',
        contactEmail: 'pat@example.org',
      })
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('a volunteer cannot open management endpoints', async () => {
    const jordan = await srv.as('volunteer');
    const rob = await orgId('Robolution CLT');
    await jordan.get(`/api/orgs/${rob}/volunteers`).expect(403);
    await jordan.get(`/api/orgs/${rob}/dashboard`).expect(403);
  });

  it('a Coordinator cannot appoint Admins', async () => {
    const maya = await srv.as('coordinator');
    const rob = await orgId('Robolution CLT');
    await maya
      .post(`/api/orgs/${rob}/members`)
      .send({ email: 'jordan.rivera@example.com', orgRole: 'ADMIN' })
      .expect(403);
  });
});

describe('validation and rules', () => {
  it('returns field errors from the shared Zod schema', async () => {
    const alex = await srv.as('owner');
    const rob = await orgId('Robolution CLT');
    const res = await alex.post(`/api/orgs/${rob}/sites`).send({ name: '' }).expect(400);
    expect(res.body.code).toBe('VALIDATION');
    expect(Object.keys(res.body.fieldErrors)).toEqual(expect.arrayContaining(['name', 'zip']));
  });

  it('rejects a non-JSON body and an unknown endpoint', async () => {
    const alex = await srv.as('owner');
    await alex.post('/api/orgs').set('Content-Type', 'text/plain').send('name=x').expect(400);
    await alex.get('/api/nope').expect(404);
  });

  it('refuses cross-site requests', async () => {
    const alex = await srv.as('owner');
    await alex.post('/api/me/tour-complete').set('Origin', 'https://evil.example').expect(403);
  });

  it('refuses a duplicate application email (V-S12)', async () => {
    const rob = await orgId('Robolution CLT');
    const res = await request(srv.app)
      .post('/api/public/applications')
      .send(application('maya.chen@example.com', rob))
      .expect(422);
    expect(res.body.code).toBe('RULE_VIOLATION');
  });
});

describe('members', () => {
  it('every org keeps at least one Owner', async () => {
    const maya = await srv.as('coordinator');
    const org = (
      await maya
        .post('/api/orgs')
        .send({
          name: 'Test Robotics Club',
          description: 'A test org.',
          timezone: 'America/New_York',
          sector: 'STEM',
        })
        .expect(201)
    ).body as Organization;
    const members = (await maya.get(`/api/orgs/${org.id}/members`).expect(200)).body;
    expect(members).toHaveLength(1);
    expect(members[0].membership.orgRole).toBe('OWNER');
    await maya.delete(`/api/orgs/${org.id}/members/${members[0].membership.id}`).expect(422);
    await maya
      .put(`/api/orgs/${org.id}/members/${members[0].membership.id}`)
      .send({ orgRole: 'ADMIN' })
      .expect(422);
  });
});

describe('organization settings and requirements (Phases 2 and 3)', () => {
  it('a new org starts from its sector’s words; only Admins and up change them', async () => {
    const maya = await srv.as('coordinator');
    const clinic = (
      await maya
        .post('/api/orgs')
        .send({
          name: 'Eastside Free Clinic',
          description: 'Walk-in care on Saturdays.',
          timezone: 'America/New_York',
          sector: 'HEALTH',
        })
        .expect(201)
    ).body as Organization;
    expect(clinic.settings.siteTerm).toBe('Clinic');
    expect(clinic.settings.participantTerm).toBe('Patients');
    expect(clinic.settings.rangeKind).toBe('NONE');

    const updated = (
      await maya
        .put(`/api/orgs/${clinic.id}/settings`)
        .send({ ...clinic.settings, siteTerm: 'Location', skills: ['Triage', 'Interpreting'] })
        .expect(200)
    ).body as Organization;
    expect(updated.settings.siteTerm).toBe('Location');
    expect(updated.settings.skills).toEqual(['Triage', 'Interpreting']);

    // Duplicate skills are refused with a field error.
    await maya
      .put(`/api/orgs/${clinic.id}/settings`)
      .send({ ...clinic.settings, skills: ['Triage', 'triage'] })
      .expect(400);

    // Maya is only a Coordinator at Robolution: settings are off limits there.
    const rob = await orgId('Robolution CLT');
    const robOrg = (await request(srv.app).get('/api/public/orgs').expect(200)).body.find(
      (o: Organization) => o.id === rob,
    ) as Organization;
    await maya.put(`/api/orgs/${rob}/settings`).send(robOrg.settings).expect(403);
  });

  it('a new requirement blocks activation until it is recorded, and can expire', async () => {
    const alex = await srv.as('owner');
    const rob = await orgId('Robolution CLT');
    const before = (await alex.get(`/api/orgs/${rob}/requirements`).expect(200)).body;
    expect(before.map((r: { name: string }) => r.name)).toEqual([
      'Volunteer training',
      'Background check',
      'Youth protection course',
    ]);
    const added = (
      await alex
        .post(`/api/orgs/${rob}/requirements`)
        .send({ name: 'Concussion awareness', description: 'Online course.', validMonths: 12 })
        .expect(201)
    ).body as { id: string };
    await alex
      .post(`/api/orgs/${rob}/requirements`)
      .send({ name: 'concussion awareness', description: '' })
      .expect(409);

    // An applicant can't be made ACTIVE while anything on the checklist is outstanding.
    const applicant = await newPerson('check.list@example.com', rob);
    const me = (await applicant.get('/api/me/profile').expect(200)).body as MyProfile;
    for (const status of ['INTERVIEWED', 'TRAINED'])
      await alex.post(`/api/orgs/${rob}/volunteers/${me.id}/status`).send({ status }).expect(200);
    const refused = await alex
      .post(`/api/orgs/${rob}/volunteers/${me.id}/status`)
      .send({ status: 'ACTIVE' })
      .expect(422);
    expect(refused.body.message).toMatch(/Concussion awareness/);

    for (const r of [...before, added]) {
      await alex
        .put(`/api/orgs/${rob}/volunteers/${me.id}/requirements/${r.id}`)
        .send({ completedAt: todayIso() })
        .expect(200);
    }
    const cleared = (await alex.get(`/api/orgs/${rob}/volunteers/${me.id}`).expect(200)).body;
    expect(cleared.cleared).toBe(true);
    const concussion = cleared.requirements.find(
      (c: { requirement: { id: string } }) => c.requirement.id === added.id,
    );
    expect(concussion.state).toBe('COMPLETE');
    expect(concussion.expiresAt).toBeTruthy();
    await alex
      .post(`/api/orgs/${rob}/volunteers/${me.id}/status`)
      .send({ status: 'ACTIVE' })
      .expect(200);

    // A completion from long ago has expired.
    await alex
      .put(`/api/orgs/${rob}/volunteers/${me.id}/requirements/${added.id}`)
      .send({ completedAt: addDays(todayIso(), -400) })
      .expect(200);
    const lapsed = (await alex.get(`/api/orgs/${rob}/volunteers/${me.id}`).expect(200)).body;
    expect(lapsed.cleared).toBe(false);

    // Archiving the requirement takes it off everyone's checklist.
    await alex.delete(`/api/requirements/${added.id}`).expect(204);
    const after = (await alex.get(`/api/orgs/${rob}/volunteers/${me.id}`).expect(200)).body;
    expect(after.cleared).toBe(true);
  });
});

describe('ownership offers and stepping down', () => {
  type Agent = Awaited<ReturnType<TestServer['as']>>;
  /**
   * An org's members as sorted "First:ROLE" strings.
   * @param who - Agent who can see them.
   * @param org - Org id.
   * @returns The list.
   */
  const roles = async (who: Agent, org: string) =>
    ((await who.get(`/api/orgs/${org}/members`).expect(200)).body as MemberView[])
      .map((m) => `${m.user.firstName}:${m.membership.orgRole}`)
      .sort();
  /**
   * A person's user id, from their own session.
   * @param who - Agent.
   * @returns The id.
   */
  const idOf = async (who: Agent) => (await who.get('/api/auth/me').expect(200)).body.id as string;

  it('nobody is made an Owner directly', async () => {
    const alex = await srv.as('owner');
    const rob = await orgId('Robolution CLT');
    const maya = (await alex.get(`/api/orgs/${rob}/members`).expect(200)).body.find(
      (m: MemberView) => m.user.firstName === 'Maya',
    ) as MemberView;
    await alex
      .put(`/api/orgs/${rob}/members/${maya.membership.id}`)
      .send({ orgRole: 'OWNER' })
      .expect(422);
    await alex
      .post(`/api/orgs/${rob}/members`)
      .send({ email: 'jordan.lee@example.com', orgRole: 'OWNER' })
      .expect(422);
  });

  it('the last Owner can’t just step down', async () => {
    const alex = await srv.as('owner');
    const rob = await orgId('Robolution CLT');
    await alex.post(`/api/orgs/${rob}/members/me/step-down`).send({}).expect(422);
  });

  it('a hand-over changes nothing until the person accepts', async () => {
    const alex = await srv.as('owner');
    const maya = await srv.as('coordinator');
    const rob = await orgId('Robolution CLT');
    const before = await roles(alex, rob);
    const sent = (
      await alex
        .post(`/api/orgs/${rob}/ownership-offers`)
        .send({ toUserId: await idOf(maya), stepDown: true })
        .expect(201)
    ).body;
    expect(await roles(alex, rob)).toEqual(before);
    // One open offer at a time.
    await alex
      .post(`/api/orgs/${rob}/ownership-offers`)
      .send({ toUserId: await idOf(maya) })
      .expect(409);
    // Maya sees it; Alex can't answer it for her.
    const mine = (await maya.get('/api/me/ownership-offers').expect(200)).body;
    expect(mine.map((o: { offer: { id: string } }) => o.offer.id)).toEqual([sent.offer.id]);
    await alex.post(`/api/ownership-offers/${sent.offer.id}/accept`).expect(403);

    await maya.post(`/api/ownership-offers/${sent.offer.id}/accept`).expect(200);
    const after = await roles(maya, rob);
    expect(after).toContain('Maya:OWNER');
    expect(after.some((r) => r.startsWith('Alex:'))).toBe(false);
    expect((await maya.get('/api/me/ownership-offers').expect(200)).body).toEqual([]);
  });

  it('a co-owner offer keeps both; a hand-over offer replaces the sender', async () => {
    const alex = await srv.as('owner');
    const maya = await srv.as('coordinator');
    const rob = await orgId('Robolution CLT');
    const co = (
      await alex
        .post(`/api/orgs/${rob}/ownership-offers`)
        .send({ toUserId: await idOf(maya), stepDown: false })
        .expect(201)
    ).body;
    await maya.post(`/api/ownership-offers/${co.offer.id}/accept`).expect(200);
    expect((await roles(maya, rob)).filter((r) => r.endsWith(':OWNER'))).toEqual([
      'Alex:OWNER',
      'Maya:OWNER',
    ]);
    // Now Maya hands over to Marcus from the Offer ownership button (not the last Owner).
    const marcus = (await maya.get(`/api/orgs/${rob}/members`).expect(200)).body.find(
      (m: MemberView) => m.user.firstName === 'Marcus',
    ) as MemberView;
    const handOver = (
      await maya
        .post(`/api/orgs/${rob}/ownership-offers`)
        .send({ toUserId: marcus.user.id, stepDown: true })
        .expect(201)
    ).body;
    const marcusAgent = request.agent(srv.app);
    await marcusAgent
      .post('/api/auth/login')
      .send({ email: marcus.user.email, password: 'Volunteer2026' })
      .expect(200);
    await marcusAgent.post(`/api/ownership-offers/${handOver.offer.id}/accept`).expect(200);
    expect((await roles(alex, rob)).filter((r) => r.endsWith(':OWNER'))).toEqual([
      'Alex:OWNER',
      'Marcus:OWNER',
    ]);
  });

  it('declining leaves everything as it was and tells the Owners', async () => {
    const alex = await srv.as('owner');
    const maya = await srv.as('coordinator');
    const rob = await orgId('Robolution CLT');
    const before = await roles(alex, rob);
    const sent = (
      await alex
        .post(`/api/orgs/${rob}/ownership-offers`)
        .send({ toUserId: await idOf(maya) })
        .expect(201)
    ).body;
    await maya.post(`/api/ownership-offers/${sent.offer.id}/decline`).expect(200);
    await maya.post(`/api/ownership-offers/${sent.offer.id}/accept`).expect(409);
    expect(await roles(alex, rob)).toEqual(before);
    const listed = (await alex.get(`/api/orgs/${rob}/ownership-offers`).expect(200)).body;
    expect(listed[0].offer.status).toBe('DECLINED');
    await alex.delete(`/api/ownership-offers/${sent.offer.id}`).expect(204);
    expect((await alex.get(`/api/orgs/${rob}/ownership-offers`).expect(200)).body).toEqual([]);
  });

  it('a cancelled or expired offer can’t be accepted', async () => {
    const alex = await srv.as('owner');
    const maya = await srv.as('coordinator');
    const rob = await orgId('Robolution CLT');
    const mayaId = await idOf(maya);
    const first = (
      await alex.post(`/api/orgs/${rob}/ownership-offers`).send({ toUserId: mayaId }).expect(201)
    ).body;
    await alex.delete(`/api/ownership-offers/${first.offer.id}`).expect(204);
    await maya.post(`/api/ownership-offers/${first.offer.id}/accept`).expect(404);

    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const second = (
        await alex.post(`/api/orgs/${rob}/ownership-offers`).send({ toUserId: mayaId }).expect(201)
      ).body;
      vi.setSystemTime(Date.now() + 15 * 86_400_000);
      // Keep both sign-ins alive across the jump by signing in again.
      const maya2 = await srv.as('coordinator');
      expect((await maya2.get('/api/me/ownership-offers').expect(200)).body).toEqual([]);
      await maya2.post(`/api/ownership-offers/${second.offer.id}/accept`).expect(404);
    } finally {
      vi.useRealTimers();
    }
  });

  it('only people in the organization can be offered ownership', async () => {
    const alex = await srv.as('owner');
    const rob = await orgId('Robolution CLT');
    const qc = await orgId('Queen City STEM Alliance');
    // Someone who only volunteers somewhere else.
    const outsider = await newPerson('outsider@example.com', qc);
    await alex
      .post(`/api/orgs/${rob}/ownership-offers`)
      .send({ toUserId: await idOf(outsider) })
      .expect(422);
    // A volunteer here counts.
    const insider = await newPerson('insider@example.com', rob);
    const sent = (
      await alex
        .post(`/api/orgs/${rob}/ownership-offers`)
        .send({ toUserId: await idOf(insider) })
        .expect(201)
    ).body;
    await insider.post(`/api/ownership-offers/${sent.offer.id}/accept`).expect(200);
    expect(await roles(alex, rob)).toContain('Test:OWNER');
  });

  it('only an Owner can offer ownership; others just step down', async () => {
    const maya = await srv.as('coordinator');
    const alex = await srv.as('owner');
    const rob = await orgId('Robolution CLT');
    await maya
      .post(`/api/orgs/${rob}/ownership-offers`)
      .send({ toUserId: await idOf(alex) })
      .expect(403);
    await maya.post(`/api/orgs/${rob}/members/me/step-down`).send({}).expect(204);
    await maya.get(`/api/orgs/${rob}/members`).expect(403);
  });
});

describe('creating an organization with its settings', () => {
  const base = {
    name: 'Antares Rocketry',
    description: 'High-power rocketry for teens.',
    timezone: 'America/New_York',
    sector: 'STEM',
  };

  it('saves the org and the wizard’s choices in one request', async () => {
    const maya = await srv.as('coordinator');
    const settings = {
      ...defaultSettings('STEM'),
      siteTerm: 'Launch site',
      skills: ['Range Safety', 'Motor Prep'],
      skillNotes: { 'Range Safety': 'Certified RSO only', Gone: 'dropped' },
    };
    const org = (
      await maya
        .post('/api/orgs')
        .send({ ...base, settings })
        .expect(201)
    ).body as Organization;
    expect(org.settings.siteTerm).toBe('Launch site');
    expect(org.settings.skills).toEqual(['Range Safety', 'Motor Prep']);
    expect(org.settings.skillNotes).toEqual({ 'Range Safety': 'Certified RSO only' });
  });

  it('creates nothing when the settings are invalid', async () => {
    const maya = await srv.as('coordinator');
    const bad = { ...base, settings: { sector: 'STEM', siteTerm: '' } };
    await maya.post('/api/orgs').send(bad).expect(400);
    const mine = (await maya.get('/api/me/orgs').expect(200)).body as OrgAffiliation[];
    expect(JSON.stringify(mine)).not.toContain('Antares Rocketry');
    await maya.post('/api/orgs').send(base).expect(201);
  });
});

describe('scheduling shortcuts and adding volunteers', () => {
  it('repeats a session weekly in one transaction, and refuses the whole batch on one bad date', async () => {
    const alex = await srv.as('owner');
    const rob = await orgId('Robolution CLT');
    const programs = (await alex.get(`/api/orgs/${rob}/programs`).expect(200)).body as Program[];
    const club = programs.find((p) => !p.oneOff && p.type === 'ONGOING')!;
    const start = addDays(todayIso(), 1);
    const base = {
      programId: club.id,
      type: 'SHIFT',
      date: start,
      startTime: '18:00',
      endTime: '19:00',
      title: 'Evening practice',
      requiredSkills: [],
      volunteersNeeded: 5,
      openToGuests: false,
    };
    const made = (
      await alex
        .post('/api/sessions/bulk')
        .send({ session: base, repeat: { weekdays: [1, 3], until: addDays(start, 27) } })
        .expect(201)
    ).body as SessionView[];
    expect(made.length).toBe(8); // 4 weeks × Mon + Wed
    expect(made.every((m) => [1, 3].includes(new Date(`${m.date}T12:00`).getDay()))).toBe(true);

    // Past the program's end date → nothing is created.
    const before = (await alex.get(`/api/orgs/${rob}/sessions?includePast=1`).expect(200)).body
      .length;
    await alex
      .post('/api/sessions/bulk')
      .send({ session: base, repeat: { weekdays: [2], until: addDays(club.endDate, 14) } })
      .expect(422);
    const after = (await alex.get(`/api/orgs/${rob}/sessions?includePast=1`).expect(200)).body
      .length;
    expect(after).toBe(before);
  });

  it('files a one-time event under a hidden program for its place', async () => {
    const alex = await srv.as('owner');
    const rob = await orgId('Robolution CLT');
    const sites = (await alex.get(`/api/orgs/${rob}/sites`).expect(200)).body as Site[];
    const fundraiser = (
      await alex
        .post('/api/sessions')
        .send({
          programId: '',
          siteId: sites[1].id,
          type: 'EVENT',
          date: addDays(todayIso(), 40),
          startTime: '17:00',
          endTime: '20:00',
          title: 'Spring bake sale',
          requiredSkills: [],
          volunteersNeeded: 4,
          openToGuests: false,
        })
        .expect(201)
    ).body as SessionView;
    expect(fundraiser.program.oneOff).toBe(true);
    expect(fundraiser.program.siteId).toBe(sites[1].id);
    await alex
      .post('/api/sessions')
      .send({ ...fundraiser, programId: '', siteId: undefined })
      .expect(400);
  });

  it('adds an existing person or a brand-new one with a temporary password', async () => {
    const alex = await srv.as('owner');
    const qc = await orgId('Queen City STEM Alliance');
    const rob = await orgId('Robolution CLT');
    // Maya already has an account and isn't a Queen City volunteer — Alex isn't an admin there.
    await alex
      .post(`/api/orgs/${qc}/volunteers`)
      .send({
        firstName: 'Maya',
        lastName: 'Chen',
        email: 'maya.chen@example.com',
        skills: [],
        status: 'APPLIED',
      })
      .expect(403);
    const fresh = (
      await alex
        .post(`/api/orgs/${rob}/volunteers`)
        .send({
          firstName: 'Dana',
          lastName: 'Lee',
          email: 'dana.lee@example.com',
          phone: '',
          skills: ['Python'],
          status: 'ACTIVE',
        })
        .expect(201)
    ).body;
    expect(fresh.tempPassword).toMatch(/^Join-/);
    // Robolution has a checklist, so "Ready to serve" waits for it.
    expect(fresh.volunteer.status).toBe('TRAINED');
    const dana = request.agent(srv.app);
    await dana
      .post('/api/auth/login')
      .send({ email: 'dana.lee@example.com', password: fresh.tempPassword })
      .expect(200);
    await alex
      .post(`/api/orgs/${rob}/volunteers`)
      .send({
        firstName: 'Dana',
        lastName: 'Lee',
        email: 'DANA.lee@example.com',
        skills: [],
        status: 'APPLIED',
      })
      .expect(409);
  });
});

describe('creating an account and volunteering once without one', () => {
  /**
   * A one-time Robolution event open to guests, with two spots.
   * @param openToGuests - Whether guests may join.
   * @returns The session.
   */
  async function guestEvent(openToGuests = true): Promise<SessionView> {
    const alex = await srv.as('owner');
    const rob = await orgId('Robolution CLT');
    const sites = (await alex.get(`/api/orgs/${rob}/sites`).expect(200)).body as Site[];
    return (
      await alex
        .post('/api/sessions')
        .send({
          programId: '',
          siteId: sites[0].id,
          type: 'SHIFT',
          date: addDays(todayIso(), 30),
          startTime: '10:00',
          endTime: '12:00',
          title: 'Park cleanup',
          requiredSkills: [],
          volunteersNeeded: 2,
          openToGuests,
        })
        .expect(201)
    ).body as SessionView;
  }

  const guest = (sessionId: string, email: string, firstName = 'Riley') => ({
    sessionId,
    firstName,
    lastName: 'Guest',
    email,
    phone: '(704) 555-0142',
  });

  it('creating an account signs the person in, with or without an organization', async () => {
    const agent = request.agent(srv.app);
    const { orgId: _drop, ...noOrg } = application('solo@example.com', '');
    void _drop;
    await agent.post('/api/public/applications').send(noOrg).expect(201);
    expect((await agent.get('/api/auth/me').expect(200)).body.email).toBe('solo@example.com');
    expect((await agent.get('/api/me/orgs').expect(200)).body).toEqual([]);

    const rob = await orgId('Robolution CLT');
    const joined = request.agent(srv.app);
    await joined.post('/api/public/applications').send(application('joiner@example.com', rob));
    const mine = (await joined.get('/api/me/orgs').expect(200)).body as OrgAffiliation[];
    expect(JSON.stringify(mine)).toContain('Robolution CLT');
  });

  it('lists only events open to guests, with no one else’s details', async () => {
    const open = await guestEvent();
    const closed = await guestEvent(false);
    const list = (await request(srv.app).get('/api/public/guest-sessions').expect(200)).body;
    const ids = list.map((g: { id: string }) => g.id);
    expect(ids).toContain(open.id);
    expect(ids).not.toContain(closed.id);
    expect(JSON.stringify(list)).not.toMatch(/roster|email|phone/i);
    await request(srv.app)
      .post('/api/public/guest-signups')
      .send(guest(closed.id, 'riley@example.com'))
      .expect(422);
  });

  it('signs a guest up without an account and enforces the rules', async () => {
    const event = await guestEvent();
    const done = (
      await request(srv.app)
        .post('/api/public/guest-signups')
        .send(guest(event.id, 'Riley@Example.com'))
        .expect(201)
    ).body;
    expect(done.session.title).toBe('Park cleanup');
    expect(done.contactEmail).toMatch(/@/);
    // On the roster for organizers, as a guest.
    const alex = await srv.as('owner');
    const view = (await alex.get(`/api/sessions/${event.id}`).expect(200)).body as SessionView;
    expect(view.roster.some((r) => r.guest && r.volunteer.firstName === 'Riley')).toBe(true);
    // A contact has no password, so it can't sign in.
    await request(srv.app)
      .post('/api/auth/login')
      .send({ email: 'riley@example.com', password: '' })
      .expect(400);
    await request(srv.app)
      .post('/api/auth/login')
      .send({ email: 'riley@example.com', password: 'anything-1' })
      .expect(401);
    // Not twice, not with an account's email, and not once full.
    await request(srv.app)
      .post('/api/public/guest-signups')
      .send(guest(event.id, 'riley@example.com'))
      .expect(409);
    await request(srv.app)
      .post('/api/public/guest-signups')
      .send(guest(event.id, 'maya.chen@example.com', 'Maya'))
      .expect(409);
    await request(srv.app)
      .post('/api/public/guest-signups')
      .send(guest(event.id, 'sam@example.com', 'Sam'))
      .expect(201);
    await request(srv.app)
      .post('/api/public/guest-signups')
      .send(guest(event.id, 'jo@example.com', 'Jo'))
      .expect(422);
    const list = (await request(srv.app).get('/api/public/guest-sessions').expect(200)).body;
    expect(list.map((g: { id: string }) => g.id)).not.toContain(event.id);
  });

  it('an account made later with the same email takes over the guest’s sign-ups', async () => {
    const event = await guestEvent();
    await request(srv.app)
      .post('/api/public/guest-signups')
      .send(guest(event.id, 'later@example.com'))
      .expect(201);
    const agent = request.agent(srv.app);
    const { orgId: _drop, ...noOrg } = application('later@example.com', '');
    void _drop;
    await agent.post('/api/public/applications').send(noOrg).expect(201);
    const mine = (await agent.get('/api/me/signups').expect(200)).body as Array<{
      sessionId: string;
    }>;
    expect(mine.some((s) => s.sessionId === event.id)).toBe(true);
    // And it's a real account now: a second sign-up with that email must sign in.
    await request(srv.app)
      .post('/api/public/guest-signups')
      .send(guest((await guestEvent()).id, 'later@example.com'))
      .expect(409);
  });
});

describe('sessions, guests and the waitlist', () => {
  /**
   * Alex (Owner) sets up a one-seat, guest-open session at Robolution next week.
   * @returns The session.
   */
  async function oneSeatSession(): Promise<SessionView> {
    const alex = await srv.as('owner');
    const rob = await orgId('Robolution CLT');
    const site = (
      await alex
        .post(`/api/orgs/${rob}/sites`)
        .send({
          name: 'Test Middle Site',
          address: '1 Test Way, Charlotte, NC',
          zip: '28202',
          priority: true,
          rangeMin: 6,
          rangeMax: 8,
          contactName: 'Pat Lee',
          contactEmail: 'pat@example.org',
        })
        .expect(201)
    ).body as Site;
    const program = (
      await alex
        .post('/api/programs')
        .send({
          siteId: site.id,
          name: 'Test Club',
          type: 'ONGOING',
          startDate: addDays(todayIso(), -1),
          endDate: addDays(todayIso(), 60),
          participantCount: 6,
          targetRatio: 8,
          description: 'VEX IQ',
        })
        .expect(201)
    ).body as Program;
    return (
      await alex
        .post('/api/sessions')
        .send({
          programId: program.id,
          type: 'SHIFT',
          date: addDays(todayIso(), 7),
          startTime: '15:00',
          endTime: '16:30',
          title: 'Test lesson',
          requiredSkills: [],
          volunteersNeeded: 1,
          openToGuests: true,
        })
        .expect(201)
    ).body as SessionView;
  }

  it('one-time guests can join a guest-open session; a full session waitlists; a cancel promotes', async () => {
    const session = await oneSeatSession();
    const qc = await orgId('Queen City STEM Alliance');
    // Both people volunteer with Queen City only, so at Robolution they are guests (FR-3d).
    const first = await newPerson('first.guest@example.com', qc);
    const second = await newPerson('second.guest@example.com', qc);

    const a = (await first.post(`/api/sessions/${session.id}/signups`).send({}).expect(201)).body;
    expect(a.waitlisted).toBe(false);
    expect(a.signUp.guest).toBe(true);
    expect(a.message).toMatch(/guest/);

    const b = (await second.post(`/api/sessions/${session.id}/signups`).send({}).expect(201)).body;
    expect(b.waitlisted).toBe(true);
    expect(b.signUp.waitlistPosition).toBe(1);

    await first.post(`/api/sessions/${session.id}/signups`).send({}).expect(409); // already on it

    const cancelled = (await first.post(`/api/signups/${a.signUp.id}/cancel`).expect(200)).body;
    expect(cancelled.promoted.lastName).toBe('second.guest');
    const mine = (await second.get('/api/me/signups').expect(200)).body;
    expect(mine.find((s: { sessionId: string }) => s.sessionId === session.id).status).toBe(
      'SIGNED_UP',
    );

    // The guest doesn't appear in the org switcher: a guest sign-up isn't membership.
    const orgs = (await first.get('/api/me/orgs').expect(200)).body as OrgAffiliation[];
    expect(orgs.map((o) => o.org.name)).toEqual(['Queen City STEM Alliance']);
  });

  it('removing a volunteer cancels their upcoming shifts there and moves the waitlist up', async () => {
    const session = await oneSeatSession();
    const rob = await orgId('Robolution CLT');
    const qc = await orgId('Queen City STEM Alliance');
    const first = await newPerson('leaver@example.com', qc);
    const second = await newPerson('waiting@example.com', qc);
    await first.post(`/api/sessions/${session.id}/signups`).send({}).expect(201);
    await second.post(`/api/sessions/${session.id}/signups`).send({}).expect(201); // waitlisted
    // The first person then applies to Robolution, and an organizer removes them.
    await first.post(`/api/orgs/${rob}/volunteers/me`).expect(201);
    const firstId = (await first.get('/api/auth/me').expect(200)).body.id as string;
    const maya = await srv.as('coordinator');
    await maya.delete(`/api/orgs/${rob}/volunteers/${firstId}`).expect(403); // Coordinators can't
    const alex = await srv.as('owner');
    const done = (await alex.delete(`/api/orgs/${rob}/volunteers/${firstId}`).expect(200)).body;
    expect(done).toEqual({ cancelledSignUps: 1, keepsRole: false });
    const theirs = (await second.get('/api/me/signups').expect(200)).body;
    expect(theirs.find((s: { sessionId: string }) => s.sessionId === session.id).status).toBe(
      'SIGNED_UP',
    );
    const list = (await alex.get(`/api/orgs/${rob}/volunteers`).expect(200)).body as Volunteer[];
    expect(list.some((v) => v.id === firstId)).toBe(false);
    // Their other organization is untouched.
    const orgs = (await first.get('/api/me/orgs').expect(200)).body as OrgAffiliation[];
    expect(orgs.map((o) => o.org.name)).toEqual(['Queen City STEM Alliance']);
  });

  it('a volunteer can leave, keeps past hours and any role, and can apply again', async () => {
    const maya = await srv.as('coordinator'); // Coordinator and volunteer at Robolution
    const rob = await orgId('Robolution CLT');
    const hoursBefore = (await maya.get('/api/me/hours').expect(200)).body.length;
    const signUpsBefore = (await maya.get('/api/me/signups').expect(200)).body as Array<{
      status: string;
      session: { date: string };
    }>;
    const done = (await maya.delete(`/api/orgs/${rob}/volunteers/me`).expect(200)).body;
    expect(done.keepsRole).toBe(true);
    expect(done.cancelledSignUps).toBeGreaterThan(0);
    const after = (await maya.get('/api/me/signups').expect(200)).body as typeof signUpsBefore;
    expect(after.filter((s) => s.status === 'COMPLETED').length).toBe(
      signUpsBefore.filter((s) => s.status === 'COMPLETED').length,
    );
    expect(
      after.filter((s) => s.status === 'SIGNED_UP' && s.session.date >= todayIso()).length,
    ).toBe(0);
    expect((await maya.get('/api/me/hours').expect(200)).body.length).toBe(hoursBefore);
    // Still a Coordinator there; not a volunteer any more.
    const mine = (await maya.get('/api/me/orgs').expect(200)).body as OrgAffiliation[];
    const here = mine.find((o) => o.org.id === rob)!;
    expect(here.role).toBe('COORDINATOR');
    expect(here.volunteerStatus ?? null).toBeNull();
    await maya.post(`/api/orgs/${rob}/volunteers/me`).expect(201);
  });

  it('people who help run an org are not offered, and cannot take, guest spots in it', async () => {
    const alex = await srv.as('owner'); // Coordinator at Queen City, not a volunteer there
    const qc = await orgId('Queen City STEM Alliance');
    const qcSessions = (await alex.get(`/api/orgs/${qc}/sessions`).expect(200))
      .body as SessionView[];
    const open = qcSessions.find((s) => s.openToGuests)!;
    const browse = (await alex.get('/api/me/sessions/open').expect(200)).body as SessionView[];
    expect(browse.some((s) => s.id === open.id)).toBe(false);
    const res = await alex.post(`/api/sessions/${open.id}/signups`).send({}).expect(422);
    expect(res.body.message).toMatch(/join as a volunteer/);
  });

  it('an applicant cannot join a members-only session of the org they applied to (V-S5)', async () => {
    const rob = await orgId('Robolution CLT');
    const applicant = await newPerson('new.applicant@example.com', rob);
    const alex = await srv.as('owner');
    const list = (await alex.get(`/api/orgs/${rob}/sessions?withinDays=30`).expect(200))
      .body as SessionView[];
    const membersOnly = list.find((s) => !s.openToGuests && s.type === 'SHIFT')!;
    const res = await applicant
      .post(`/api/sessions/${membersOnly.id}/signups`)
      .send({})
      .expect(422);
    expect(res.body.code).toBe('RULE_VIOLATION');
  });
});

describe('hours', () => {
  it('nobody can approve their own hours', async () => {
    const alex = await srv.as('owner');
    const rob = await orgId('Robolution CLT');
    const log = (
      await alex
        .post('/api/me/hours')
        .send({
          orgId: rob,
          date: addDays(todayIso(), -1),
          hours: 1.5,
          description: 'Equipment inventory',
        })
        .expect(201)
    ).body;
    expect(log.status).toBe('PENDING');
    const res = await alex
      .post(`/api/hours/${log.id}/review`)
      .send({ status: 'APPROVED' })
      .expect(403);
    expect(res.body.message).toMatch(/own hours/);
    const maya = await srv.as('coordinator');
    const ok = (
      await maya.post(`/api/hours/${log.id}/review`).send({ status: 'APPROVED' }).expect(200)
    ).body;
    expect(ok.reviewedBy).toMatch(/Maya/);
  });
});

describe('persistence', () => {
  it('writes survive a restart (a new store reloads from SQLite)', async () => {
    const jordan = await srv.as('volunteer');
    const before = (await jordan.get('/api/me/profile').expect(200)).body as MyProfile;
    const { id, userId, ...profile } = before.profile; // eslint-disable-line @typescript-eslint/no-unused-vars
    await jordan
      .put('/api/me/profile')
      .send({
        firstName: before.firstName,
        lastName: before.lastName,
        phone: before.phone,
        zip: before.zip,
        ...profile,
        bio: 'Updated by the persistence test.',
        availability: profile.availability.map(({ dayOfWeek, startTime, endTime }) => ({
          dayOfWeek,
          startTime,
          endTime,
        })),
      })
      .expect(200);

    const db = createDb(srv.dbPath);
    const reloaded = await new Store(db).current();
    const user = reloaded.users.find((u) => u.email === 'jordan.rivera@example.com')!;
    const stored = reloaded.profiles.find((p) => p.userId === user.id)!;
    expect(stored.bio).toBe('Updated by the persistence test.');
    expect(stored.skills.sort()).toEqual([...profile.skills].sort());
    expect(stored.availability).toHaveLength(profile.availability.length);
    await db.close();
  });

  it('a refused write changes nothing', async () => {
    const maya = await srv.as('coordinator');
    const before = JSON.stringify(await srv.store.current());
    await maya.post('/api/orgs/does-not-exist/equipment').send({}).expect(404);
    expect(JSON.stringify(await srv.store.current())).toBe(before);
  });
});

describe('insights', () => {
  it('runs the dashboard, staffing alerts, a report and the assistant', async () => {
    const alex = await srv.as('owner');
    const rob = await orgId('Robolution CLT');
    const dash = (await alex.get(`/api/orgs/${rob}/dashboard`).expect(200)).body;
    expect(dash.activeVolunteers).toBeGreaterThan(0);
    await alex.get(`/api/orgs/${rob}/alerts/staffing`).expect(200);
    const report = await alex
      .post(`/api/orgs/${rob}/reports/run`)
      .send({
        metric: 'hours',
        groupBy: 'month',
        from: addDays(todayIso(), -180),
        to: todayIso(),
        chartType: 'bar',
      })
      .expect(200);
    expect(report.body.orgName).toBe('Robolution CLT');
    await alex
      .post(`/api/orgs/${rob}/reports/run`)
      .send({
        metric: 'hours',
        groupBy: 'month',
        from: todayIso(),
        to: addDays(todayIso(), -1),
        chartType: 'bar',
      })
      .expect(400);
    const reply = await alex
      .post('/api/assistant/ask')
      .send({ question: 'How do I log hours?', orgId: rob })
      .expect(200);
    expect(reply.body.text.length).toBeGreaterThan(0);
  });
});
