/**
 * @file Organize Home for someone who doesn't run an organization yet.
 *
 * Everyone can switch to Organize mode. Without an organization there's nothing to manage, so
 * this page explains what Organize is for and offers the one next step: create an organization.
 * Volunteering is unaffected and stays one click away in Volunteer mode.
 */
import { Building2, HeartHandshake } from 'lucide-react';
import { ButtonLink } from '@/components/Button';
import { EmptyState, PageHeader, Panel } from '@/components/Layout';

/**
 * The page.
 * @returns The page.
 */
export default function NoOrganizationPage() {
  return (
    <>
      <PageHeader title="Organize" />
      <Panel className="max-w-3xl">
        <EmptyState
          icon={<Building2 className="size-8" />}
          title="You’re not running an organization yet"
          message="Create one to schedule sessions, recruit and match volunteers, approve hours, and report your impact. Your volunteering stays as it is."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink
                to="/orgs/new"
                variant="primary"
                icon={<Building2 className="size-4" aria-hidden />}
              >
                Create an organization
              </ButtonLink>
              <ButtonLink
                to="/me"
                variant="secondary"
                icon={<HeartHandshake className="size-4" aria-hidden />}
              >
                Back to volunteering
              </ButtonLink>
            </div>
          }
        />
      </Panel>
    </>
  );
}
