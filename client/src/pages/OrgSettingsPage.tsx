/**
 * @file Manage → Organization settings (Phases 2 and 3).
 *
 * One place where an org makes Onboard its own:
 *  - **Words** — what it calls its places, the people it serves, its equipment and its priority
 *    flag ("School · Students · Kit · Title I", "Clinic · Patients · Equipment · Underserved
 *    area"…). Every screen, rule message and report reads these.
 *  - **Features** — equipment tracking, priority sites and guest volunteers can be switched off
 *    when they don't apply.
 *  - **Skills and event roles** — the catalogs offered on applications, sessions and events.
 *  - **Requirements** — the checklist volunteers complete before serving, with optional expiry.
 *
 * Words, features and catalogs save together; requirements save one at a time.
 */
import { ArrowDown, ArrowUp, Archive, Pencil, Plus, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { labelOf, OrgSector, RangeKind } from '@shared/enums';
import { messageOf } from '@shared/errors';
import {
  orgSettingsSchema,
  requirementSchema,
  type OrgSettingsInput,
  type RequirementInput,
} from '@shared/schemas';
import { defaultSettings, rangeText, termsFor } from '@shared/terms';
import type { Requirement } from '@shared/types';
import { Button } from '@/components/Button';
import { Checkbox, FormError, FormField, Select, TextArea, TextInput } from '@/components/Form';
import { EmptyState, ErrorBlock, Loading, PageHeader, Panel } from '@/components/Layout';
import { ConfirmDialog, Modal } from '@/components/Modal';
import { useManagedOrg, useOrg } from '@/context/OrgContext';
import { NameListEditor } from '@/features/org/NameListEditor';
import { useToast } from '@/context/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { useForm } from '@/hooks/useForm';
import { api } from '@/lib/api';

/**
 * Words, features, skills and event roles: one form, saved together.
 * @returns The settings panels.
 */
function SettingsForm() {
  const { org } = useManagedOrg();
  const { reload } = useOrg();
  const toast = useToast();
  const initial = useMemo<OrgSettingsInput>(() => ({ ...org.settings }), [org.settings]);
  const form = useForm(orgSettingsSchema, initial);
  const { values: v, errors: e, set, touch, reset } = form;
  useEffect(() => reset(initial), [initial, reset]);
  const preview = termsFor(v);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  /** Fills in the chosen sector's starting words and catalogs (the person can still edit them). */
  const applySector = () => {
    const d = defaultSettings(v.sector);
    reset({ ...d, sector: v.sector });
  };

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(ev) => {
        ev.preventDefault();
        void form.submit(async (data) => {
          await api.settings.update(org.id, data);
          await reload();
          toast.show('Settings saved. Every screen now uses the new words.');
        });
      }}
    >
      <FormError message={form.formError} />
      <Panel
        title="Words"
        description="What your organization calls things. Screens, messages and reports use these words."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <FormField label="Kind of organization">
            {(p) => (
              <div className="flex gap-2">
                <Select
                  {...p}
                  value={v.sector}
                  onChange={(x) => set('sector', x.target.value as OrgSettingsInput['sector'])}
                >
                  {Object.values(OrgSector).map((s) => (
                    <option key={s} value={s}>
                      {labelOf(s)}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="ghost"
                  icon={<RotateCcw className="size-4" aria-hidden />}
                  onClick={applySector}
                  title="Replace the words, features, skills and roles below with this kind's starting set"
                >
                  Use defaults
                </Button>
              </div>
            )}
          </FormField>
          <FormField
            label="A place you serve"
            hint="Singular, e.g. School, Clinic, Field"
            error={e.siteTerm}
            required
          >
            {(p) => (
              <TextInput
                {...p}
                maxLength={30}
                value={v.siteTerm}
                invalid={!!e.siteTerm}
                onChange={(x) => set('siteTerm', x.target.value)}
                onBlur={() => touch('siteTerm')}
              />
            )}
          </FormField>
          <FormField
            label="People you serve"
            hint="Plural, e.g. Students, Patients, Players"
            error={e.participantTerm}
            required
          >
            {(p) => (
              <TextInput
                {...p}
                maxLength={30}
                value={v.participantTerm}
                invalid={!!e.participantTerm}
                onChange={(x) => set('participantTerm', x.target.value)}
                onBlur={() => touch('participantTerm')}
              />
            )}
          </FormField>
          <FormField
            label="An equipment item"
            hint="Singular, e.g. Kit, Cuff, Gear bag"
            error={e.equipmentTerm}
            required
          >
            {(p) => (
              <TextInput
                {...p}
                maxLength={30}
                value={v.equipmentTerm}
                invalid={!!e.equipmentTerm}
                onChange={(x) => set('equipmentTerm', x.target.value)}
                onBlur={() => touch('equipmentTerm')}
              />
            )}
          </FormField>
          <FormField
            label="Priority flag"
            hint="e.g. Title I, Underserved area"
            error={e.priorityLabel}
            required
          >
            {(p) => (
              <TextInput
                {...p}
                maxLength={30}
                value={v.priorityLabel}
                invalid={!!e.priorityLabel}
                onChange={(x) => set('priorityLabel', x.target.value)}
                onBlur={() => touch('priorityLabel')}
              />
            )}
          </FormField>
          <FormField label="Who each place serves" hint="Kept on each place, optional">
            {(p) => (
              <Select
                {...p}
                value={v.rangeKind}
                onChange={(x) => set('rangeKind', x.target.value as OrgSettingsInput['rangeKind'])}
              >
                {Object.values(RangeKind).map((k) => (
                  <option key={k} value={k}>
                    {labelOf(k)}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        </div>
        <p
          className="mt-4 rounded-control bg-surface-2 px-3 py-2 text-sm text-ink-muted"
          aria-live="polite"
        >
          Preview:{' '}
          {[
            `${preview.Sites} & programs`,
            `18 ${preview.participants} per session`,
            v.features.equipment && `${preview.EquipmentPlural} checked out`,
            v.features.prioritySites && `${preview.priority} ${preview.sites} only`,
            v.rangeKind !== RangeKind.NONE &&
              (v.rangeKind === RangeKind.GRADE
                ? rangeText(v.rangeKind, 4, 8)
                : rangeText(v.rangeKind, 8, 12)),
          ]
            .filter(Boolean)
            .map((x) => `“${x}”`)
            .join(' · ')}
        </p>
      </Panel>

      <Panel
        title="Features"
        description="Switch off what your organization doesn’t use; menus and forms hide it."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Checkbox
            label={`Track ${preview.equipmentPlural}`}
            description={`An inventory of ${preview.equipmentPlural} that programs check out and return.`}
            checked={v.features.equipment}
            onChange={(c) => set('features', { ...v.features, equipment: c })}
          />
          <Checkbox
            label={`${preview.priority} ${preview.sites}`}
            description={`Flag some ${preview.sites} as ${preview.priority}; filters and sponsor reports can single them out.`}
            checked={v.features.prioritySites}
            onChange={(c) => set('features', { ...v.features, prioritySites: c })}
          />
          <Checkbox
            label="Guest volunteers"
            description="Let sessions accept one-time helpers who haven’t joined your organization."
            checked={v.features.guests}
            onChange={(c) => set('features', { ...v.features, guests: c })}
          />
        </div>
      </Panel>

      <div className="space-y-6">
        <Panel
          title="Skills"
          description="Offered on the volunteer application and on sessions, and used to match volunteers. Add a short description when a name might not be clear."
        >
          <NameListEditor
            label="Skills"
            noun="skill"
            items={v.skills}
            onChange={(s) => set('skills', s)}
            placeholder="e.g. First aid"
            error={e.skills}
            notes={v.skillNotes}
            onNotesChange={(n) => set('skillNotes', n)}
          />
        </Panel>
        <Panel
          title="Event roles"
          description="Named slots an event is split into, such as Judge or Greeter. New events get one of each."
        >
          <NameListEditor
            label="Event roles"
            noun="role"
            items={v.eventRoles}
            onChange={(r) => set('eventRoles', r)}
            placeholder="e.g. Check-in"
            error={e.eventRoles}
          />
        </Panel>
      </div>

      <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-end gap-2 border-t border-line bg-canvas/95 px-1 py-3 backdrop-blur">
        {dirty && <span className="mr-auto text-sm text-ink-muted">You have unsaved changes.</span>}
        <Button variant="secondary" disabled={!dirty} onClick={() => reset(initial)}>
          Discard
        </Button>
        <Button type="submit" loading={form.submitting} disabled={!dirty}>
          Save settings
        </Button>
      </div>
    </form>
  );
}

/** Blank requirement form values. */
const BLANK_REQUIREMENT: RequirementInput = { name: '', description: '', validMonths: undefined };

/**
 * The requirements checklist editor: add, edit, reorder and archive.
 * @returns The panel.
 */
function RequirementsEditor() {
  const { org, terms } = useManagedOrg();
  const toast = useToast();
  const list = useAsync(() => api.settings.requirements(org.id), [org.id]);
  const [editing, setEditing] = useState<{ open: boolean; requirement?: Requirement }>({
    open: false,
  });
  const [toArchive, setToArchive] = useState<Requirement>();
  const [busy, setBusy] = useState<string>();
  const form = useForm(requirementSchema, BLANK_REQUIREMENT);
  const { values: v, errors: e, set, touch, reset } = form;

  /**
   * Opens the form for a new or existing requirement.
   * @param requirement - Requirement to edit; omit to add.
   */
  const open = (requirement?: Requirement) => {
    reset(
      requirement
        ? {
            name: requirement.name,
            description: requirement.description,
            validMonths: requirement.validMonths,
          }
        : BLANK_REQUIREMENT,
    );
    setEditing({ open: true, requirement });
  };

  /**
   * Moves a requirement up or down.
   * @param r - Requirement.
   * @param direction - `-1` up, `1` down.
   */
  const move = async (r: Requirement, direction: -1 | 1) => {
    setBusy(r.id);
    try {
      list.setData(await api.settings.moveRequirement(r.id, direction));
    } catch (err) {
      toast.show(messageOf(err), 'error');
    } finally {
      setBusy(undefined);
    }
  };

  const items = list.data ?? [];
  return (
    <Panel
      id="requirements"
      title="Volunteer requirements"
      description={`What volunteers complete before serving ${terms.participants}: trainings, checks, certifications. Expiring items need renewing.`}
      actions={
        <Button size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => open()}>
          Add requirement
        </Button>
      }
    >
      {list.error ? (
        <ErrorBlock message={list.error} onRetry={list.reload} />
      ) : list.loading && !list.data ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState
          title="No requirements"
          message="Volunteers only need to be Active to join shifts and events. Add a background check, training or certification to require it first."
        />
      ) : (
        <ol className="space-y-2">
          {items.map((r, i) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line px-3 py-2"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  <span className="mr-2 tabular-nums text-ink-muted">{i + 1}.</span>
                  {r.name}
                </p>
                <p className="text-sm text-ink-muted">
                  {r.validMonths ? `Renew every ${r.validMonths} months` : 'Never expires'}
                  {r.description ? ` · ${r.description}` : ''}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Move ${r.name} up`}
                  disabled={i === 0 || busy === r.id}
                  icon={<ArrowUp className="size-4" aria-hidden />}
                  onClick={() => void move(r, -1)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Move ${r.name} down`}
                  disabled={i === items.length - 1 || busy === r.id}
                  icon={<ArrowDown className="size-4" aria-hidden />}
                  onClick={() => void move(r, 1)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit ${r.name}`}
                  icon={<Pencil className="size-4" aria-hidden />}
                  onClick={() => open(r)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Archive ${r.name}`}
                  icon={<Archive className="size-4" aria-hidden />}
                  onClick={() => setToArchive(r)}
                />
              </div>
            </li>
          ))}
        </ol>
      )}

      <Modal
        open={editing.open}
        onClose={() => setEditing({ open: false })}
        title={editing.requirement ? `Edit ${editing.requirement.name}` : 'Add a requirement'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing({ open: false })}>
              Cancel
            </Button>
            <Button
              loading={form.submitting}
              onClick={() =>
                void form.submit(async (d) => {
                  if (editing.requirement)
                    await api.settings.updateRequirement(editing.requirement.id, d);
                  else await api.settings.createRequirement(org.id, d);
                  toast.show(editing.requirement ? 'Requirement updated.' : 'Requirement added.');
                  setEditing({ open: false });
                  list.reload();
                })
              }
            >
              {editing.requirement ? 'Save changes' : 'Add requirement'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError message={form.formError} />
          <FormField label="Name" error={e.name} required>
            {(p) => (
              <TextInput
                {...p}
                maxLength={60}
                placeholder="e.g. Background check, CPR certification"
                value={v.name}
                invalid={!!e.name}
                onChange={(x) => set('name', x.target.value)}
                onBlur={() => touch('name')}
              />
            )}
          </FormField>
          <FormField label="How volunteers complete it" error={e.description}>
            {(p) => (
              <TextArea
                {...p}
                maxLength={200}
                className="min-h-20"
                value={v.description}
                invalid={!!e.description}
                onChange={(x) => set('description', x.target.value)}
                onBlur={() => touch('description')}
              />
            )}
          </FormField>
          <FormField
            label="Valid for (months)"
            hint="Leave empty if it never expires"
            error={e.validMonths}
            className="max-w-40"
          >
            {(p) => (
              <TextInput
                {...p}
                type="number"
                min={1}
                max={120}
                inputMode="numeric"
                value={v.validMonths ?? ''}
                invalid={!!e.validMonths}
                onChange={(x) =>
                  set('validMonths', x.target.value === '' ? undefined : Number(x.target.value))
                }
                onBlur={() => touch('validMonths')}
              />
            )}
          </FormField>
          {!editing.requirement && (
            <p className="text-sm text-ink-muted">
              Active volunteers who haven’t completed it yet can’t join new shifts or events until
              someone records it on their checklist.
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toArchive}
        title={`Archive ${toArchive?.name ?? ''}?`}
        message="It comes off every volunteer’s checklist and no longer blocks anyone from serving."
        confirmLabel="Archive"
        loading={busy === 'archive'}
        onCancel={() => setToArchive(undefined)}
        onConfirm={() => {
          if (!toArchive) return;
          setBusy('archive');
          void api.settings
            .archiveRequirement(toArchive.id)
            .then(() => {
              toast.show(`${toArchive.name} archived.`);
              list.reload();
            })
            .catch((err: unknown) => toast.show(messageOf(err), 'error'))
            .finally(() => {
              setBusy(undefined);
              setToArchive(undefined);
            });
        }}
      />
    </Panel>
  );
}

/**
 * The organization settings page.
 * @returns The page.
 */
export default function OrgSettingsPage() {
  return (
    <>
      <PageHeader title="Organization settings" />
      <div className="space-y-6">
        <SettingsForm />
        <RequirementsEditor />
      </div>
    </>
  );
}
