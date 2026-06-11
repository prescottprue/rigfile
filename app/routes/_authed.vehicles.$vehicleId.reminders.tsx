import {
  createFileRoute,
  Link,
  useParams,
  useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { requireAuth } from "~/auth/session.server";
import { statusBadgeClass, statusLabel } from "~/components/reminder-display";
import {
  btnPrimary,
  btnSecondary,
  card,
  errorBox,
  input,
  label,
} from "~/components/ui";
import {
  completeReminder,
  createReminder,
  deleteReminder,
  listReminders,
} from "~/models/reminder.server";

const listRemindersFn = createServerFn({ method: "GET" })
  .inputValidator((vehicleId: string) => vehicleId)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    return listReminders({ vehicleId: data, userId });
  });

const createReminderFn = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    const vehicleId = String(data.get("vehicleId") ?? "");
    const title = String(data.get("title") ?? "").trim();
    if (!title || !vehicleId) return { error: "Title is required" as const };

    const num = (name: string) => {
      const raw = String(data.get(name) ?? "").trim();
      return raw ? Number.parseFloat(raw) : null;
    };
    const dueDateRaw = String(data.get("dueDate") ?? "").trim();

    await createReminder({
      vehicleId,
      userId,
      title,
      notes: String(data.get("notes") ?? "").trim() || null,
      dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
      dueMiles: num("dueMiles"),
      intervalMonths: num("intervalMonths"),
      intervalMiles: num("intervalMiles"),
    });
    return { ok: true as const };
  });

const completeReminderFn = createServerFn({ method: "POST" })
  .inputValidator((data: { vehicleId: string; reminderId: string }) => data)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    await completeReminder({
      id: data.reminderId,
      vehicleId: data.vehicleId,
      userId,
    });
  });

const deleteReminderFn = createServerFn({ method: "POST" })
  .inputValidator((data: { vehicleId: string; reminderId: string }) => data)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    await deleteReminder({
      id: data.reminderId,
      vehicleId: data.vehicleId,
      userId,
    });
  });

export const Route = createFileRoute("/_authed/vehicles/$vehicleId/reminders")({
  component: Reminders,
  loader: async ({ params }) =>
    (await listRemindersFn({ data: params.vehicleId })) ?? [],
});

function NewReminderForm({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData(e.currentTarget);
    formData.set("vehicleId", vehicleId);
    try {
      const result = await createReminderFn({ data: formData });
      if (result && "error" in result) {
        setError(result.error ?? "Failed to save reminder");
      } else {
        setOpen(false);
        await router.invalidate();
      }
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={btnPrimary}
      >
        + Add reminder
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className={`${card} space-y-4 p-5`}>
      {error ? <p className={errorBox}>{error}</p> : null}
      <label className={label}>
        What needs doing?
        <input
          name="title"
          required
          placeholder="Oil change"
          className={input}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          Due date
          <input name="dueDate" type="date" className={input} />
        </label>
        <label className={label}>
          Due at miles
          <input
            name="dueMiles"
            type="number"
            inputMode="numeric"
            placeholder="98500"
            className={input}
          />
        </label>
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-ink-muted">
          Repeats? (leave blank for one-time)
        </legend>
        <div className="mt-1 grid grid-cols-2 gap-3">
          <label className={label}>
            Every X months
            <input
              name="intervalMonths"
              type="number"
              inputMode="numeric"
              placeholder="6"
              className={input}
            />
          </label>
          <label className={label}>
            Every X miles
            <input
              name="intervalMiles"
              type="number"
              inputMode="numeric"
              placeholder="5000"
              className={input}
            />
          </label>
        </div>
      </fieldset>
      <label className={label}>
        Notes
        <input
          name="notes"
          placeholder="5W-30 synthetic, OEM filter"
          className={input}
        />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Saving…" : "Save reminder"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={btnSecondary}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Reminders() {
  const router = useRouter();
  const { vehicleId } = useParams({
    from: "/_authed/vehicles/$vehicleId/reminders",
  });
  const reminders = Route.useLoaderData();
  const active = reminders.filter((r) => r.status !== "done");
  const done = reminders.filter((r) => r.status === "done");

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-ink">Service reminders</h2>
      </div>
      <NewReminderForm vehicleId={vehicleId} />
      {active.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No upcoming reminders. Anything with a date or mileage target goes
          here — oil, brakes, tires, rally tech inspection…
        </p>
      ) : (
        <ul className="space-y-3">
          {active.map((r) => (
            <li key={r.id} className={`${card} p-4`}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{r.title}</p>
                  {r.notes ? (
                    <p className="mt-0.5 text-sm text-ink-muted">{r.notes}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-ink-muted">
                    {r.intervalMiles != null || r.intervalMonths != null
                      ? `repeats${r.intervalMonths != null ? ` every ${r.intervalMonths} mo` : ""}${r.intervalMiles != null ? ` every ${Math.round(r.intervalMiles).toLocaleString()} mi` : ""}`
                      : "one-time"}
                  </p>
                </div>
                <span className={statusBadgeClass(r.status)}>
                  {statusLabel(r)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to="/vehicles/$vehicleId/logs/new"
                  params={{ vehicleId }}
                  search={{ reminder: r.id }}
                  className={btnPrimary}
                >
                  Did it — log the work
                </Link>
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={async () => {
                    await completeReminderFn({
                      data: { vehicleId, reminderId: r.id },
                    });
                    await router.invalidate();
                  }}
                >
                  Mark done
                </button>
                <button
                  type="button"
                  className="min-h-11 px-3 text-sm text-danger hover:underline"
                  onClick={async () => {
                    if (!window.confirm(`Delete reminder "${r.title}"?`))
                      return;
                    await deleteReminderFn({
                      data: { vehicleId, reminderId: r.id },
                    });
                    await router.invalidate();
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-ink-muted">
            Completed ({done.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {done.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 text-sm text-ink-muted"
              >
                <span className="line-through">{r.title}</span>
                <button
                  type="button"
                  className="text-danger hover:underline"
                  onClick={async () => {
                    await deleteReminderFn({
                      data: { vehicleId, reminderId: r.id },
                    });
                    await router.invalidate();
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
