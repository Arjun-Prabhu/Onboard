/**
 * @file Help Assistant (FR-23, §2.8) — runs locally, no external AI service.
 *
 * Two kinds of intents:
 *  - DATA intents: regex patterns mapped to safe, read-only queries. "Self" intents answer about
 *    the asker across all their orgs; "org" intents answer about the org selected in the
 *    switcher and require the matching permission there, so nobody sees data they can't manage.
 *  - HOW-TO intents: Fuse.js fuzzy search, word by word, over the FAQ knowledge base.
 * If nothing matches, the closest FAQ titles are suggested so the user is never stuck.
 */
import Fuse from 'fuse.js';
import { DAY_NAMES, HourStatus, SessionStatus, VolunteerStatus, type OrgRole } from '@shared/enums';
import { visibleFaq, type FaqEntry } from '@shared/faq';
import { can, type Permission } from '@shared/permissions';
import { occupiesSeat } from '@shared/rules';
import { addDays, formatDate, formatTimeRange, todayIso } from '@shared/time';
import type { AssistantReply, User } from '@shared/types';
import { sessionRisks } from './risk';
import type { DataSnapshot } from './snapshot';
import { buildIndexes, orgSessions, orgVolunteerViews, toSessionView } from './views';

/** Who is asking, and which org (if any) they are managing right now. */
export interface AssistantContext {
  user: User;
  orgId: string | null;
  role: OrgRole | null;
  /** Whether the person manages ANY org (controls manage-only FAQ articles). */
  managesAnyOrg: boolean;
}

/** Example questions shown as chips. */
export const EXAMPLE_QUESTIONS = {
  manage: [
    'Which sessions need volunteers this week?',
    'Who is free Tuesday?',
    'How many hours are pending?',
    'How do I appoint an admin?',
  ],
  self: [
    'When is my next shift?',
    'How many hours do I have?',
    'How do I volunteer with another organization?',
  ],
};

/** A data intent: pattern + who may use it + handler. */
interface DataIntent {
  pattern: RegExp;
  /** `self` = about the asker; otherwise the permission needed in the active org. */
  scope: 'self' | Permission;
  handle: (db: DataSnapshot, ctx: AssistantContext, match: RegExpMatchArray) => AssistantReply;
}

