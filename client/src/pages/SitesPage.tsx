/**
 * @file The places an org serves (FR-9) with V-S11, V-S12, V-S14, in the org's own words
 * ("Schools", "Clinics", "Fields"…). Programs run at these places and have their own tab under
 * Schedule, so this page only lists the places.
 */
import { Archive, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RangeKind } from '@shared/enums';
import { messageOf } from '@shared/errors';
import { rangeValid, RANGE_BOUNDS } from '@shared/rules';
import { siteSchema, type SiteInput } from '@shared/schemas';
import { rangeText } from '@shared/terms';
import type { Site } from '@shared/types';
import { Button } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import { Checkbox, FormError, FormField, TextInput } from '@/components/Form';
import { EmptyState, ErrorBlock, Loading, PageHeader, Panel } from '@/components/Layout';
import { ConfirmDialog, Modal } from '@/components/Modal';
import { Badge } from '@/components/Status';
import { useToast } from '@/context/ToastContext';
import { useManagedOrg } from '@/context/OrgContext';
import { useAsync } from '@/hooks/useAsync';
import { useForm } from '@/hooks/useForm';
import { api } from '@/lib/api';

const BLANK_SITE: SiteInput = {
  name: '',
  address: '',
  zip: '',
  priority: false,
  rangeMin: undefined,
  rangeMax: undefined,
  contactName: '',
  contactEmail: '',
};

/**
 * Parses an optional numeric input: empty means "not set".
 * @param raw - Input value.
 * @returns Number or undefined.
 */
const optNum = (raw: string) => (raw === '' ? undefined : Number(raw));

/**
 * Modal form for a site.
 * @param props - Open state, site to edit, callbacks.
 * @returns The modal.
 */
