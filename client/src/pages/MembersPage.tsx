/**
 * @file Manage → Members & roles (FR-3c), in a grid. Owners appoint Admins and Coordinators, and
 * offer ownership, which the person accepts on their Home page (FR-3f). Admins appoint
 * Coordinators. Anyone can step down; the last Owner hands over through an offer.
 */
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { Crown, LogOut, UserPlus } from 'lucide-react';
import { createContext, useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { labelOf, OrgRole } from '@shared/enums';
import { messageOf } from '@shared/errors';
import { assignableRoles, canManageMember } from '@shared/permissions';
import { appointMemberSchema, type AppointMemberInput } from '@shared/schemas';
import type { MemberView } from '@shared/types';
import { Button } from '@/components/Button';
import { DataGrid } from '@/components/DataGrid';
import { ACTIONS_COLUMN, dateColumn, RoleCell, roleColumn } from '@/components/gridCells';
import { FormError, FormField, Select, TextInput } from '@/components/Form';
import { ErrorBlock, Loading, PageHeader, Panel } from '@/components/Layout';
import { ConfirmDialog, Modal } from '@/components/Modal';
import { Badge } from '@/components/Status';
import { useUser } from '@/context/AuthContext';
import { useManagedOrg, useOrg } from '@/context/OrgContext';
import { useToast } from '@/context/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { useForm } from '@/hooks/useForm';
import { OwnershipOfferDialog } from '@/features/org/OwnershipOfferDialog';
import { OwnershipOfferList } from '@/features/org/OwnershipOffers';
import { useRefreshOnReturn } from '@/hooks/useRefreshOnReturn';
import { api } from '@/lib/api';

/** What each role can do, in plain words (shown beside the table). */
const ROLE_SUMMARY: Record<OrgRole, string> = {
  OWNER: 'Everything, including appointing Admins and offering ownership to others.',
  ADMIN: 'Sites, programs, items, recruitment, reports, and Coordinators.',
  COORDINATOR: 'Day-to-day sessions: rosters, check-in, and approving hours.',
};

/** A member with the id the grid keys rows by. */
type Row = MemberView & { id: string };

/** What the row controls need, shared with the cell renderers through context. */
interface MemberActions {
  meId: string;
  role: OrgRole;
  allowed: OrgRole[];
  busy?: string;
  changeRole: (m: Row, next: OrgRole) => Promise<void>;
  askRemove: (m: Row) => void;
  /** Owners only: open "Offer ownership" for this person. */
  offerTo?: (m: Row) => void;
}

/** The role-list choice that opens "Offer ownership" instead of changing the role. */
const OFFER = 'offer';
const ActionsContext = createContext<MemberActions | null>(null);

/** Name, with a "You" badge on your own row. */
function NameCell({ data }: ICellRendererParams<Row>) {
  const ctx = useContext(ActionsContext);
  if (!data) return null;
  return (
    <span className="font-semibold">
      {data.user.firstName} {data.user.lastName}
      {data.user.id === ctx?.meId && <Badge className="ml-2">You</Badge>}
    </span>
  );
}

/** A role dropdown where your rank allows a change, otherwise the role badge. */
function RoleEditCell(props: ICellRendererParams<Row>) {
  const ctx = useContext(ActionsContext);
  const m = props.data;
  if (!m || !ctx) return null;
  const editable =
    m.user.id !== ctx.meId &&
    canManageMember(ctx.role, m.membership.orgRole) &&
    ctx.allowed.length > 0;
  if (!editable) return <RoleCell value={m.membership.orgRole} />;
  const canOffer = !!ctx.offerTo && m.membership.orgRole !== OrgRole.OWNER;
  return (
    <Select
      aria-label={`Role for ${m.user.firstName} ${m.user.lastName}`}
      className="h-9 w-44 py-1"
      value={m.membership.orgRole}
      disabled={ctx.busy === m.membership.id}
      onChange={(e) =>
        e.target.value === OFFER
          ? ctx.offerTo?.(m)
          : void ctx.changeRole(m, e.target.value as OrgRole)
      }
    >
      {/* Keep the current role visible even if this actor can't assign it. */}
      {[...new Set([m.membership.orgRole, ...ctx.allowed])].map((r) => (
        <option key={r} value={r}>
          {labelOf(r)}
        </option>
      ))}
      {/* Becoming an Owner needs the person's OK, so this sends an offer. */}
      {canOffer && <option value={OFFER}>Owner (send offer)…</option>}
    </Select>
  );
}

/** Step down (your own row) or Remove (people ranked below you). */
function ActionsCell({ data }: ICellRendererParams<Row>) {
  const ctx = useContext(ActionsContext);
  if (!data || !ctx) return null;
  if (data.user.id === ctx.meId)
    return (
      <Button
        size="sm"
        variant="ghost"
        icon={<LogOut className="size-4" aria-hidden />}
        onClick={() => ctx.askRemove(data)}
      >
        Step down
      </Button>
    );
  return canManageMember(ctx.role, data.membership.orgRole) && ctx.allowed.length > 0 ? (
    <Button size="sm" variant="ghost" onClick={() => ctx.askRemove(data)}>
      Remove
    </Button>
  ) : null;
}

const COLUMNS: ColDef<Row>[] = [
  {
    colId: 'name',
    headerName: 'Name',
    valueGetter: (p) => (p.data ? `${p.data.user.firstName} ${p.data.user.lastName}` : ''),
    comparator: (_a, _b, na, nb) =>
      `${na.data?.user.lastName} ${na.data?.user.firstName}`.localeCompare(
        `${nb.data?.user.lastName} ${nb.data?.user.firstName}`,
      ),
    cellRenderer: NameCell,
    filter: 'agTextColumnFilter',
    pinned: 'left',
    minWidth: 220,
  },
  {
    colId: 'email',
    headerName: 'Email',
    valueGetter: (p) => p.data?.user.email,
    filter: 'agTextColumnFilter',
    minWidth: 200,
    flex: 1,
  },
  roleColumn<Row>('role', 'Role', (r) => r.membership.orgRole, {
    cellRenderer: RoleEditCell,
    sort: 'asc',
    minWidth: 190,
    suppressKeyboardEvent: ACTIONS_COLUMN.suppressKeyboardEvent,
  }),
  dateColumn<Row>('since', 'Member since', (r) => r.membership.createdAt),
  { ...ACTIONS_COLUMN, cellRenderer: ActionsCell, minWidth: 150 } as ColDef<Row>,
];

/**
 * The Members page.
 * @returns The page.
 */
export default function MembersPage() {
  const me = useUser();
  const { org, role } = useManagedOrg();
  const { reload: reloadOrgs } = useOrg();
  const toast = useToast();
  const navigate = useNavigate();
  const members = useAsync(() => api.orgs.members(org.id), [org.id]);
  const [appointOpen, setAppointOpen] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [toRemove, setToRemove] = useState<Row>();
  const [steppingDown, setSteppingDown] = useState(false);
  // "Offer ownership": open, and whether it came from the last Owner stepping down.
  const [offering, setOffering] = useState<{ fromStepDown: boolean; to?: string }>();
  const isOwner = role === OrgRole.OWNER;
  const offers = useAsync(
    () => (isOwner ? api.orgs.ownershipOffers(org.id) : Promise.resolve([])),
    [org.id, isOwner],
  );
  const pending = offers.data?.find((o) => o.offer.status === 'PENDING');
  // Show changes other people made while this tab was in the background.
  useRefreshOnReturn(() => {
    members.reload();
    offers.reload();
  });
  const lastOwner =
    isOwner &&
    (members.data ?? []).filter((m) => m.membership.orgRole === OrgRole.OWNER).length <= 1;

  /** Step down: the last Owner hands over through an offer; anyone else confirms. */
  const askStepDown = () => {
    if (!lastOwner) setSteppingDown(true);
    else if (pending)
      toast.show(
        `Your offer to ${pending.to.firstName} is still waiting. Cancel it first to offer someone else.`,
        'error',
      );
    else setOffering({ fromStepDown: true });
  };

  /** Steps down (not the last Owner). */
  const stepDown = async () => {
    setBusy('step-down');
    try {
      await api.orgs.stepDown(org.id);
      toast.show(`You stepped down from ${org.name}.`);
      setSteppingDown(false);
      await reloadOrgs();
      navigate('/me');
    } catch (err) {
      toast.show(messageOf(err), 'error');
    } finally {
      setBusy(undefined);
    }
  };
  const allowed = assignableRoles(role);
  const form = useForm(appointMemberSchema, {
    email: '',
    orgRole: allowed[allowed.length - 1] ?? OrgRole.COORDINATOR,
  } as AppointMemberInput);

  /**
   * Changes a member's role in place.
   * @param m - Member.
   * @param next - New role.
   */
  const changeRole = async (m: Row, next: OrgRole) => {
    setBusy(m.membership.id);
    try {
      await api.orgs.changeRole(org.id, m.membership.id, next);
      toast.show(
        `${m.user.firstName} is now ${next === OrgRole.ADMIN ? 'an' : 'a'} ${labelOf(next)}.`,
      );
      members.reload();
      if (m.user.id === me.id) await reloadOrgs();
    } catch (err) {
      toast.show(messageOf(err), 'error');
    } finally {
      setBusy(undefined);
    }
  };

  /** Removes the pending member's role. */
  const remove = async () => {
    if (!toRemove) return;
    setBusy('remove');
    try {
      await api.orgs.removeMember(org.id, toRemove.membership.id);
      toast.show(`${toRemove.user.firstName} no longer has a role here.`);
      setToRemove(undefined);
      members.reload();
    } catch (err) {
      toast.show(messageOf(err), 'error');
    } finally {
      setBusy(undefined);
    }
  };

  if (members.loading && !members.data) return <Loading />;
  if (members.error || !members.data)
    return <ErrorBlock message={members.error ?? 'Could not load.'} onRetry={members.reload} />;

  return (
    <>
      <PageHeader
        title="Members & roles"
        actions={
          <>
            {isOwner && (
              <Button
                variant="secondary"
                icon={<Crown className="size-4" aria-hidden />}
                disabled={!!pending}
                title={pending ? `Waiting for ${pending.to.firstName} to answer` : undefined}
                onClick={() => setOffering({ fromStepDown: false })}
              >
                Offer ownership
              </Button>
            )}
            {allowed.length > 0 && (
              <Button
                icon={<UserPlus className="size-4" aria-hidden />}
                onClick={() => {
                  form.reset({ email: '', orgRole: allowed[allowed.length - 1] });
                  setAppointOpen(true);
                }}
              >
                Appoint member
              </Button>
            )}
          </>
        }
      />
      {isOwner && !!offers.data?.length && (
        <OwnershipOfferList offers={offers.data} onChanged={offers.reload} />
      )}
      {/* The role guide sits beside the grid only on very wide screens, so the grid keeps room for its columns. */}
      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_20rem]">
        <ActionsContext.Provider
          value={{
            meId: me.id,
            role,
            allowed,
            busy,
            changeRole: (m, next) => changeRole(m, next),
            askRemove: (m) => (m.user.id === me.id ? askStepDown() : setToRemove(m)),
            offerTo: isOwner
              ? (m) =>
                  pending
                    ? toast.show(
                        `Your offer to ${pending.to.firstName} is still waiting. Cancel it first.`,
                        'error',
                      )
                    : setOffering({ fromStepDown: false, to: m.user.id })
              : undefined,
          }}
        >
          <DataGrid<Row>
            height="auto"
            selectable={false}
            label="Members"
            layoutKey={`members-${org.id}`}
            exportName={`onboard-members-${org.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
            searchPlaceholder="Search members…"
            rows={members.data.map((m) => ({ ...m, id: m.membership.id }))}
            columns={COLUMNS}
            emptyMessage="No members yet."
          />
        </ActionsContext.Provider>
        <Panel title="What each role can do" className="self-start">
          <dl className="space-y-3 text-sm">
            {(Object.keys(ROLE_SUMMARY) as OrgRole[]).map((r) => (
              <div key={r}>
                <dt className="font-semibold">
                  {labelOf(r)}
                  {r === role && <span className="font-normal text-ink-muted"> (you)</span>}
                </dt>
                <dd className="text-ink-muted">{ROLE_SUMMARY[r]}</dd>
              </div>
            ))}
            <div>
              <dt className="font-semibold">Volunteer</dt>
              <dd className="text-ink-muted">
                Anyone, including members. Volunteer standing is managed on Recruitment.
              </dd>
            </div>
          </dl>
        </Panel>
      </div>

      <Modal
        open={appointOpen}
        onClose={() => setAppointOpen(false)}
        size="sm"
        title="Appoint a member"
        description="They keep their own login and any roles they hold elsewhere."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAppointOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={form.submitting}
              onClick={() =>
                void form.submit(async (d) => {
                  const m = await api.orgs.appoint(org.id, d);
                  toast.show(
                    `${m.user.firstName} ${m.user.lastName} is now ${labelOf(d.orgRole)}.`,
                  );
                  setAppointOpen(false);
                  members.reload();
                })
              }
            >
              Appoint
            </Button>
          </>
        }
      >
        <form noValidate className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <FormError message={form.formError} />
          <FormField
            label="Their Onboard email"
            error={form.errors.email}
            required
            hint="They need a Onboard account first."
          >
            {(p) => (
              <TextInput
                {...p}
                type="email"
                value={form.values.email}
                invalid={!!form.errors.email}
                onChange={(e) => form.set('email', e.target.value)}
                onBlur={() => form.touch('email')}
              />
            )}
          </FormField>
          <FormField label="Role" error={form.errors.orgRole}>
            {(p) => (
              <Select
                {...p}
                value={form.values.orgRole}
                onChange={(e) => form.set('orgRole', e.target.value as OrgRole)}
              >
                {allowed.map((r) => (
                  <option key={r} value={r}>
                    {labelOf(r)} — {ROLE_SUMMARY[r]}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        </form>
      </Modal>
      <OwnershipOfferDialog
        open={!!offering}
        org={org}
        meId={me.id}
        members={members.data}
        stepDownOnly={!!offering?.fromStepDown}
        preselect={offering?.to}
        onCancel={() => setOffering(undefined)}
        onSent={(sent) => {
          setOffering(undefined);
          toast.show(
            sent.offer.stepDown
              ? `Offer sent to ${sent.to.firstName}. You stay Owner until they accept, then you step down.`
              : `Offer sent to ${sent.to.firstName}. They become a co-owner when they accept.`,
          );
          offers.reload();
        }}
      />
      <ConfirmDialog
        open={steppingDown}
        danger
        title={`Step down from ${org.name}?`}
        message="You’ll lose management access here. Your volunteer history and other organizations aren’t affected."
        confirmLabel="Step down"
        loading={busy === 'step-down'}
        onCancel={() => setSteppingDown(false)}
        onConfirm={() => void stepDown()}
      />
      <ConfirmDialog
        open={!!toRemove}
        danger
        title={`Remove ${toRemove?.user.firstName}'s role?`}
        message="They keep their account, volunteer history, and roles at other organizations."
        confirmLabel="Remove role"
        loading={busy === 'remove'}
        onCancel={() => setToRemove(undefined)}
        onConfirm={() => void remove()}
      />
    </>
  );
}
