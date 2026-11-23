/**
 * @file 404 page for unknown routes.
 */
import { ButtonLink } from '@/components/Button';
import { EmptyState } from '@/components/Layout';

/**
 * Shown when a route doesn't exist.
 * @returns The page.
 */
export default function NotFoundPage() {
  return (
    <EmptyState
      title="That page doesn’t exist"
      message="It may have moved. Head back to the dashboard to keep going."
      action={
        <ButtonLink to="/" variant="primary">
          Back to dashboard
        </ButtonLink>
      }
    />
  );
}
