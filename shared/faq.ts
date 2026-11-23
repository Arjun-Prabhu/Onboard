/**
 * @file Help Center / assistant knowledge base (FR-23, FR-32).
 *
 * One source feeds the searchable Help Center, the assistant's fuzzy "how-to" matching, and
 * the "Take me there" deep links. Kept as typed data (rather than JSON) so routes are checked.
 */

/** A single FAQ article. */
export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  /** Extra search terms that users might type. */
  keywords: string[];
  category:
    | 'Getting started'
    | 'Organizations'
    | 'Volunteers'
    | 'Sessions'
    | 'Hours'
    | 'Reports'
    | 'Accessibility'
    | 'Account';
  /** Deep link for "Take me there". */
  route?: string;
  /**
   * `manage` = only for people who hold a Membership somewhere. Omitted = everyone, because
   * every person can volunteer.
   */
  audience?: 'manage';
}

/** All FAQ entries. */
export const FAQ: readonly FaqEntry[] = [
  {
    id: 'apply',
    category: 'Getting started',
    question: 'How do I apply to become a volunteer?',
    answer:
      'Use "Apply to volunteer" on the sign-in screen and choose the organization. Fill in your contact details, skills, and when you are free. A program lead will review your application, schedule a short interview, and invite you to training.',
    keywords: ['join', 'sign up', 'register', 'application'],
    route: '/apply',
  },
  {
    id: 'multi-org',
    category: 'Organizations',
    question: 'Can I manage one organization and volunteer for another?',
    answer:
      'Yes. You have one login, and roles belong to each organization: you can be an Owner, Admin or Coordinator in some and a volunteer in any. Use the Volunteer / Organize switch at the top of the sidebar: Organize runs the organization picked in the switcher below it, and Volunteer covers your own shifts and hours at every organization at once.',
    keywords: ['switch', 'roles', 'owner', 'two organizations', 'multiple', 'switcher'],
    route: '/me/orgs',
  },
  {
    id: 'create-org',
    category: 'Organizations',
    question: 'How do I create an organization?',
    answer:
      'Switch to Organize, open the organization switcher and choose "Create organization". You become its Owner and can appoint Admins and Coordinators right away.',
    keywords: ['new org', 'start', 'nonprofit', 'owner'],
    route: '/orgs/new',
  },
  {
    id: 'members',
    category: 'Organizations',
    question: 'How do I appoint an Admin or Coordinator?',
    answer:
      'Open Settings → Team & roles, choose "Appoint member", enter the person’s Onboard email and pick a role. Owners can appoint anyone; Admins can appoint Coordinators. Every organization always keeps at least one Owner.',
    keywords: ['add admin', 'invite', 'permissions', 'role', 'staff', 'appoint'],
    route: '/org/members',
    audience: 'manage',
  },
  {
    id: 'roles',
    category: 'Organizations',
    question: 'What can Owners, Admins and Coordinators do?',
    answer:
      'Coordinators run sessions day to day: rosters, check-in, and hour approval. Admins also manage sites, programs, items, the recruitment pipeline, reports, and Coordinators. Owners can do everything, including appointing Admins and offering ownership: the person offered sees it on their Home page and accepts or declines.',
    keywords: ['permissions', 'access', 'rights', 'difference'],
    route: '/org/members',
    audience: 'manage',
  },
  {
    id: 'join-org',
    category: 'Organizations',
    question: 'How do I volunteer with another organization?',
    answer:
      'In Volunteer mode, open Profile → My organizations and choose "Apply to volunteer". Your skills and availability carry over, so there is nothing to fill in again.',
    keywords: ['join', 'apply', 'another org', 'partner'],
    route: '/me/orgs',
  },
  {
    id: 'guest',
    category: 'Organizations',
    question: 'What is a guest sign-up?',
    answer:
      'Some events, like public competitions, are marked "Open to guests". Anyone can help once without joining the organization. Guest sessions appear in your schedule and hours, but the organization is not added to your switcher.',
    keywords: ['one time', 'open to guests', 'event', 'judge'],
    route: '/me/find',
  },
  {
    id: 'signup-session',
    category: 'Sessions',
    question: 'How do I sign up for a session?',
    answer:
      'In Volunteer mode, open Find a shift. Type in the search box to narrow the list, then choose "Sign up". If the shift is full you can join the waiting list and you will be moved in automatically if someone cancels.',
    keywords: ['join session', 'volunteer for', 'book', 'register session'],
    route: '/me/find',
  },
  {
    id: 'waitlist',
    category: 'Sessions',
    question: 'How does the waitlist work?',
    answer:
      'When a session is full, new sign-ups go on a numbered waitlist. If a signed-up volunteer cancels, the first person on the waitlist is promoted automatically.',
    keywords: ['full', 'wait list', 'queue'],
    route: '/me/find',
  },
  {
    id: 'cancel',
    category: 'Sessions',
    question: 'How do I cancel a sign-up?',
    answer:
      'Go to My shifts, find the shift, and choose "Cancel". Please cancel as early as you can so the next person on the waitlist can take your spot.',
    keywords: ['drop', 'remove', 'cannot make it'],
    route: '/me/schedule',
  },
  {
    id: 'checkin',
    category: 'Sessions',
    question: 'How do check-in and check-out work?',
    answer:
      'On the day of a session, press "Check in" when you arrive and "Check out" when you leave. Your service hours are logged automatically and sent to that organization for approval.',
    keywords: ['attendance', 'arrive', 'check in'],
    route: '/me/schedule',
  },
  {
    id: 'log-hours',
    category: 'Hours',
    question: 'How do I log hours manually?',
    answer:
      'Open My hours and choose "Log hours". Pick the organization, then enter the date, the number of hours (in quarter-hour steps), and what you did. Hours cannot be in the future and you can log at most 12 hours per day.',
    keywords: ['add hours', 'service hours', 'record time'],
    route: '/me/hours',
  },
  {
    id: 'certificate',
    category: 'Hours',
    question: 'How do I download my service-hours certificate?',
    answer:
      'Open My hours. Each organization you volunteer with has its own certificate button. The PDF includes only hours that organization has approved.',
    keywords: ['pdf', 'proof', 'site credit', 'letter'],
    route: '/me/hours',
  },
  {
    id: 'availability',
    category: 'Volunteers',
    question: 'How do I update my availability?',
    answer:
      'Open My profile and edit your weekly availability. It applies to every organization you volunteer with, and you can only sign up for sessions inside a time you are available.',
    keywords: ['schedule', 'free time', 'days'],
    route: '/me/profile',
  },
  {
    id: 'approve-hours',
    category: 'Hours',
    question: 'How do I approve or reject hours?',
    answer:
      'Open Hours (or approve straight from the Home list). Each pending entry shows the volunteer, session, and hours. Choose Approve, or Reject with an optional note the volunteer will see.',
    keywords: ['review hours', 'pending'],
    route: '/hours',
    audience: 'manage',
  },
  {
    id: 'pipeline',
    category: 'Volunteers',
    question: 'How do I move an applicant through the pipeline?',
    answer:
      'Open Volunteers → New volunteers. Each column is a step: New application, Interviewed, Trained, Ready to serve, Taking a break. Use the "Move to" button on a card. Every change is timestamped in the volunteer’s history for your organization.',
    keywords: ['applicant', 'recruit', 'approve volunteer', 'stage'],
    route: '/recruitment',
    audience: 'manage',
  },
  {
    id: 'training',
    category: 'Volunteers',
    question: 'Why can’t I assign a volunteer to a session?',
    answer:
      'Volunteers must be Ready to serve in YOUR organization, with every requirement on its checklist complete and not expired, before they can work shifts and events; standing at another organization does not count. They also need availability that covers the session and no overlapping booking anywhere.',
    keywords: [
      'blocked',
      'not eligible',
      'requirement',
      'checklist',
      'background check',
      'expired',
    ],
    route: '/volunteers',
    audience: 'manage',
  },
  {
    id: 'requirements',
    category: 'Volunteers',
    question: 'How do I set what volunteers must complete before serving?',
    answer:
      'Open Settings → Organization → Volunteer requirements and add each item (a background check, a training, a CPR card…), with how many months it stays valid. Then record completions on each volunteer’s checklist. Items expiring within 30 days show as Expiring soon; expired items block new sign-ups until renewed.',
    keywords: [
      'requirement',
      'checklist',
      'background check',
      'training',
      'expire',
      'renew',
      'certification',
    ],
    route: '/org/settings',
    audience: 'manage',
  },
  {
    id: 'org-words',
    category: 'Getting started',
    question: 'Can Onboard use my organization’s own words?',
    answer:
      'Yes. Settings → Organization sets what you call the places you serve (School, Clinic, Field…), the people you serve (Students, Patients, Players…), your equipment and your priority flag. Every screen, rule message and report uses them. You can also switch off equipment tracking, priority sites or guest volunteers, and edit your skill catalog and event roles.',
    keywords: ['terms', 'words', 'rename', 'sector', 'clinic', 'sports', 'customize', 'settings'],
    route: '/org/settings',
    audience: 'manage',
  },
  {
    id: 'add-volunteer',
    category: 'Volunteers',
    question: 'How do I add a volunteer?',
    answer:
      'Open Volunteers and choose "Add volunteer". Enter their name and email. If they already have an Onboard account they are added to your organization; otherwise an account is made and you get a temporary password to pass on. You can also choose "Copy application link" and share it so people apply themselves. To put someone on a session, open the session and use "Add anyone else".',
    keywords: ['add volunteer', 'new volunteer', 'invite', 'recruit', 'application link', 'assign'],
    route: '/volunteers',
    audience: 'manage',
  },
  {
    id: 'repeat',
    category: 'Sessions',
    question: 'How do I schedule a session every week?',
    answer:
      'Choose "New session" (or "Add a session" on a program), fill in the first date, then turn on "Repeat every week". Pick the days and the last date; Onboard shows how many sessions it will create and makes them all at once. For something that happens only once, like a fundraiser, choose "One-time event" instead of a program.',
    keywords: ['repeat', 'recurring', 'weekly', 'bulk', 'every week', 'one-time', 'fundraiser'],
    route: '/sessions',
    audience: 'manage',
  },
  {
    id: 'matching',
    category: 'Sessions',
    question: 'How does volunteer matching work?',
    answer:
      'For each session Onboard filters to eligible, available volunteers in your organization and scores them: skill match 35%, reliability 25%, proximity 15%, experience balance 15%, and fair distribution 10%. Each recommendation explains why it was chosen.',
    keywords: ['recommend', 'suggest', 'smart match', 'score'],
    route: '/sessions',
    audience: 'manage',
  },
  {
    id: 'risk',
    category: 'Sessions',
    question: 'What do the staffing-risk badges mean?',
    answer:
      'High, Medium, and Low risk combine how many volunteer seats are open, how likely signed-up volunteers are to no-show, and how soon the session is. High-risk sessions appear at the top of the dashboard.',
    keywords: ['alert', 'understaffed', 'red', 'warning'],
    route: '/',
    audience: 'manage',
  },
  {
    id: 'create-session',
    category: 'Sessions',
    question: 'How do I create a session?',
    answer:
      'Open Schedule and choose "New session". Pick the program, type (regular shift, event or training), date, times, title, required skills, and how many volunteers are needed. Under More options, turn on "Open to everyone" for events anyone may help with once.',
    keywords: ['add session', 'schedule', 'new shift', 'new event'],
    route: '/sessions',
    audience: 'manage',
  },
  {
    id: 'sites',
    category: 'Getting started',
    question: 'How do I add a site or program?',
    answer:
      'Add the place first under Settings (the tab uses your own word, e.g. Schools or Clinics): name, address, contact, and a priority flag or served range if your organization keeps them. Then open Schedule → Programs and add a program there. A program is something that repeats, like a weekly club; its sessions are the individual dates.',
    keywords: ['new site', 'partner', 'program'],
    route: '/sites',
    audience: 'manage',
  },
  {
    id: 'reports',
    category: 'Reports',
    question: 'How do I build a custom report?',
    answer:
      'Open Reports. Pick a preset or choose a metric, how to group it, a date range, and filters. Choose a chart type, then export to PDF or CSV. Reports cover the organization selected in the switcher.',
    keywords: ['export', 'sponsor', 'chart', 'analytics', 'impact'],
    route: '/reports',
    audience: 'manage',
  },
  {
    id: 'filters',
    category: 'Sessions',
    question: 'Can I save my filters?',
    answer:
      'Yes. After setting filters on a sessions screen, choose "Save filters" and name the preset. It appears as a chip you can click any time.',
    keywords: ['preset', 'saved search'],
    route: '/me/find',
  },
  {
    id: 'a11y',
    category: 'Accessibility',
    question: 'How do I make text bigger or change contrast?',
    answer:
      'Select your name at the bottom of the sidebar and choose App settings. You can scale text, turn on high contrast or dark mode, use a dyslexia-friendly font, and reduce motion.',
    keywords: ['font size', 'dark mode', 'contrast', 'dyslexia', 'zoom'],
    route: '/settings',
  },
  {
    id: 'keyboard',
    category: 'Accessibility',
    question: 'Can I use Onboard with only a keyboard?',
    answer:
      'Yes. Press Tab to move between controls, Enter or Space to activate, and Esc to close dialogs. "Skip to content" appears on the first Tab. Press F1 on any screen for help about that screen, and [ to collapse or expand the sidebar.',
    keywords: ['shortcuts', 'tab', 'f1', 'screen reader'],
    route: '/help',
  },
  {
    id: 'data',
    category: 'Account',
    question: 'Where is my data stored?',
    answer:
      'Onboard runs as a web app on the organizer’s laptop. Data lives in a local database file there and is not sent to any cloud service. Open it in any modern browser.',
    keywords: ['wifi', 'internet', 'privacy', 'data', 'cloud', 'stored'],
  },
  {
    id: 'reset',
    category: 'Account',
    question: 'How do I reset the demo data?',
    answer:
      'Select your name at the bottom of the sidebar, choose App settings, then "Reset demo data". This restores the original sample organizations, people, and sessions.',
    keywords: ['start over', 'restore', 'seed'],
    route: '/settings',
  },
];

/**
 * FAQ entries visible to a person.
 * @param managesAnyOrg - Whether the person holds any Membership.
 * @returns Visible entries.
 */
export function visibleFaq(managesAnyOrg: boolean): FaqEntry[] {
  return FAQ.filter((f) => f.audience !== 'manage' || managesAnyOrg);
}
