/**
 * @file Equipment inventory (FR-21, V-S10): add items, check them out to a program, return them.
 * Every label uses the org's own word for an item (robot kit, blood-pressure cuff, gear bag…).
 */
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { EquipmentCondition, labelOf } from '@shared/enums';
import { messageOf } from '@shared/errors';
import { equipmentSchema, type EquipmentInput } from '@shared/schemas';
import type { Equipment } from '@shared/types';
import { Button } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import { FormError, FormField, Select, TextInput } from '@/components/Form';
import { ErrorBlock, Loading, PageHeader, StatTile } from '@/components/Layout';
import { Modal } from '@/components/Modal';
import { StatusBadge } from '@/components/Status';
import { useToast } from '@/context/ToastContext';
import { useManagedOrg } from '@/context/OrgContext';
import { useAsync } from '@/hooks/useAsync';
import { useForm } from '@/hooks/useForm';
import { api } from '@/lib/api';

/**
 * The equipment page.
 * @returns The page.
 */
export default function EquipmentPage() {
  const { org, terms: t } = useManagedOrg();
  const toast = useToast();
  const data = useAsync(
    () => Promise.all([api.equipment.list(org.id), api.programs.list(org.id)]),
    [org.id],
  );
  const [addOpen, setAddOpen] = useState(false);
  const [checkout, setCheckout] = useState<{ item: Equipment; programId: string }>();
  const [busy, setBusy] = useState<string>();
  const form = useForm(equipmentSchema, {
    assetTag: '',
    name: '',
    condition: EquipmentCondition.GOOD,
  } as EquipmentInput);

  if (data.loading && !data.data) return <Loading />;
  if (data.error || !data.data)
    return <ErrorBlock message={data.error ?? 'Could not load.'} onRetry={data.reload} />;
  const [items, allPrograms] = data.data;
  const programs = allPrograms.filter((p) => !p.oneOff);
  const programName = (id?: string) => allPrograms.find((p) => p.id === id)?.name;

  /**
   * Runs an equipment action.
   * @param key - Busy key.
   * @param fn - API call.
   * @param msg - Success message.
   */
  const act = async (key: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(key);
    try {
      await fn();
      toast.show(msg);
      data.reload();
      return true;
    } catch (err) {
      toast.show(messageOf(err), 'error');
      return false;
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <>
      <PageHeader
        title={t.EquipmentPlural}
        actions={
          <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setAddOpen(true)}>
            Add {t.equipment}
          </Button>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={`Total ${t.equipmentPlural}`} value={items.length} />
        <StatTile label="Checked out" value={items.filter((k) => k.programId).length} />
        <StatTile
          label="Available"
          value={
            items.filter((k) => !k.programId && k.condition !== EquipmentCondition.RETIRED).length
          }
        />
        <StatTile
          label="Need attention"
          value={
            items.filter(
              (k) =>
                k.condition === EquipmentCondition.NEEDS_REPAIR ||
                k.condition === EquipmentCondition.MISSING_PARTS,
            ).length
          }
        />
      </div>
      <DataTable<Equipment>
        caption={t.EquipmentPlural}
        rows={items}
        rowKey={(k) => k.id}
        initialSort={{ key: 'tag', dir: 'asc' }}
        columns={[
          {
            key: 'tag',
            header: 'Asset tag',
            sortValue: (k) => k.assetTag,
            render: (k) => <span className="font-semibold tabular-nums">{k.assetTag}</span>,
          },
          { key: 'name', header: 'Name', sortValue: (k) => k.name, render: (k) => k.name },
          {
            key: 'cond',
            header: 'Condition',
            sortValue: (k) => k.condition,
            render: (k) => <StatusBadge status={k.condition} />,
          },
          {
            key: 'prog',
            header: 'With program',
            sortValue: (k) => programName(k.programId) ?? '',
            render: (k) =>
              programName(k.programId) ?? <span className="text-ink-muted">In storage</span>,
          },
          {
            key: 'a',
            header: 'Actions',
            className: 'text-right',
            render: (k) =>
              k.programId ? (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === k.id}
                  onClick={() =>
                    void act(
                      k.id,
                      () => api.equipment.returnEquipment(k.id),
                      `${k.assetTag} returned.`,
                    )
                  }
                >
                  Return
                </Button>
              ) : k.condition !== EquipmentCondition.RETIRED ? (
                <Button
                  size="sm"
                  onClick={() => setCheckout({ item: k, programId: programs[0]?.id ?? '' })}
                >
                  Check out
                </Button>
              ) : null,
          },
        ]}
      />

      <Modal
        open={!!checkout}
        onClose={() => setCheckout(undefined)}
        size="sm"
        title={`Check out ${checkout?.item.assetTag ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCheckout(undefined)}>
              Cancel
            </Button>
            <Button
              loading={busy === 'co'}
              onClick={() =>
                checkout &&
                void act(
                  'co',
                  () => api.equipment.checkOut(checkout.item.id, checkout.programId),
                  `${checkout.item.assetTag} checked out.`,
                ).then((ok) => ok && setCheckout(undefined))
              }
            >
              Check out
            </Button>
          </>
        }
      >
        <FormField label="Program">
          {(p) => (
            <Select
              {...p}
              value={checkout?.programId ?? ''}
              onChange={(e) => checkout && setCheckout({ ...checkout, programId: e.target.value })}
            >
              {programs.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      </Modal>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        size="sm"
        title={`Add ${/^[aeiou]/i.test(t.equipment) ? 'an' : 'a'} ${t.equipment}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={form.submitting}
              onClick={() =>
                void form.submit(async (d) => {
                  await api.equipment.create(org.id, d);
                  toast.show(`${d.assetTag} added.`);
                  setAddOpen(false);
                  form.reset({ assetTag: '', name: d.name, condition: EquipmentCondition.GOOD });
                  data.reload();
                })
              }
            >
              Add {t.equipment}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError message={form.formError} />
          <FormField
            label="Asset tag"
            hint="2–20 letters, numbers or dashes"
            error={form.errors.assetTag}
            required
          >
            {(p) => (
              <TextInput
                {...p}
                placeholder="TAG-0025"
                value={form.values.assetTag}
                invalid={!!form.errors.assetTag}
                onChange={(e) => form.set('assetTag', e.target.value.toUpperCase())}
                onBlur={() => form.touch('assetTag')}
              />
            )}
          </FormField>
          <FormField
            label="Name"
            hint="What it is, e.g. make and model"
            error={form.errors.name}
            required
          >
            {(p) => (
              <TextInput
                {...p}
                value={form.values.name}
                invalid={!!form.errors.name}
                onChange={(e) => form.set('name', e.target.value)}
                onBlur={() => form.touch('name')}
              />
            )}
          </FormField>
          <FormField label="Condition">
            {(p) => (
              <Select
                {...p}
                value={form.values.condition}
                onChange={(e) =>
                  form.set('condition', e.target.value as EquipmentInput['condition'])
                }
              >
                {Object.values(EquipmentCondition).map((c) => (
                  <option key={c} value={c}>
                    {labelOf(c)}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        </div>
      </Modal>
    </>
  );
}
