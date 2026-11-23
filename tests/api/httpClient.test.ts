/**
 * @file Contract test: the browser's HTTP client (`httpApi`) against the real Express server.
 *
 * Proves every `ApiClient` method reaches a matching route with the right body and query shape.
 * `fetch` is pointed at a live server on a random port, with a tiny cookie jar standing in for
 * the browser.
 */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, todayIso } from '@shared/time';
import { httpApi as api, UNAUTHORIZED_EVENT } from '../../client/src/lib/api/httpApi';
import { startServer, type TestServer } from './harness';

let srv: TestServer;
let server: Server;
let cookie = '';
let unauthorizedEvents = 0;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  srv = await startServer();
  server = srv.app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // The browser: relative URLs, cookies kept between requests.
  globalThis.fetch = async (input, init = {}) => {
    const headers = new Headers(init.headers);
    if (cookie) headers.set('Cookie', cookie);
    const res = await realFetch(`${base}${String(input)}`, { ...init, headers });
    const set = res.headers.get('set-cookie');
    if (set) cookie = /Expires=Thu, 01 Jan 1970/i.test(set) ? '' : set.split(';')[0];
    return res;
  };
  const target = new EventTarget();
  target.addEventListener(UNAUTHORIZED_EVENT, () => unauthorizedEvents++);
  (globalThis as { window?: EventTarget }).window = target;
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  server.close();
  await srv.close();
});

