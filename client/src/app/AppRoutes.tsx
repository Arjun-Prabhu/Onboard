/**
 * @file Route table with permission guards (FR-2, FR-3b).
 *
 * - Manage routes (`/`, `/sessions`, `/reports`, …) act on the org chosen in the switcher and
 *   require a permission there. Without it the person is sent to My volunteering — never to a
 *   broken page.
 * - My volunteering routes (`/me/…`) are for every person, across all orgs.
 * Pages are lazy-loaded so the first screen appears fast (NFR-3).
 */
import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Permission } from '@shared/permissions';
import { Loading } from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
import { OrgProvider, useOrg } from '@/context/OrgContext';
import { HelpProvider } from '@/features/help/HelpContext';
import { AppShell } from './AppShell';
import { savedMode } from './navigation';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const SignUpPage = lazy(() => import('@/pages/SignUpPage'));
const GuestSignUpPage = lazy(() => import('@/pages/GuestSignUpPage'));
const AdminDashboardPage = lazy(() => import('@/pages/AdminDashboardPage'));
const NoOrganizationPage = lazy(() => import('@/pages/NoOrganizationPage'));
const RecruitmentPage = lazy(() => import('@/pages/RecruitmentPage'));
const VolunteersPage = lazy(() => import('@/pages/VolunteersPage'));
const VolunteerDetailPage = lazy(() => import('@/pages/VolunteerDetailPage'));
const SitesPage = lazy(() => import('@/pages/SitesPage'));
const ProgramsPage = lazy(() => import('@/pages/ProgramsPage'));
const SessionsPage = lazy(() => import('@/pages/SessionsPage'));
const SessionDetailPage = lazy(() => import('@/pages/SessionDetailPage'));
const CalendarPage = lazy(() => import('@/pages/CalendarPage'));
const HoursApprovalPage = lazy(() => import('@/pages/HoursApprovalPage'));
const ReportsPage = lazy(() => import('@/pages/ReportsPage'));
const EquipmentPage = lazy(() => import('@/pages/EquipmentPage'));
const OrgSettingsPage = lazy(() => import('@/pages/OrgSettingsPage'));
const MembersPage = lazy(() => import('@/pages/MembersPage'));
const CreateOrgPage = lazy(() => import('@/pages/CreateOrgPage'));
const MyOverviewPage = lazy(() => import('@/pages/MyOverviewPage'));
const FindSessionsPage = lazy(() => import('@/pages/FindSessionsPage'));
const MySchedulePage = lazy(() => import('@/pages/MySchedulePage'));
const MyHoursPage = lazy(() => import('@/pages/MyHoursPage'));
const OrganizationsPage = lazy(() => import('@/pages/OrganizationsPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const HelpPage = lazy(() => import('@/pages/HelpPage'));
const ChallengePage = lazy(() => import('@/pages/ChallengePage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

/**
 * Renders children only for signed-in people.
 * @param props - Children.
 * @returns The children, a redirect, or a loader.
 */
function SignedIn({ children }: { children: ReactNode }) {
  const { user, initializing } = useAuth();
  const location = useLocation();
  if (initializing) return <Loading label="Starting Onboard…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/**
 * Renders a Manage page only if the person's role in the active org grants `permission`.
 * @param props - Required permission and children.
 * @returns The page, or a redirect to My volunteering.
 */
function Manage({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { loading, activeOrg, can } = useOrg();
  if (loading) return <Loading />;
  // No org to manage: Organize Home offers to create one.
  if (!activeOrg) return <Navigate to="/" replace />;
  if (!can(permission)) return <Navigate to="/me" replace />;
  // Keying by org remounts the page when the switcher changes, so no stale data shows.
  // `contents` keeps the wrapper out of layout, so full-height pages can stretch inside <main>.
  return (
    <div key={activeOrg.id} className="contents">
      {children}
    </div>
  );
}

/**
 * Organize Home: the active org's dashboard, or, for someone who runs no organization, an empty
 * page offering to create one. That empty page shows only when they chose Organize; signing in
 * without an org (and without having chosen Organize) lands on Volunteer Home instead.
 * @returns The page or a redirect.
 */
function OrganizeHome() {
  const { loading, activeOrg } = useOrg();
  if (loading) return <Loading />;
  if (activeOrg)
    return (
      <Manage permission="volunteers.view">
        <AdminDashboardPage />
      </Manage>
    );
  return savedMode() === 'organize' ? <NoOrganizationPage /> : <Navigate to="/me" replace />;
}

/**
 * Redirects signed-in people away from public pages.
 * @param props - Children.
 * @returns The page or a redirect.
 */
function PublicOnly({ children }: { children: ReactNode }) {
  const { user, initializing } = useAuth();
  if (initializing) return <Loading label="Starting Onboard…" />;
  return user ? <Navigate to="/" replace /> : <>{children}</>;
}

/**
 * Redirects a renamed public page, keeping its query string.
 * @param props - The new path.
 * @returns The redirect.
 */
function RenamedTo({ path }: { path: string }) {
  const { search } = useLocation();
  return <Navigate to={`${path}${search}`} replace />;
}

/**
 * The application's routes.
 * @returns The route tree.
 */
export function AppRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnly>
              <LoginPage />
            </PublicOnly>
          }
        />
        <Route
          path="/signup"
          element={
            <PublicOnly>
              <SignUpPage />
            </PublicOnly>
          }
        />
        <Route
          path="/help-once"
          element={
            <PublicOnly>
              <GuestSignUpPage />
            </PublicOnly>
          }
        />
        {/* Links shared before the sign-up page was renamed keep working, ?org= included. */}
        <Route path="/apply" element={<RenamedTo path="/signup" />} />
        <Route
          element={
            <SignedIn>
              <OrgProvider>
                <HelpProvider>
                  <AppShell />
                </HelpProvider>
              </OrgProvider>
            </SignedIn>
          }
        >
          {/* Manage: the org selected in the switcher */}
          <Route index element={<OrganizeHome />} />
          <Route
            path="sessions"
            element={
              <Manage permission="volunteers.view">
                <SessionsPage />
              </Manage>
            }
          />
          <Route
            path="calendar"
            element={
              <Manage permission="volunteers.view">
                <CalendarPage scope="org" />
              </Manage>
            }
          />
          <Route
            path="hours"
            element={
              <Manage permission="hours.review">
                <HoursApprovalPage />
              </Manage>
            }
          />
          <Route
            path="recruitment"
            element={
              <Manage permission="volunteers.pipeline">
                <RecruitmentPage />
              </Manage>
            }
          />
          <Route
            path="volunteers"
            element={
              <Manage permission="volunteers.view">
                <VolunteersPage />
              </Manage>
            }
          />
          <Route
            path="volunteers/:id"
            element={
              <Manage permission="volunteers.view">
                <VolunteerDetailPage />
              </Manage>
            }
          />
          <Route
            path="programs"
            element={
              <Manage permission="volunteers.view">
                <ProgramsPage />
              </Manage>
            }
          />
          <Route
            path="sites"
            element={
              <Manage permission="sites.edit">
                <SitesPage />
              </Manage>
            }
          />
          <Route
            path="equipment"
            element={
              <Manage permission="equipment.manage">
                <EquipmentPage />
              </Manage>
            }
          />
          <Route path="items" element={<Navigate to="/equipment" replace />} />
          <Route
            path="org/settings"
            element={
              <Manage permission="org.settings">
                <OrgSettingsPage />
              </Manage>
            }
          />
          <Route
            path="reports"
            element={
              <Manage permission="reports.view">
                <ReportsPage />
              </Manage>
            }
          />
          <Route
            path="org/members"
            element={
              <Manage permission="volunteers.view">
                <MembersPage />
              </Manage>
            }
          />
          {/* Any person */}
          <Route path="orgs/new" element={<CreateOrgPage />} />
          <Route path="sessions/:id" element={<SessionDetailPage />} />
          <Route path="me" element={<MyOverviewPage />} />
          <Route path="me/find" element={<FindSessionsPage />} />
          <Route path="me/schedule" element={<MySchedulePage />} />
          <Route path="me/calendar" element={<CalendarPage scope="mine" />} />
          <Route path="me/hours" element={<MyHoursPage />} />
          <Route path="me/orgs" element={<OrganizationsPage />} />
          <Route path="me/profile" element={<ProfilePage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="challenge" element={<ChallengePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
