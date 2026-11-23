/**
 * @file "Offer ownership" (FR-3f), from Team & roles.
 *
 * Nobody becomes an Owner without saying yes, so this sends an offer: the person sees it on their
 * Home and accepts or declines. Only people already part of the organization can be offered it:
 * those with a role here, or a volunteer place. The offer is one of two kinds, chosen here:
 * - **Hand over** (the default): the person offering steps down the moment it's accepted.
 * - **Co-owner**: both stay Owners.
 * The last Owner stepping down can only hand over. Until the offer is accepted nothing changes.
 */
import { Crown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { labelOf, OrgRole } from '@shared/enums';
import { messageOf } from '@shared/errors';
import type { MemberView, Organization, OwnershipOfferView } from '@shared/types';
import { Button } from '@/components/Button';
import { FormError, FormField, Select } from '@/components/Form';
import { Modal } from '@/components/Modal';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';

/** Props for {@link OwnershipOfferDialog}. */
export interface OwnershipOfferDialogProps {
  open: boolean;
  org: Organization;
  meId: string;
  /** Everyone with a role here. */
  members: MemberView[];
  /**
   * Opened from "Step down" by the last Owner: it can only be a hand-over. Otherwise the person
   * chooses between handing over and adding a co-owner.
   */
  stepDownOnly: boolean;
  /** Person to preselect (chosen from the role list). */
  preselect?: string;
  onCancel: () => void;
  onSent: (offer: OwnershipOfferView) => void;
}

/** Someone who can be offered ownership. */
interface Candidate {
  id: string;
  name: string;
  /** Where they stand here, for the list. */
  standing: string;
}

/**
 * The dialog.
 * @param props - See {@link OwnershipOfferDialogProps}.
 * @returns The dialog.
 */
export function OwnershipOfferDialog({
  open,
  org,
  meId,
  members,
  stepDownOnly,
  preselect,
  onCancel,
  onSent,
}: OwnershipOfferDialogProps) {
  const volunteers = useAsync(
    () => (open ? api.volunteers.list(org.id) : Promise.resolve([])),
    [open, org.id],
  );

  // Role holders first (highest rank first), then volunteers; never yourself or another Owner.
  const candidates = useMemo<Candidate[]>(() => {
    const rank: OrgRole[] = [OrgRole.ADMIN, OrgRole.COORDINATOR];
    const fromRoles = members
      .filter((m) => m.user.id !== meId && m.membership.orgRole !== OrgRole.OWNER)
      .sort((a, b) => rank.indexOf(a.membership.orgRole) - rank.indexOf(b.membership.orgRole))
      .map((m) => ({
        id: m.user.id,
        name: `${m.user.firstName} ${m.user.lastName}`,
        standing: labelOf(m.membership.orgRole),
      }));
    const taken = new Set([meId, ...members.map((m) => m.user.id)]);
    const fromVolunteers = (volunteers.data ?? [])
      .filter((v) => v.status && !taken.has(v.id))
      .sort((a, b) => a.lastName.localeCompare(b.lastName))
      .map((v) => ({ id: v.id, name: `${v.firstName} ${v.lastName}`, standing: 'Volunteer' }));
    return [...fromRoles, ...fromVolunteers];
  }, [members, meId, volunteers.data]);

  const [toUserId, setToUserId] = useState('');
  const [handOver, setHandOver] = useState(true);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(undefined);
    setToUserId(preselect ?? '');
    setHandOver(true);
  }, [open, preselect]);
  // Default to the first candidate once the list has loaded.
  useEffect(() => {
    if (open && !toUserId && candidates[0]) setToUserId(candidates[0].id);
  }, [open, toUserId, candidates]);

  const chosen = candidates.find((c) => c.id === toUserId);

  /** Sends the offer. */
  const submit = async () => {
    if (!toUserId) return;
    setBusy(true);
    setError(undefined);
    try {
      onSent(
        await api.orgs.offerOwnership(org.id, { toUserId, stepDown: stepDownOnly || handOver }),
      );
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="sm"
      title={stepDownOnly ? `Hand over ${org.name}` : 'Offer ownership'}
      description={
        stepDownOnly
          ? 'You’re the only Owner, and every organization needs one. Choose who takes over. They’ll be asked to accept; you stay Owner until they do, then you step down.'
          : 'Owners have full control of the organization. They’ll be asked to accept; nothing changes until they do.'
      }
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <FormError message={error} />
        {volunteers.loading && !volunteers.data ? (
          <p className="text-sm text-ink-muted">Loading people…</p>
        ) : candidates.length === 0 ? (
          <p className="text-sm">
            There’s no one else in {org.name} yet. Add a volunteer or appoint a member first; only
            people who are part of the organization can become Owners.
          </p>
        ) : (
          <>
            <FormField
              label={handOver ? 'New Owner' : 'Offer it to'}
              hint="People with a role here or a volunteer place."
              required
            >
              {(p) => (
                <Select {...p} value={toUserId} onChange={(e) => setToUserId(e.target.value)}>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.standing}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            {!stepDownOnly && (
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-semibold">
                  What happens when they accept
                </legend>
                {[
                  {
                    value: true,
                    label: 'Hand over ownership',
                    hint: 'They become the Owner and you step down.',
                  },
                  {
                    value: false,
                    label: 'Add a co-owner',
                    hint: 'You both stay Owners.',
                  },
                ].map((o) => (
                  <label
                    key={o.label}
                    className="flex cursor-pointer gap-3 rounded-control border border-line p-3 has-[:checked]:border-primary"
                  >
                    <input
                      type="radio"
                      name="offer-kind"
                      className="mt-1 size-4 accent-[var(--rh-primary)]"
                      checked={handOver === o.value}
                      onChange={() => setHandOver(o.value)}
                    />
                    <span>
                      <span className="block font-semibold">{o.label}</span>
                      <span className="block text-sm text-ink-muted">{o.hint}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            {chosen && (
              <p className="text-sm text-ink-muted">
                {chosen.name.split(' ')[0]} will see the offer on their Home page and can accept or
                decline it within 14 days.
              </p>
            )}
          </>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={busy}
            disabled={!chosen}
            icon={<Crown className="size-4" aria-hidden />}
          >
            {handOver ? 'Send hand-over offer' : 'Send co-owner offer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
