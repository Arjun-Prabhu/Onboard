/**
 * @file Context-sensitive help text for every screen (FR-31).
 *
 * Matched against the current pathname — the first entry whose pattern matches wins.
 */

/** Help for one screen. */
export interface ScreenHelp {
  pattern: RegExp;
  title: string;
  summary: string;
  steps: string[];
}

/** Help entries, most specific first. */
export const SCREEN_HELP: readonly ScreenHelp[] = [
  {
    pattern: /^\/sessions\/[^/]+$/,
    title: 'Session details',
    summary:
      'Everything about one session: who is coming, who is waiting, and who would be a good fit.',
    steps: [
      'The peg meter shows filled volunteer seats. Empty pegs are open seats.',
      'Admins: "Recommended volunteers" ranks eligible volunteers and explains each score. Choose Assign to add one.',
      'On the day, use Check in and Check out. Hours are logged automatically for approval.',
      'If someone cancels, the first person on the waitlist moves in automatically.',
    ],
  },
  {
    pattern: /^\/sessions/,
    title: 'Schedule',
    summary: 'Find and manage sessions. Filters combine, so you can ask for exactly what you need.',
    steps: [
      'Combine filters like priority sites + Tuesday + a skill + next 14 days.',
      'Save a combination as a preset with "Save filters" and reuse it from the chips.',
      'Volunteers: choose Sign up. Full sessions offer the waitlist instead.',
      'Choose "New session". Pick "Part of a program", or "One-time event" for something that happens once.',
      'Turn on "Repeat every week" and pick the days to create a whole season of sessions at once.',
    ],
  },
  {
    pattern: /^\/volunteers\/[^/]+$/,
    title: 'Volunteer profile',
    summary: 'One volunteer’s details, pipeline history, sessions, and hours.',
    steps: [
      'Record each requirement on the checklist (training, background check…) before marking someone Ready to serve.',
      'Items that expire show as Expiring soon or Expired; use Renew to record a new date.',
      'Every pipeline change is timestamped in History.',
    ],
  },
  {
    pattern: /^\/volunteers/,
    title: 'Volunteers',
    summary: 'Search, filter, and open any volunteer.',
    steps: [
      'Use "Add volunteer" to add someone directly, or "Copy application link" to share the sign-up form.',
      'Search by name, email, or affiliation.',
      'Filter by status or skill.',
      'Select a name to open the full profile.',
    ],
  },
  {
    pattern: /^\/recruitment/,
    title: 'New volunteers',
    summary: 'Take new people from application to Ready to serve.',
    steps: [
      'Each column is a step. Use "Move to" on a card to move someone along.',
      'Someone can only be Ready to serve once everything on their checklist is done.',
      'The "Taking a break" column lists people you might invite back.',
    ],
  },
  {
    pattern: /^\/programs/,
    title: 'Programs',
    summary: 'The ongoing activities you run, each with its own dates (sessions).',
    steps: [
      'A program is something that repeats, like a weekly club or a season. A session is one date of it.',
      'Use "Add a session" on a program card to put a new date on the calendar.',
      'Programs with logged hours can be archived but not deleted, so records stay intact.',
    ],
  },
  {
    pattern: /^\/sites/,
    title: 'Places',
    summary: 'The places you serve (schools, clinics, fields…).',
    steps: [
      'Add the place first, then add its programs under Schedule → Programs.',
      'If your organization keeps grades or ages served, Onboard checks the range is plausible.',
      'Sites or programs with logged hours can be archived but not deleted, so records stay intact.',
    ],
  },
  {
    pattern: /^\/calendar/,
    title: 'Schedule — calendar',
    summary: 'Every session by month, marked by staffing status.',
    steps: [
      'Each session shows a status icon and label as well as a color.',
      'Use the arrows or "Today" to move between months.',
      'Select a session to open it.',
    ],
  },
  {
    pattern: /^\/hours/,
    title: 'Hours',
    summary: 'Service-hour records and approvals.',
    steps: [
      'Hours from check-in/out appear automatically as Pending.',
      'Volunteers can log other service manually (max 12 hours per day, never in the future).',
      'Admins approve or reject with an optional note.',
      'Certificates include approved hours only.',
    ],
  },
  {
    pattern: /^\/reports/,
    title: 'Reports',
    summary: 'Build a report, chart it, and export it.',
    steps: [
      'Start from a preset or choose a metric and how to group it.',
      'Set the date range and any filters.',
      'Pick bar, line, or pie. Every chart also has a table.',
      'Export to PDF (with your filters printed on it) or CSV.',
    ],
  },
  {
    pattern: /^\/equipment/,
    title: 'Equipment',
    summary: 'Track lendable equipment (kits, cuffs, gear bags…) across programs.',
    steps: [
      'Check an item out to a program and return it when done.',
      'An item can only be with one program at a time; retired items can’t go out.',
      'Turn equipment tracking off in Organization settings if you don’t lend anything.',
    ],
  },
  {
    pattern: /^\/org\/settings/,
    title: 'Organization settings',
    summary: 'Make Onboard speak your organization’s language.',
    steps: [
      'Pick the kind of organization, then adjust the words: what you call places, the people you serve and your equipment.',
      'Switch off features you don’t use (equipment, priority sites, guests); menus hide them.',
      'Edit the skill catalog and event roles offered on sessions.',
      'Add requirements volunteers must complete, with an optional renewal period.',
    ],
  },
  {
    pattern: /^\/me\/schedule/,
    title: 'My schedule',
    summary: 'Your upcoming and past sessions.',
    steps: [
      'Check in when you arrive and check out when you leave.',
      'Cancel early if you can’t make it so the waitlist can move up.',
    ],
  },
  {
    pattern: /^\/me\/profile/,
    title: 'Profile',
    summary: 'Your contact details, skills, and the times you’re free.',
    steps: [
      'Keep your free times current — you can only sign up for shifts inside them.',
      'Your skills decide which shifts are suggested for you.',
    ],
  },
  {
    pattern: /^\/me\/find/,
    title: 'Find a shift',
    summary: 'Open shifts at every organization you volunteer with, plus events open to everyone.',
    steps: [
      'Type in the search box to narrow the list.',
      'Choose Sign up. Full shifts offer the waiting list instead.',
      '"Help once" means a one-time sign-up at an organization you haven’t joined.',
    ],
  },
  {
    pattern: /^\/me\/hours/,
    title: 'My hours',
    summary: 'Your service hours at every organization.',
    steps: [
      'Hours from check-out appear automatically as Pending.',
      'Log other service with "Log hours" and pick the organization.',
      'Each organization has its own certificate with only the hours it approved.',
    ],
  },
  {
    pattern: /^\/me\/orgs/,
    title: 'My organizations',
    summary: 'Every organization in Onboard and how you’re connected to it.',
    steps: [
      'Apply to volunteer with one click — your profile carries over.',
      'Choose Manage on an organization you lead to switch to it.',
      'Create your own organization to become its Owner.',
    ],
  },
  {
    pattern: /^\/me\/calendar/,
    title: 'My shifts — calendar',
    summary: 'Your own shifts at every organization, by month.',
    steps: [
      'Each session shows a status icon and label as well as a color.',
      'Select a session to open it.',
    ],
  },
  {
    pattern: /^\/me$/,
    title: 'Home',
    summary: 'Your next shift, a few shifts picked for you, and your hours.',
    steps: [
      'On the day of a shift, press "I’m here — check in" when you arrive.',
      '"Suggested for you" lists shifts that fit your skills and free times.',
      'Switch to Organize (top left) if you also run an organization.',
    ],
  },
  {
    pattern: /^\/org\/members/,
    title: 'Team & roles',
    summary: 'Who helps run this organization, and what each role can do.',
    steps: [
      'Owners appoint Admins and Coordinators, and offer ownership (the person accepts it on their Home page); Admins appoint Coordinators.',
      'Change a role from the dropdown in the row.',
      'Every organization always keeps at least one Owner.',
    ],
  },
  {
    pattern: /^\/orgs\/new/,
    title: 'Create an organization',
    summary: 'Start a new organization and become its Owner.',
    steps: [
      'Give it a unique name and a one-line description.',
      'You keep volunteering and any roles you hold elsewhere.',
    ],
  },
  {
    pattern: /^\/settings/,
    title: 'App settings',
    summary: 'Make Onboard comfortable to use.',
    steps: ['Change theme, text size, and font.', 'Reduce motion if animations are distracting.'],
  },
  {
    pattern: /^\/challenge/,
    title: 'FBLA challenge',
    summary: 'How each part of the FBLA prompt maps to features.',
    steps: ['Every feature listed links to where it lives in the app.'],
  },
  {
    pattern: /^\/help/,
    title: 'Help Center',
    summary: 'Search answers or replay the guided tour.',
    steps: [
      'Type a question or browse by category.',
      'The Help button at the top of every screen explains that screen.',
    ],
  },
  {
    pattern: /^\/$/,
    title: 'Home',
    summary: 'Only what needs you today in the organization you’re running.',
    steps: [
      'Work down "Needs your attention": each row has one button.',
      '"Find volunteers" opens the session with suggested people to add.',
      'Approve hours right from the list. When it’s empty, you’re all caught up.',
    ],
  },
];

/**
 * Finds help for a pathname.
 * @param pathname - Current route path.
 * @returns The matching help entry, or the dashboard entry as a fallback.
 */
export function helpFor(pathname: string): ScreenHelp {
  return SCREEN_HELP.find((h) => h.pattern.test(pathname)) ?? SCREEN_HELP[SCREEN_HELP.length - 1];
}
