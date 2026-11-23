/**
 * @file Ownership offers (FR-3f): nobody becomes an Owner without saying yes.
 *
 * An Owner offers ownership to someone already in the org: a person with a role there, or with a
 * volunteer standing. Optionally it's a **hand-over**: the person offering steps down at the
 * moment it's accepted. Until then nothing changes: the person offering stays Owner, and the
 * offer shows on the other person's Home with Accept and Decline. Accepting makes them an Owner
 * (and steps the offerer down for a hand-over) in one write.
 *
 * One open offer per org. A declined offer stays visible to the org's Owners until dismissed (or
 * replaced by a new offer). Offers end on their own after {@link OFFER_DAYS} days.
 */
import { OrgRole } from '@shared/enums';
import { AppError } from '@shared/errors';
import { ownershipOfferSchema } from '@shared/schemas';
import { todayIso } from '@shared/time';
import type { DataSnapshot } from '@shared/domain/snapshot';
import type { OwnershipOffer, OwnershipOfferView, User } from '@shared/types';
import { found, isContact, newId, requireOrg, roleIn, safeUser, validate } from './context';

/** How long an offer can be accepted. */
export const OFFER_DAYS = 14;

/**
 * When an offer stops being acceptable.
 * @param o - Offer.
 * @returns Epoch milliseconds.
 */
const expiry = (o: OwnershipOffer) => new Date(o.createdAt).getTime() + OFFER_DAYS * 86_400_000;

/**
 * Whether an offer is still live (not past its 14 days).
 * @param o - Offer.
 * @param now - Epoch milliseconds.
 * @returns `true` while it counts.
 */
const live = (o: OwnershipOffer, now = Date.now()) => expiry(o) > now;

/**
 * Drops expired offers (run before every change).
 * @param draft - Draft snapshot.
 */
function prune(draft: DataSnapshot) {
  draft.offers = draft.offers.filter((o) => live(o));
}

/**
 * An offer with the names to show it.
 * @param data - Snapshot.
 * @param o - Offer.
 * @returns The view.
 */
function view(data: DataSnapshot, o: OwnershipOffer): OwnershipOfferView {
  const person = (id: string) =>
    safeUser(
      found(
        data.users.find((u) => u.id === id),
        'person',
      ),
    );
  return {
    offer: o,
    orgName: data.organizations.find((x) => x.id === o.orgId)?.name ?? '',
    from: person(o.fromUserId),
    to: person(o.toUserId),
    expiresAt: new Date(expiry(o)).toISOString(),
  };
}

/**
 * Whether someone is part of an org: a role there, or a volunteer standing.
 * @param data - Snapshot.
 * @param orgId - Org.
 * @param userId - Person.
 * @returns `true` if so.
 */
const belongs = (data: DataSnapshot, orgId: string, userId: string) =>
  data.memberships.some((m) => m.orgId === orgId && m.userId === userId) ||
  data.orgVolunteers.some((v) => v.orgId === orgId && v.userId === userId);

/**
 * Offers made by an org that its Team & roles page shows: the open one and any declined.
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @param orgId - Org.
 * @returns Offer views, newest first.
 */
export function orgOffers(data: DataSnapshot, me: User, orgId: string): OwnershipOfferView[] {
  requireOrg(data, me, orgId, 'volunteers.view');
  return data.offers
    .filter((o) => o.orgId === orgId && live(o))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((o) => view(data, o));
}

/**
 * Open offers waiting for the signed-in person's answer (shown on their Home).
 * @param data - Snapshot.
 * @param me - Signed-in person.
 * @returns Offer views.
 */
export function myOffers(data: DataSnapshot, me: User): OwnershipOfferView[] {
  return data.offers
    .filter((o) => o.toUserId === me.id && o.status === 'PENDING' && live(o))
    .map((o) => view(data, o));
}

/**
 * Offers ownership of an org. Only Owners may; the person must already be part of the org.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person (an Owner).
 * @param orgId - Org.
 * @param input - Raw {@link ownershipOfferSchema} payload.
 * @returns The new offer.
 * @throws AppError when someone else's offer is already open, or the person can't receive one.
 */
