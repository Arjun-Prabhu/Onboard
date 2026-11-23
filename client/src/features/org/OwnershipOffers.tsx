/**
 * @file Ownership offers on screen (FR-3f).
 *
 * - {@link MyOwnershipOffers}: on the person's Home page, offers waiting for their answer, with
 *   Accept and Decline. Accepting makes them an Owner (and, for a hand-over, steps the person
 *   who offered down) at once.
 * - {@link OwnershipOfferList}: on Team & roles, for the org's Owners: the offer that's waiting
 *   (with Cancel offer) and any that were declined (with Dismiss).
 */
import { Crown } from 'lucide-react';
import { useState } from 'react';
import { messageOf } from '@shared/errors';
import { formatDate } from '@shared/time';
import type { OwnershipOfferView } from '@shared/types';
import { Button } from '@/components/Button';
import { useOrg } from '@/context/OrgContext';
import { useToast } from '@/context/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { useRefreshOnReturn } from '@/hooks/useRefreshOnReturn';
import { api } from '@/lib/api';

/**
 * "Dec 6" from an ISO instant.
 * @param iso - Instant.
 * @returns Short date.
 */
const day = (iso: string) => formatDate(iso.slice(0, 10), { year: undefined });

/** Frame shared by both lists: a highlighted box with a crown. */
function OfferBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-panel border-2 border-accent bg-surface p-4"
    >
      <Crown className="size-6 shrink-0 text-ink" aria-hidden />
      {children}
    </div>
  );
}

/**
 * Offers waiting for the signed-in person's answer. Renders nothing when there are none.
 * @returns The offers.
 */
export function MyOwnershipOffers() {
  const offers = useAsync(() => api.orgs.myOwnershipOffers(), []);
  useRefreshOnReturn(offers.reload);
  const { reload: reloadOrgs, setActiveOrg } = useOrg();
  const toast = useToast();
  const [busy, setBusy] = useState<string>();

  /**
   * Accepts or declines.
   * @param o - Offer.
   * @param accept - Answer.
   */
  const answer = async (o: OwnershipOfferView, accept: boolean) => {
    setBusy(o.offer.id + accept);
    try {
      await api.orgs.answerOwnershipOffer(o.offer.id, accept);
      if (accept) {
        await reloadOrgs();
        setActiveOrg(o.offer.orgId);
        toast.show(
          o.offer.stepDown
            ? `You’re now the Owner of ${o.orgName}.`
            : `You’re now a co-owner of ${o.orgName}.`,
        );
      } else toast.show(`You declined. ${o.from.firstName} will see your answer.`);
      offers.reload();
    } catch (err) {
      toast.show(messageOf(err), 'error');
      offers.reload();
    } finally {
      setBusy(undefined);
    }
  };

  if (!offers.data?.length) return null;
  return (
    <>
      {offers.data.map((o) => (
        <OfferBox key={o.offer.id}>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {o.offer.stepDown
                ? `${o.from.firstName} ${o.from.lastName} wants to hand ${o.orgName} over to you.`
                : `${o.from.firstName} ${o.from.lastName} wants you to be a co-owner of ${o.orgName}.`}
            </p>
            <p className="text-sm text-ink-muted">
              {o.offer.stepDown
                ? `You’d become its Owner, with full control, and ${o.from.firstName} would step down when you accept.`
                : `You’d share full control of the organization with ${o.from.firstName}.`}{' '}
              Answer by {day(o.expiresAt)}.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              loading={busy === o.offer.id + 'false'}
              onClick={() => void answer(o, false)}
            >
              Decline
            </Button>
            <Button loading={busy === o.offer.id + 'true'} onClick={() => void answer(o, true)}>
              Accept
            </Button>
          </div>
        </OfferBox>
      ))}
    </>
  );
}

/**
 * An org's open and declined offers, for its Owners.
 * @param props - The offers and a reload callback.
 * @returns The list.
 */
export function OwnershipOfferList({
  offers,
  onChanged,
}: {
  offers: OwnershipOfferView[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string>();

  /**
   * Cancels an open offer or clears a declined one.
   * @param o - Offer.
   */
  const withdraw = async (o: OwnershipOfferView) => {
    setBusy(o.offer.id);
    try {
      await api.orgs.withdrawOwnershipOffer(o.offer.id);
      if (o.offer.status === 'PENDING') toast.show(`Offer to ${o.to.firstName} cancelled.`);
      onChanged();
    } catch (err) {
      toast.show(messageOf(err), 'error');
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <>
      {offers.map((o) => {
        const who = `${o.to.firstName} ${o.to.lastName}`;
        const waiting = o.offer.status === 'PENDING';
        return (
          <OfferBox key={o.offer.id}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {waiting
                  ? o.offer.stepDown
                    ? `Waiting for ${who} to take over.`
                    : `Waiting for ${who} to join as a co-owner.`
                  : o.offer.stepDown
                    ? `${who} declined to take over.`
                    : `${who} declined to be a co-owner.`}
              </p>
              <p className="text-sm text-ink-muted">
                {waiting
                  ? `${o.from.firstName} offered it on ${day(o.offer.createdAt)}.${o.offer.stepDown ? ` ${o.from.firstName} steps down when ${o.to.firstName} accepts.` : ` ${o.from.firstName} stays an Owner too.`} The offer ends on ${day(o.expiresAt)}.`
                  : 'You can offer it to someone else.'}
              </p>
            </div>
            <Button
              variant={waiting ? 'secondary' : 'ghost'}
              loading={busy === o.offer.id}
              onClick={() => void withdraw(o)}
            >
              {waiting ? 'Cancel offer' : 'Dismiss'}
            </Button>
          </OfferBox>
        );
      })}
    </>
  );
}