function SiteForm({
  open,
  site,
  onClose,
  onSaved,
}: {
  open: boolean;
  site?: Site;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { org, terms: t, features } = useManagedOrg();
  const kind = org.settings.rangeKind;
  const unit = t.rangeUnit.toLowerCase();
  const bounds = kind === RangeKind.NONE ? undefined : RANGE_BOUNDS[kind];
  const toast = useToast();
  const form = useForm(siteSchema, BLANK_SITE);
  const { values: v, errors: e, set, touch, reset } = form;
  useEffect(() => {
    if (open)
      reset(
        site
          ? {
              name: site.name,
              address: site.address,
              zip: site.zip,
              priority: site.priority,
              rangeMin: site.rangeMin,
              rangeMax: site.rangeMax,
              contactName: site.contactName,
              contactEmail: site.contactEmail,
            }
          : BLANK_SITE,
      );
  }, [open, site, reset]);
  const grades =
    kind !== RangeKind.NONE && v.rangeMin !== undefined && v.rangeMax !== undefined
      ? rangeValid(kind, v.rangeMin, v.rangeMax)
      : { ok: true as const };
  const gradeError = !grades.ok ? grades.message : undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={site ? `Edit ${t.site}` : `Add a ${t.site}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={form.submitting}
            onClick={() =>
              void form.submit(async (d) => {
                if (site) await api.sites.update(site.id, d);
                else await api.sites.create(org.id, d);
                toast.show(site ? `${t.Site} updated.` : `${t.Site} added.`);
                onSaved();
              })
            }
          >
            {site ? 'Save changes' : `Add ${t.site}`}
          </Button>
        </>
      }
    >
      <form
        noValidate
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        onSubmit={(ev) => ev.preventDefault()}
      >
        <div className="sm:col-span-2">
          <FormError message={form.formError} />
        </div>
        <FormField label={`${t.Site} name`} error={e.name} required className="sm:col-span-2">
          {(p) => (
            <TextInput
              {...p}
              maxLength={80}
              value={v.name}
              invalid={!!e.name}
              onChange={(x) => set('name', x.target.value)}
              onBlur={() => touch('name')}
            />
          )}
        </FormField>
        <FormField label="Street address" error={e.address} required>
          {(p) => (
            <TextInput
              {...p}
              maxLength={120}
              value={v.address}
              invalid={!!e.address}
              onChange={(x) => set('address', x.target.value)}
              onBlur={() => touch('address')}
            />
          )}
        </FormField>
        <FormField label="ZIP code" error={e.zip} required>
          {(p) => (
            <TextInput
              {...p}
              inputMode="numeric"
              maxLength={5}
              value={v.zip}
              invalid={!!e.zip}
              onChange={(x) => set('zip', x.target.value)}
              onBlur={() => touch('zip')}
            />
          )}
        </FormField>
        {bounds && (
          <FormField
            label={`Lowest ${unit}`}
            error={
              e.rangeMin ??
              (gradeError && grades.ok === false && grades.field === 'rangeMin'
                ? gradeError
                : undefined)
            }
            required
            hint={kind === RangeKind.GRADE ? 'Use 0 for kindergarten' : undefined}
          >
            {(p) => (
              <TextInput
                {...p}
                type="number"
                min={bounds.min}
                max={bounds.max}
                value={v.rangeMin ?? ''}
                invalid={!!e.rangeMin}
                onChange={(x) => set('rangeMin', optNum(x.target.value))}
                onBlur={() => touch('rangeMin')}
              />
            )}
          </FormField>
        )}
        {bounds && (
          <FormField
            label={`Highest ${unit}`}
            error={
              e.rangeMax ??
              (gradeError && grades.ok === false && grades.field === 'rangeMax'
                ? gradeError
                : undefined)
            }
            required
          >
            {(p) => (
              <TextInput
                {...p}
                type="number"
                min={bounds.min}
                max={bounds.max}
                value={v.rangeMax ?? ''}
                invalid={!!e.rangeMax}
                onChange={(x) => set('rangeMax', optNum(x.target.value))}
                onBlur={() => touch('rangeMax')}
              />
            )}
          </FormField>
        )}
        <FormField label="Contact name" error={e.contactName} required>
          {(p) => (
            <TextInput
              {...p}
              value={v.contactName}
              invalid={!!e.contactName}
              onChange={(x) => set('contactName', x.target.value)}
              onBlur={() => touch('contactName')}
            />
          )}
        </FormField>
        <FormField label="Contact email" error={e.contactEmail} required>
          {(p) => (
            <TextInput
              {...p}
              type="email"
              value={v.contactEmail}
              invalid={!!e.contactEmail}
              onChange={(x) => set('contactEmail', x.target.value)}
              onBlur={() => touch('contactEmail')}
            />
          )}
        </FormField>
        {features.prioritySites && (
          <div className="sm:col-span-2">
            <Checkbox
              label={`${t.priority} ${t.site}`}
              description={`${org.name} prioritizes ${t.priority} ${t.sites} in reports and staffing.`}
              checked={v.priority}
              onChange={(c) => set('priority', c)}
            />
          </div>
        )}
      </form>
    </Modal>
  );
}

/**
 * The places page.
 * @returns The page.
 */
export default function SitesPage() {
  const { org, terms: t, features } = useManagedOrg();
  const kind = org.settings.rangeKind;
  const toast = useToast();
  const [showArchived, setShowArchived] = useState(false);
  const data = useAsync(
    () =>
      Promise.all([api.sites.list(org.id, showArchived), api.programs.list(org.id, showArchived)]),
    [org.id, showArchived],
  );
  const [siteForm, setSiteForm] = useState<{ open: boolean; site?: Site }>({ open: false });
  const [toDelete, setToDelete] = useState<{
    kind: 'site' | 'program';
    id: string;
    name: string;
  }>();
  const [deleting, setDeleting] = useState(false);

  if (data.loading && !data.data) return <Loading />;
  if (data.error || !data.data)
    return <ErrorBlock message={data.error ?? 'Could not load.'} onRetry={data.reload} />;
  const [sites, programs] = data.data;
  const programCount = (siteId: string) => programs.filter((p) => p.siteId === siteId).length;

  /** Deletes the pending item; V-S14 may refuse and suggest archiving. */
  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      if (toDelete.kind === 'site') await api.sites.remove(toDelete.id);
      else await api.programs.remove(toDelete.id);
      toast.show(`${toDelete.name} deleted.`);
      data.reload();
    } catch (err) {
      toast.show(messageOf(err), 'error');
    } finally {
      setDeleting(false);
      setToDelete(undefined);
    }
  };

  /**
   * Archives or restores an item.
   * @param kind - Entity kind.
   * @param id - Entity id.
   */
  const toggleArchive = async (kind: 'site' | 'program', id: string) => {
    try {
      const r = kind === 'site' ? await api.sites.archive(id) : await api.programs.archive(id);
      toast.show(r.archived ? 'Archived.' : 'Restored.');
      data.reload();
    } catch (err) {
      toast.show(messageOf(err), 'error');
    }
  };

  return (
    <>
      <PageHeader
        title={t.Sites}
        actions={
          <Checkbox label="Show archived" checked={showArchived} onChange={setShowArchived} />
        }
      />
      <div className="space-y-6">
        <Panel
          title={t.Sites}
          actions={
            <Button
              size="sm"
              icon={<Plus className="size-4" aria-hidden />}
              onClick={() => setSiteForm({ open: true })}
            >
              Add {t.site}
            </Button>
          }
          bodyClassName="p-0 sm:p-5"
        >
          <DataTable<Site>
            caption={t.Sites}
            rows={sites}
            rowKey={(s) => s.id}
            empty={
              <EmptyState
                title={`No ${t.sites} yet`}
                message={`Add your first ${t.site} to start scheduling programs.`}
              />
            }
            columns={[
              {
                key: 'name',
                header: t.Site,
                sortValue: (s) => s.name,
                render: (s) => (
                  <span className="font-semibold">
                    {s.name}
                    {s.archived && <Badge className="ml-2">Archived</Badge>}
                  </span>
                ),
              },
              ...(features.prioritySites
                ? [
                    {
                      key: 'priority',
                      header: t.priority,
                      sortValue: (s: Site) => (s.priority ? 1 : 0),
                      render: (s: Site) => (s.priority ? 'Yes' : 'No'),
                    },
                  ]
                : []),
              ...(kind !== RangeKind.NONE
                ? [
                    {
                      key: 'range',
                      header: `${t.rangeUnit}s`,
                      sortValue: (s: Site) => s.rangeMin ?? -1,
                      render: (s: Site) =>
                        rangeText(kind, s.rangeMin, s.rangeMax).replace(/^(Grades?|Ages?) /, '') ||
                        '—',
                    },
                  ]
                : []),
              {
                key: 'programs',
                header: 'Programs',
                sortValue: (s) => programCount(s.id),
                render: (s) => (
                  <Link to="/programs" className="text-primary underline-offset-2 hover:underline">
                    {programCount(s.id)}
                  </Link>
                ),
              },
              {
                key: 'contact',
                header: 'Contact',
                hideOnMobile: true,
                render: (s) => <span className="text-ink-muted">{s.contactName}</span>,
              },
              {
                key: 'a',
                header: 'Actions',
                className: 'text-right',
                render: (s) => (
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit ${s.name}`}
                      icon={<Pencil className="size-4" aria-hidden />}
                      onClick={() => setSiteForm({ open: true, site: s })}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`${s.archived ? 'Restore' : 'Archive'} ${s.name}`}
                      icon={<Archive className="size-4" aria-hidden />}
                      onClick={() => void toggleArchive('site', s.id)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete ${s.name}`}
                      icon={<Trash2 className="size-4 text-bad" aria-hidden />}
                      onClick={() => setToDelete({ kind: 'site', id: s.id, name: s.name })}
                    />
                  </div>
                ),
              },
            ]}
          />
        </Panel>
      </div>

      <SiteForm
        open={siteForm.open}
        site={siteForm.site}
        onClose={() => setSiteForm({ open: false })}
        onSaved={() => {
          setSiteForm({ open: false });
          data.reload();
        }}
      />
      <ConfirmDialog
        open={!!toDelete}
        danger
        title={`Delete ${toDelete?.name}?`}
        message={`This also deletes its sessions and sign-ups. If any hours were logged, Onboard will ask you to archive it instead so records stay intact.`}
        confirmLabel="Delete"
        loading={deleting}
        onCancel={() => setToDelete(undefined)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