describe('httpApi against the real server', () => {
  it('signs in, reads every screen, and signs out', async () => {
    expect(await api.auth.me()).toBeNull();
    await expect(api.orgs.mine()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(unauthorizedEvents).toBe(1);

    const { user } = await api.auth.login({
      email: 'alex.morgan@robolutionclt.org',
      password: 'Onboard2026',
    });
    expect(user.firstName).toBe('Alex');
    expect((await api.auth.me())?.id).toBe(user.id);

    const mine = await api.orgs.mine();
    const rob = mine.find((a) => a.org.name === 'Robolution CLT')!.org.id;
    expect((await api.orgs.directory()).length).toBe(2);
    expect((await api.orgs.members(rob)).length).toBeGreaterThan(0);
    expect((await api.auth.publicOrgs()).length).toBe(2);

    const vols = await api.volunteers.list(rob, { status: 'ACTIVE' as never });
    expect(vols.every((v) => v.status === 'ACTIVE')).toBe(true);
    const one = await api.volunteers.get(rob, vols[0].id);
    expect(one.id).toBe(vols[0].id);
    await api.signups.forVolunteer(rob, vols[0].id);
    expect(one.requirements.length).toBe(3);

    // Data-grid rows: one per volunteer standing, with metrics that add up.
    const grid = await api.volunteers.metrics(rob);
    expect(grid.length).toBe((await api.volunteers.list(rob)).length);
    const hours = await api.hours.list(rob, { status: 'APPROVED' as never });
    const total = grid.reduce((s, r) => s + r.approvedHours, 0);
    const volunteerIds = new Set(grid.map((r) => r.id));
    const expected = hours
      .filter((h) => volunteerIds.has(h.userId))
      .reduce((s, h) => s + h.hours, 0);
    expect(total).toBeCloseTo(expected);
    expect(
      grid.every(
        (r) => r.attendancePct === null || (r.attendancePct >= 0 && r.attendancePct <= 100),
      ),
    ).toBe(true);
    expect(grid.find((r) => r.availability.length)?.availableDays.length).toBeGreaterThan(0);

    const sites = await api.sites.list(rob, true);
    const programs = await api.programs.list(rob);
    expect(sites.length && programs.length).toBeTruthy();

    const sessions = await api.sessions.list(rob, { withinDays: 30, priorityOnly: true });
    expect(sessions.every((s) => s.site.priority)).toBe(true);
    const detail = await api.sessions.get(sessions[0].id);
    expect(detail.id).toBe(sessions[0].id);
    const recs = await api.matching.recommend(sessions[0].id, 3);
    expect(recs.length).toBeLessThanOrEqual(3);

    await api.sessions.browse({ guestsOnly: false });
    await api.matching.forMe(5);
    await api.signups.mine();
    await api.hours.mine();
    await api.hours.list(rob, { status: 'PENDING' as never });
    await api.equipment.list(rob);
    await api.risk.sessions(rob);
    await api.risk.inactivity(rob);
    expect((await api.dashboard.admin(rob)).activeVolunteers).toBeGreaterThan(0);
    const report = await api.reports.run(rob, {
      metric: 'hours',
      groupBy: 'site',
      from: addDays(todayIso(), -90),
      to: todayIso(),
      chartType: 'bar',
    });
    expect(report.orgName).toBe('Robolution CLT');
    expect((await api.assistant.ask('How do I approve hours?', rob)).text).toBeTruthy();
    expect((await api.profile.get()).email).toBe(user.email);
    expect((await api.meta.skills()).length).toBeGreaterThan(0);
    expect(await api.meta.status()).toMatchObject({ ok: true, demoMode: true });

    await api.auth.logout();
    expect(await api.auth.me()).toBeNull();
  });

  it('writes: org, site, program, session, sign-up, presets, items, tour, reset', async () => {
    await api.auth.login({ email: 'maya.chen@example.com', password: 'Volunteer2026' });
    const org = await api.orgs.create({
      name: 'HTTP Client Test Org',
      description: 'Created through httpApi.',
      timezone: 'America/New_York',
      sector: 'SPORTS',
    });
    expect(org.settings.siteTerm).toBe('Field');
    const renamed = await api.settings.update(org.id, { ...org.settings, siteTerm: 'Pitch' });
    expect(renamed.settings.siteTerm).toBe('Pitch');
    const first = await api.settings.createRequirement(org.id, {
      name: 'Concussion course',
      description: 'CDC HEADS UP, online.',
      validMonths: 12,
    });
    const second = await api.settings.createRequirement(org.id, {
      name: 'SafeSport',
      description: '',
    });
    expect((await api.settings.moveRequirement(second.id, -1)).map((r) => r.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(
      (
        await api.settings.updateRequirement(first.id, {
          name: 'Concussion training',
          description: '',
        })
      ).name,
    ).toBe('Concussion training');
    await api.settings.archiveRequirement(second.id);
    expect((await api.settings.requirements(org.id)).map((r) => r.id)).toEqual([first.id]);
    const site = await api.sites.create(org.id, {
      name: 'Client Test Site',
      address: '1 Test Way, Charlotte, NC',
      zip: '28202',
      priority: true,
      rangeMin: 4,
      rangeMax: 8,
      contactName: 'Pat Lee',
      contactEmail: 'pat@example.org',
    });
    expect((await api.sites.archive(site.id)).archived).toBe(true);
    expect((await api.sites.archive(site.id)).archived).toBe(false);
    const program = await api.programs.create({
      siteId: site.id,
      name: 'Client Club',
      type: 'ONGOING' as never,
      startDate: addDays(todayIso(), -1),
      endDate: addDays(todayIso(), 60),
      participantCount: 8,
      targetRatio: 8,
      description: 'Weekend practices',
    });
    const input = {
      programId: program.id,
      type: 'SHIFT' as never,
      date: addDays(todayIso(), 5),
      startTime: '15:00',
      endTime: '16:00',
      title: 'Client practice',
      requiredSkills: [],
      volunteersNeeded: 2,
      openToGuests: true,
    };
    const session = await api.sessions.create(input);
    const updated = await api.sessions.update(session.id, { ...input, title: 'Renamed' });
    expect(updated.title).toBe('Renamed');

    const item = await api.equipment.create(org.id, {
      assetTag: 'BAG-9001',
      name: 'Size 4 ball bag',
      condition: 'GOOD' as never,
    });
    expect((await api.equipment.checkOut(item.id, program.id)).programId).toBe(program.id);
    expect((await api.equipment.returnEquipment(item.id)).programId).toBeUndefined();

    const preset = await api.presets.save('Priority soon', { priorityOnly: true, withinDays: 14 });
    expect((await api.presets.list()).some((p) => p.id === preset.id)).toBe(true);
    await api.presets.remove(preset.id);
    expect((await api.presets.list()).some((p) => p.id === preset.id)).toBe(false);

    expect((await api.auth.completeTour()).tourCompleted).toBe(true);
    await api.sessions.cancel(session.id);
    await api.programs.remove(program.id);
    await api.sites.remove(site.id);

    // Reset keeps Maya signed in on fresh data (new cookie) and drops the test org.
    await api.meta.resetDemo();
    expect((await api.auth.me())?.email).toBe('maya.chen@example.com');
    expect((await api.orgs.directory()).some((o) => o.org.id === org.id)).toBe(false);
  });

  it('turns server errors into AppErrors with field details', async () => {
    await expect(
      api.auth.login({ email: 'maya.chen@example.com', password: 'nope-nope-1' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', field: 'password' });
    await api.auth.login({ email: 'maya.chen@example.com', password: 'Volunteer2026' });
    const rob = (await api.auth.publicOrgs()).find((o) => o.name === 'Robolution CLT')!.id;
    await expect(api.sites.create(rob, {} as never)).rejects.toMatchObject({
      code: 'FORBIDDEN', // Coordinators can't edit sites
    });
  });
});
