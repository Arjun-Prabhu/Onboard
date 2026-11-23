/**
 * @file Unit tests for the priority queue, multi-org seed, matching, risk scoring, report
 * aggregation and the role-aware assistant.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { OrgRole, RiskLevel, SessionStatus, SignUpStatus, VolunteerStatus } from '@shared/enums';
import { occupiesSeat } from '@shared/rules';
import { addDays, todayIso } from '@shared/time';
import { PriorityQueue } from '@shared/utils/PriorityQueue';
import { answer, type AssistantContext } from '@shared/domain/assistant';
import { recommendForSession, recommendSessionsForPerson } from '@shared/domain/matching';
import { runReport } from '@shared/domain/reports';
import { sessionRisks, urgency } from '@shared/domain/risk';
import { buildSeed, DEMO_ACCOUNTS } from '@shared/demo/seed';
import type { DataSnapshot } from '@shared/domain/snapshot';
import { buildIndexes, orgSessions } from '@shared/domain/views';

let db: DataSnapshot;
const byEmail = (email: string) => db.users.find((u) => u.email === email)!;
const orgNamed = (prefix: string) => db.organizations.find((o) => o.name.startsWith(prefix))!;
beforeEach(() => {
  db = buildSeed({ today: todayIso() });
});

describe('PriorityQueue', () => {
  it('pops in priority order', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    [5, 1, 9, 3, 7].forEach((n) => pq.push(n));
    expect(pq.takeTop(3)).toEqual([9, 7, 5]);
    expect(pq.size).toBe(2);
  });
});

describe('multi-org identity seed', () => {
  it('lets one person hold different roles in different orgs and volunteer too', () => {
    const alex = byEmail(DEMO_ACCOUNTS[0].email);
    const roles = db.memberships
      .filter((m) => m.userId === alex.id)
      .map((m) => [db.organizations.find((o) => o.id === m.orgId)!.name, m.orgRole]);
    expect(roles).toContainEqual(['Robolution CLT', OrgRole.OWNER]);
    expect(roles).toContainEqual(['Queen City STEM Alliance', OrgRole.COORDINATOR]);
    expect(
      db.orgVolunteers.some((o) => o.userId === alex.id && o.status === VolunteerStatus.ACTIVE),
    ).toBe(true);
  });
  it('gives every org at least one owner and unique memberships', () => {
    for (const org of db.organizations)
      expect(db.memberships.some((m) => m.orgId === org.id && m.orgRole === OrgRole.OWNER)).toBe(
        true,
      );
    const keys = db.memberships.map((m) => `${m.orgId}:${m.userId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('records a guest sign-up without giving the guest standing in that org', () => {
    const jordan = byEmail(DEMO_ACCOUNTS[2].email);
    const qc = orgNamed('Queen City');
    const guest = db.signUps.find((s) => s.userId === jordan.id && s.guest);
    expect(guest).toBeDefined();
    expect(db.orgVolunteers.some((o) => o.orgId === qc.id && o.userId === jordan.id)).toBe(false);
  });
  it('never seats more people than a session needs and has a waitlist to demo', () => {
    for (const s of db.sessions)
      expect(
        db.signUps.filter((su) => su.sessionId === s.id && occupiesSeat(su)).length,
      ).toBeLessThanOrEqual(s.volunteersNeeded);
    expect(db.signUps.some((s) => s.status === SignUpStatus.WAITLISTED)).toBe(true);
  });
});

describe('matching', () => {
  it('recommends only ACTIVE volunteers of the session’s own org, ranked', () => {
    const rob = orgNamed('Robolution');
    const idx = buildIndexes(db);
    const upcoming = orgSessions(db, idx, rob.id).find(
      (s) =>
        s.status === SessionStatus.SCHEDULED &&
        s.date > addDays(todayIso(), 1) &&
        s.type === 'SHIFT',
    )!;
    const matches = recommendForSession(db, upcoming.id, 5);
    expect(matches.length).toBeGreaterThan(0);
    for (let i = 1; i < matches.length; i++)
      expect(matches[i - 1].score).toBeGreaterThanOrEqual(matches[i].score);
    for (const m of matches) {
      expect(m.volunteer.orgId).toBe(rob.id);
      expect(m.volunteer.status).toBe(VolunteerStatus.ACTIVE);
      expect(m.factors).toHaveLength(5);
    }
  });
  it('suggests guest-open events to people who don’t belong to that org', () => {
    const jordan = byEmail(DEMO_ACCOUNTS[2].email);
    // Jordan is already on the scrimmage; a brand-new person should be offered it as a guest.
    db.signUps = db.signUps.filter((s) => !(s.userId === jordan.id && s.guest));
    const suggestions = recommendSessionsForPerson(db, jordan.id, 50);
    expect(suggestions.some((s) => s.asGuest && s.session.openToGuests)).toBe(true);
    expect(suggestions.filter((s) => s.asGuest).every((s) => s.session.openToGuests)).toBe(true);
  });
});

describe('risk', () => {
  it('urgency increases as the session approaches', () => {
    expect(urgency(1)).toBeGreaterThan(urgency(10));
  });
  it('flags upcoming sessions for one org only, sorted by score', () => {
    const rob = orgNamed('Robolution');
    const risks = sessionRisks(db, rob.id);
    expect(risks.some((r) => r.level !== RiskLevel.LOW)).toBe(true);
    expect(risks.every((r) => r.session.org.id === rob.id)).toBe(true);
    for (let i = 1; i < risks.length; i++)
      expect(risks[i - 1].score).toBeGreaterThanOrEqual(risks[i].score);
  });
});

describe('reports', () => {
  it('hours total equals the org’s approved logs in range — other orgs excluded', () => {
    const rob = orgNamed('Robolution');
    const from = addDays(todayIso(), -365);
    const to = todayIso();
    const r = runReport(db, rob.id, {
      metric: 'hours',
      groupBy: 'month',
      from,
      to,
      chartType: 'bar',
    });
    const expected = db.hourLogs
      .filter(
        (h) => h.orgId === rob.id && h.status === 'APPROVED' && h.date >= from && h.date <= to,
      )
      .reduce((s, h) => s + h.hours, 0);
    expect(r.total).toBeCloseTo(expected, 1);
    expect(r.orgName).toBe('Robolution CLT');
  });
  it('rates stay within 0–100', () => {
    const r = runReport(db, orgNamed('Robolution').id, {
      metric: 'attendanceRate',
      groupBy: 'site',
      from: addDays(todayIso(), -365),
      to: todayIso(),
      chartType: 'bar',
    });
    for (const row of r.rows) expect(row.value).toBeGreaterThanOrEqual(0);
    for (const row of r.rows) expect(row.value).toBeLessThanOrEqual(100);
  });
});

describe('assistant', () => {
  const ctx = (email: string, orgPrefix: string | null): AssistantContext => {
    const user = byEmail(email);
    const org = orgPrefix ? orgNamed(orgPrefix) : null;
    const role = org
      ? (db.memberships.find((m) => m.orgId === org.id && m.userId === user.id)?.orgRole ?? null)
      : null;
    return {
      user,
      orgId: role ? org!.id : null,
      role,
      managesAnyOrg: db.memberships.some((m) => m.userId === user.id),
    };
  };
  it('answers org data questions for a manager of that org', () => {
    expect(
      answer(db, ctx(DEMO_ACCOUNTS[0].email, 'Robolution'), 'Who is free Tuesday?').text,
    ).toMatch(/Tuesday/);
    expect(
      answer(db, ctx(DEMO_ACCOUNTS[0].email, 'Robolution'), 'how do I export a report').link?.to,
    ).toBe('/reports');
  });
  it('keeps people without a management role to their own data', () => {
    const reply = answer(db, ctx(DEMO_ACCOUNTS[2].email, null), 'How many hours does Maya have?');
    expect(reply.text).toMatch(/only see your own/);
    expect(answer(db, ctx(DEMO_ACCOUNTS[2].email, null), 'How many hours do I have?').text).toMatch(
      /approved service hours/,
    );
  });
  it('answers a Coordinator within their permissions in that org', () => {
    expect(
      answer(db, ctx(DEMO_ACCOUNTS[1].email, 'Robolution'), 'how many volunteers').text,
    ).toMatch(/This organization has/);
    expect(
      answer(
        db,
        ctx(DEMO_ACCOUNTS[1].email, 'Robolution'),
        'which sessions need volunteers this week',
      ).text,
    ).not.toMatch(/doesn't include/);
  });
});
