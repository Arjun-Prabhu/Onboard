/**
 * @file "How Onboard Meets the Challenge" (§1.4) — maps each verb of the FBLA prompt to the
 * features that satisfy it. Links appear only where the viewer's role lets them open the page.
 */
import { Link } from 'react-router-dom';
import type { Permission } from '@shared/permissions';
import { PageHeader } from '@/components/Layout';
import { useOrg } from '@/context/OrgContext';

/** One feature in the mapping. */
interface Feature {
  name: string;
  detail: string;
  to?: string;
  /** Permission needed in the active org to open the link. */
  needs?: Permission;
}

const MAPPING: Array<{ verb: string; summary: string; features: Feature[] }> = [
  {
    verb: 'Recruit',
    summary: 'Turn interest into trained, cleared volunteers.',
    features: [
      {
        name: 'Sign-up form',
        detail:
          'Create an account and, optionally, apply to an organization: skills, availability, experience — validated as you type.',
        to: '/signup',
      },
      {
        name: 'Volunteer at one event, no account',
        detail:
          'Anyone can sign up for an event an organization opened to guests with just a name, email and phone.',
        to: '/help-once',
      },
      {
        name: 'Recruitment pipeline',
        detail:
          'Applied → Interviewed → Trained → Active → Inactive, tracked per organization and timestamped.',
        to: '/recruitment',
        needs: 'volunteers.pipeline',
      },
      {
        name: 'One-click applications elsewhere',
        detail: 'Existing volunteers join another organization without re-entering anything.',
        to: '/me/orgs',
      },
      {
        name: 'Re-engagement alerts',
        detail: 'Active volunteers idle 30+ days surface on the dashboard.',
        to: '/',
        needs: 'volunteers.view',
      },
    ],
  },
  {
    verb: 'Organize',
    summary: 'Get the right people to the right sessions.',
    features: [
      {
        name: 'Organizations, owners & roles',
        detail:
          'Anyone can create an organization, become its Owner, and appoint Admins and Coordinators.',
        to: '/org/members',
        needs: 'volunteers.view',
      },
      {
        name: 'Sites, programs & sessions',
        detail: 'Year-round and seasonal programs with regular shifts, events and trainings.',
        to: '/sites',
        needs: 'sites.edit',
      },
      {
        name: 'Sign-ups, waitlists & guests',
        detail: 'Full sessions offer a waitlist; public events can accept one-time guests.',
        to: '/me/find',
      },
      {
        name: 'Volunteer matching',
        detail: 'Ranked recommendations with a plain-language reason for each score.',
        to: '/sessions',
        needs: 'roster.manage',
      },
      {
        name: 'Calendar',
        detail: 'Month view marked by staffing status — for an organization or for yourself.',
        to: '/me/calendar',
      },
    ],
  },
  {
    verb: 'Manage',
    summary: 'Keep records accurate and approved.',
    features: [
      {
        name: 'One identity, many roles',
        detail:
          'A single login can own one organization, coordinate another, and volunteer anywhere.',
        to: '/me/orgs',
      },
      {
        name: 'Profiles & availability',
        detail: 'Entered once, reused by every organization.',
        to: '/me/profile',
      },
      {
        name: 'Check-in & check-out',
        detail: 'Attendance recorded on the day; no-shows tracked.',
        to: '/me/schedule',
      },
      {
        name: 'Hour approval',
        detail: 'Auto-logged and manual hours, approved by another leader — never by yourself.',
        to: '/hours',
        needs: 'hours.review',
      },
      {
        name: 'Input validation',
        detail: '8 format rules and 14 meaning rules with friendly inline messages.',
      },
    ],
  },
  {
    verb: 'Monitor',
    summary: 'See what’s working and prove impact.',
    features: [
      {
        name: 'Staffing-risk alerts',
        detail: 'High / Medium / Low risk from open seats, no-show history and urgency.',
        to: '/',
        needs: 'roster.manage',
      },
      {
        name: 'Custom report builder',
        detail: 'Pick a measure, grouping, dates and filters; bar, line or pie.',
        to: '/reports',
        needs: 'reports.view',
      },
      {
        name: 'Sponsor impact report',
        detail: 'Hours at priority sites (e.g. Title I schools), exported as a branded PDF.',
        to: '/reports',
        needs: 'reports.view',
      },
      {
        name: 'Service-hours certificates',
        detail: 'One PDF per organization, approved hours only.',
        to: '/me/hours',
      },
      {
        name: 'Help assistant',
        detail: 'Answers how-to and data questions, respecting your role in each organization.',
      },
    ],
  },
];

/**
 * The challenge-mapping page.
 * @returns The page.
 */
export default function ChallengePage() {
  const { can } = useOrg();
  return (
    <>
      <PageHeader title="FBLA challenge" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {MAPPING.map((m) => (
          <section
            key={m.verb}
            aria-labelledby={`verb-${m.verb}`}
            className="rounded-panel border border-line bg-surface"
          >
            <header className="flex flex-wrap items-baseline gap-x-3 border-b border-line px-5 py-4">
              <h2 id={`verb-${m.verb}`} className="text-4xl font-bold text-ink">
                {m.verb}
              </h2>
              <p className="text-ink-muted">{m.summary}</p>
            </header>
            <ul className="divide-y divide-line">
              {m.features.map((f) => (
                <li key={f.name} className="px-5 py-3">
                  {f.to && (!f.needs || can(f.needs)) ? (
                    <Link
                      to={f.to}
                      className="font-semibold text-primary underline-offset-2 hover:underline"
                    >
                      {f.name}
                    </Link>
                  ) : (
                    <span className="font-semibold">{f.name}</span>
                  )}
                  <p className="text-sm text-ink-muted">{f.detail}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