const DAY_PREFIXES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const DATA_INTENTS: DataIntent[] = [
  {
    pattern: /how many hours (?:do|have) i|my hours/i,
    scope: 'self',
    handle: (db, { user }) => {
      const logs = db.hourLogs.filter((h) => h.userId === user.id);
      const sum = (s: HourStatus) =>
        logs.filter((h) => h.status === s).reduce((t, h) => t + h.hours, 0);
      const orgs = new Set(logs.map((h) => h.orgId)).size;
      return {
        text: `You have ${sum(HourStatus.APPROVED)} approved service hours across ${orgs} organization${orgs === 1 ? '' : 's'}${sum(HourStatus.PENDING) ? `, plus ${sum(HourStatus.PENDING)} waiting for approval` : ''}.`,
        link: { label: 'Open My hours', to: '/me/hours' },
      };
    },
  },
  {
    pattern: /(?:my )?next (?:session|shift)|when (?:is|am) (?:my|i)/i,
    scope: 'self',
    handle: (db, { user }) => {
      const idx = buildIndexes(db);
      const today = todayIso();
      const next = db.signUps
        .filter((su) => su.userId === user.id && occupiesSeat(su))
        .map((su) => idx.sessions.get(su.sessionId))
        .filter(
          (s): s is NonNullable<typeof s> =>
            !!s && s.date >= today && s.status === SessionStatus.SCHEDULED,
        )
        .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))[0];
      if (!next)
        return {
          text: "You don't have any upcoming sessions. Want to find one?",
          link: { label: 'Find a shift', to: '/me/find' },
        };
      const v = toSessionView(db, next, idx);
      return {
        text: `Your next session is ${v.title} with ${v.org.name} at ${v.site.name} on ${formatDate(v.date)}, ${formatTimeRange(v.startTime, v.endTime)}.`,
        link: { label: 'Open My shifts', to: '/me/schedule' },
      };
    },
  },
  {
    pattern:
      /\b(?:who(?:'s| is)?|which volunteers? (?:are|is))\s+(?:free|available)\s+(?:on\s+)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*/i,
    scope: 'volunteers.view',
    handle: (db, { orgId }, m) => {
      const day = DAY_PREFIXES.indexOf(m[1].toLowerCase().slice(0, 3));
      const names = orgVolunteerViews(db, buildIndexes(db), orgId as string)
        .filter(
          (v) =>
            v.status === VolunteerStatus.ACTIVE && v.availability.some((a) => a.dayOfWeek === day),
        )
        .map((v) => `${v.firstName} ${v.lastName}`);
      return {
        text: names.length
          ? `${names.length} active volunteers are available on ${DAY_NAMES[day]}s: ${names.slice(0, 10).join(', ')}${names.length > 10 ? `, and ${names.length - 10} more` : ''}.`
          : `No active volunteers list ${DAY_NAMES[day]} availability yet.`,
        link: { label: 'Open volunteers', to: `/volunteers?day=${day}` },
      };
    },
  },
  {
    pattern: /how many hours (?:does|has|did)\s+([a-z'-]+)/i,
    scope: 'volunteers.view',
    handle: (db, { orgId }, m) => {
      const name = m[1].toLowerCase();
      const v = orgVolunteerViews(db, buildIndexes(db), orgId as string).find(
        (x) => x.firstName.toLowerCase() === name || x.lastName.toLowerCase() === name,
      );
      if (!v)
        return {
          text: `I couldn't find a volunteer named "${m[1]}" in this organization. Try their first or last name.`,
        };
      const approved = db.hourLogs
        .filter((h) => h.userId === v.id && h.orgId === orgId && h.status === HourStatus.APPROVED)
        .reduce((s, h) => s + h.hours, 0);
      return {
        text: `${v.firstName} ${v.lastName} has ${approved} approved service hours with this organization.`,
        link: { label: `Open ${v.firstName}'s profile`, to: `/volunteers/${v.id}` },
      };
    },
  },
  {
    pattern:
      /(?:which|what) sessions? (?:need|needs|are short|have open)|need(?:s)? volunteers|understaffed/i,
    scope: 'roster.manage',
    handle: (db, { orgId }) => {
      const idx = buildIndexes(db);
      const today = todayIso();
      const open = orgSessions(db, idx, orgId as string)
        .filter(
          (s) =>
            s.status === SessionStatus.SCHEDULED && s.date >= today && s.date <= addDays(today, 7),
        )
        .map((s) => toSessionView(db, s, idx))
        .filter((s) => s.signedUpCount < s.volunteersNeeded);
      if (!open.length) return { text: 'Every session in the next 7 days is fully staffed.' };
      const lines = open
        .slice(0, 5)
        .map(
          (s) =>
            `${s.site.name} on ${formatDate(s.date, { year: undefined })} needs ${s.volunteersNeeded - s.signedUpCount} more`,
        );
      return {
        text: `${open.length} sessions this week need volunteers: ${lines.join('; ')}.`,
        link: { label: 'See open sessions', to: '/sessions?needs=1&within=7' },
      };
    },
  },
  {
    pattern: /pending hours|hours (?:are )?pending|hours to approve/i,
    scope: 'hours.review',
    handle: (db, { orgId }) => {
      const pending = db.hourLogs.filter(
        (h) => h.orgId === orgId && h.status === HourStatus.PENDING,
      );
      return {
        text: `${pending.length} hour logs (${pending.reduce((s, h) => s + h.hours, 0)} hours) are waiting for review.`,
        link: { label: 'Review hours', to: '/hours' },
      };
    },
  },
  {
    pattern: /high.?risk|at risk|risky/i,
    scope: 'roster.manage',
    handle: (db, { orgId }) => {
      const high = sessionRisks(db, orgId as string).filter((r) => r.level === 'HIGH');
      return {
        text: high.length
          ? `${high.length} high-risk sessions: ${high
              .slice(0, 4)
              .map(
                (r) =>
                  `${r.session.site.name} (${formatDate(r.session.date, { year: undefined })})`,
              )
              .join(', ')}.`
          : 'No sessions are high risk right now.',
        link: { label: 'Open Home', to: '/' },
      };
    },
  },
  {
    pattern: /how many (?:active )?(?:volunteers|volunteers)/i,
    scope: 'volunteers.view',
    handle: (db, { orgId }) => {
      const counts = orgVolunteerViews(db, buildIndexes(db), orgId as string).reduce<
        Record<string, number>
      >((acc, v) => ((acc[v.status ?? 'NONE'] = (acc[v.status ?? 'NONE'] ?? 0) + 1), acc), {});
      return {
        text: `This organization has ${counts.ACTIVE ?? 0} active volunteers, ${(counts.APPLIED ?? 0) + (counts.INTERVIEWED ?? 0) + (counts.TRAINED ?? 0)} in the recruitment pipeline, and ${counts.INACTIVE ?? 0} inactive.`,
        link: { label: 'Open New volunteers', to: '/recruitment' },
      };
    },
  },
];

/** Words too common to help matching. */
const STOP_WORDS = new Set([
  'how',
  'do',
  'i',
  'a',
  'an',
  'the',
  'to',
  'can',
  'my',
  'me',
  'what',
  'is',
  'are',
  'of',
  'for',
  'in',
  'on',
  'and',
  'or',
  'it',
  'where',
  'when',
  'does',
  'with',
  'you',
  'please',
]);
/** Minimum summed keyword relevance before an FAQ answer is trusted. */
const MIN_FAQ_SCORE = 0.55;

/**
 * Ranks FAQ entries by fuzzy-matching EACH meaningful word and summing relevance, which
 * handles natural phrasing ("how do I export a report") far better than matching the whole
 * sentence at once.
 * @param entries - FAQ entries visible to the user.
 * @param question - Raw question.
 * @returns Entries with a relevance score, best first.
 */
export function rankFaq(
  entries: readonly FaqEntry[],
  question: string,
): Array<{ entry: FaqEntry; score: number }> {
  const fuse = new Fuse<FaqEntry>(entries, {
    keys: [
      { name: 'question', weight: 0.5 },
      { name: 'keywords', weight: 0.4 },
      { name: 'answer', weight: 0.1 },
    ],
    threshold: 0.3,
    ignoreLocation: true,
    includeScore: true,
  });
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  const totals = new Map<string, { entry: FaqEntry; score: number }>();
  for (const w of words) {
    for (const hit of fuse.search(w)) {
      const t = totals.get(hit.item.id) ?? { entry: hit.item, score: 0 };
      t.score += 1 - (hit.score ?? 1);
      totals.set(hit.item.id, t);
    }
  }
  return [...totals.values()].sort((a, b) => b.score - a.score);
}

/**
 * Answers a question.
 * @param db - Database.
 * @param ctx - Asker and their active org/role.
 * @param question - Free-text question.
 * @returns A reply with optional link and suggestions.
 */
export function answer(db: DataSnapshot, ctx: AssistantContext, question: string): AssistantReply {
  const q = question.trim();
  const examples = ctx.role
    ? [...EXAMPLE_QUESTIONS.manage.slice(0, 2), ...EXAMPLE_QUESTIONS.self.slice(0, 1)]
    : EXAMPLE_QUESTIONS.self;
  if (!q)
    return {
      text: 'Ask me how to do something, or a question about your data.',
      suggestions: examples,
    };

  for (const intent of DATA_INTENTS) {
    const m = q.match(intent.pattern);
    if (!m) continue;
    if (intent.scope === 'self')
      return { ...intent.handle(db, ctx, m), suggestions: examples.slice(0, 3) };
    if (ctx.orgId && can(ctx.role, intent.scope))
      return { ...intent.handle(db, ctx, m), suggestions: examples.slice(0, 3) };
    return {
      text: ctx.orgId
        ? "Your role in this organization doesn't include that information."
        : 'That needs a management role. For privacy, you can only see your own volunteering data. Try "How many hours do I have?"',
      link: { label: 'Open My hours', to: '/me/hours' },
    };
  }

  const ranked = rankFaq(visibleFaq(ctx.managesAnyOrg), q);
  if (ranked.length && ranked[0].score >= MIN_FAQ_SCORE) {
    const best = ranked[0].entry;
    return {
      text: best.answer,
      link: best.route ? { label: 'Take me there', to: best.route } : undefined,
      suggestions: ranked.slice(1, 4).map((h) => h.entry.question),
    };
  }
  return {
    text: "I'm not sure about that one. Here are the closest help topics — or try one of the example questions.",
    suggestions: ranked
      .slice(0, 3)
      .map((h) => h.entry.question)
      .concat(examples.slice(0, 2)),
  };
}