export function offerOwnership(
  draft: DataSnapshot,
  me: User,
  orgId: string,
  input: unknown,
): OwnershipOfferView {
  found(
    draft.organizations.find((o) => o.id === orgId),
    'organization',
  );
  if (roleIn(draft, orgId, me.id) !== OrgRole.OWNER)
    throw new AppError('FORBIDDEN', 'Only an Owner can offer ownership.');
  const { toUserId, stepDown } = validate(ownershipOfferSchema, input);
  prune(draft);
  const pending = draft.offers.find((o) => o.orgId === orgId && o.status === 'PENDING');
  if (pending)
    throw new AppError(
      'CONFLICT',
      `An offer to ${view(draft, pending).to.firstName} is still waiting. Cancel it first.`,
      'toUserId',
    );
  const person = found(
    draft.users.find((u) => u.id === toUserId),
    'person',
  );
  if (person.id === me.id)
    throw new AppError('VALIDATION', 'Choose someone other than yourself.', 'toUserId');
  if (isContact(person) || !belongs(draft, orgId, person.id))
    throw new AppError(
      'RULE_VIOLATION',
      `${person.firstName} isn’t part of this organization. Only people with a role or a volunteer place here can become Owners.`,
      'toUserId',
    );
  if (roleIn(draft, orgId, person.id) === OrgRole.OWNER)
    throw new AppError('CONFLICT', `${person.firstName} is already an Owner.`, 'toUserId');
  // A new offer replaces any earlier declined one.
  draft.offers = draft.offers.filter((o) => o.orgId !== orgId);
  const offer: OwnershipOffer = {
    id: newId('own'),
    orgId,
    fromUserId: me.id,
    toUserId: person.id,
    stepDown,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };
  draft.offers.push(offer);
  return view(draft, offer);
}

/**
 * Finds a live offer.
 * @param draft - Draft snapshot.
 * @param offerId - Offer.
 * @returns The offer.
 */
function liveOffer(draft: DataSnapshot, offerId: string): OwnershipOffer {
  prune(draft);
  return found(
    draft.offers.find((o) => o.id === offerId),
    'offer (it may have expired)',
  );
}

/**
 * Takes back an offer, or clears a declined one from the list. Any Owner of the org may.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person.
 * @param offerId - Offer.
 */
export function withdrawOffer(draft: DataSnapshot, me: User, offerId: string): void {
  const offer = liveOffer(draft, offerId);
  if (roleIn(draft, offer.orgId, me.id) !== OrgRole.OWNER)
    throw new AppError('FORBIDDEN', 'Only an Owner can cancel this offer.');
  draft.offers = draft.offers.filter((o) => o.id !== offer.id);
}

/**
 * Accepts or declines an offer made to the signed-in person.
 * @param draft - Draft snapshot.
 * @param me - Signed-in person (the one offered).
 * @param offerId - Offer.
 * @param accept - `true` to accept, `false` to decline.
 * @returns The offer as it ended.
 * @throws AppError when the offer isn't theirs, is no longer open, or they left the org.
 */
export function answerOffer(
  draft: DataSnapshot,
  me: User,
  offerId: string,
  accept: boolean,
): OwnershipOfferView {
  const offer = liveOffer(draft, offerId);
  if (offer.toUserId !== me.id)
    throw new AppError('FORBIDDEN', 'This offer was made to someone else.');
  if (offer.status !== 'PENDING')
    throw new AppError('CONFLICT', 'You already answered this offer.');
  const result = view(draft, offer);
  if (!accept) {
    offer.status = 'DECLINED';
    return { ...result, offer: { ...offer } };
  }
  if (!belongs(draft, offer.orgId, me.id))
    throw new AppError('RULE_VIOLATION', 'You’re no longer part of this organization.');
  const mine = draft.memberships.find((m) => m.orgId === offer.orgId && m.userId === me.id);
  if (mine) mine.orgRole = OrgRole.OWNER;
  else
    draft.memberships.push({
      id: newId('mem'),
      orgId: offer.orgId,
      userId: me.id,
      orgRole: OrgRole.OWNER,
      createdAt: todayIso(),
    });
  // A hand-over: the person who offered steps down now that there's another Owner.
  if (offer.stepDown)
    draft.memberships = draft.memberships.filter(
      (m) => !(m.orgId === offer.orgId && m.userId === offer.fromUserId),
    );
  draft.offers = draft.offers.filter((o) => o.id !== offer.id);
  return result;
}
