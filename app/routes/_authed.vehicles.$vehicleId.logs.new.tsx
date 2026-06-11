import {
  createFileRoute,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { requireAuth } from "~/auth/session.server";
import {
  btnPrimary,
  card,
  chip,
  errorBox,
  input,
  label,
  textarea,
} from "~/components/ui";
import { createLog } from "~/models/log.server";
import { findOrCreateMechanic } from "~/models/mechanic.server";
import { completeReminder, getReminder } from "~/models/reminder.server";

// Tap-to-fill presets so common jobs don't need typing in the shop.
const PRESETS = [
  "Oil change",
  "Brake pads",
  "Tire rotation",
  "New tires",
  "Air filter",
  "Coolant",
  "Battery",
  "Wipers",
  "Alignment",
  "Inspection",
] as const;

const TYPES = ["Minor", "Major", "Modify", "Check"] as const;

const loadReminderFn = createServerFn({ method: "GET" })
  .inputValidator((data: { vehicleId: string; reminderId: string }) => data)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    return getReminder({
      id: data.reminderId,
      vehicleId: data.vehicleId,
      userId,
    });
  });

const createLogFn = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data }) => {
    const userId = await requireAuth();

    const vehicleId = String(data.get("vehicleId") ?? "");
    const title = String(data.get("title") ?? "").trim();
    const notes = String(data.get("notes") ?? "").trim() || null;
    const type = String(data.get("type") ?? "").trim() || null;
    const costRaw = String(data.get("cost") ?? "").trim();
    const odometerRaw = String(data.get("odometer") ?? "").trim();
    const servicedAtRaw = String(data.get("servicedAt") ?? "").trim();
    const selfService = data.get("selfService") === "on";
    const reminderId = String(data.get("reminderId") ?? "").trim() || null;

    if (!title || !vehicleId) {
      return { error: "Title is required" as const };
    }

    const cost = costRaw ? Number.parseFloat(costRaw) : null;
    const odometer = odometerRaw ? Number.parseFloat(odometerRaw) : null;
    const servicedAt = servicedAtRaw ? new Date(servicedAtRaw) : new Date();

    const shopName = String(data.get("shopName") ?? "").trim();
    const mechanic = shopName
      ? await findOrCreateMechanic({ name: shopName })
      : null;

    const log = await createLog({
      userId,
      vehicleId,
      title,
      notes,
      type,
      cost,
      odometer,
      servicedAt,
      selfService,
      mechanicId: mechanic?.id ?? null,
    });

    // Logging the work knocks out the reminder that prompted it —
    // recurring reminders roll forward from this odometer reading.
    if (reminderId) {
      await completeReminder({ id: reminderId, vehicleId, userId, odometer });
    }

    return { vehicleId, logId: log.id };
  });

type LogSearch = { reminder?: string };

export const Route = createFileRoute("/_authed/vehicles/$vehicleId/logs/new")({
  validateSearch: (search: Record<string, unknown>): LogSearch => ({
    reminder: typeof search.reminder === "string" ? search.reminder : undefined,
  }),
  loaderDeps: ({ search }) => ({ reminder: search.reminder }),
  loader: async ({ params, deps }) => {
    if (!deps.reminder) return { reminder: null };
    const reminder = await loadReminderFn({
      data: { vehicleId: params.vehicleId, reminderId: deps.reminder },
    });
    return { reminder };
  },
  component: NewLog,
});

function NewLog() {
  const navigate = useNavigate();
  const { vehicleId } = useParams({
    from: "/_authed/vehicles/$vehicleId/logs/new",
  });
  const { reminder } = Route.useLoaderData();
  const [title, setTitle] = useState(reminder?.title ?? "");
  const [type, setType] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData(e.currentTarget);
    formData.set("vehicleId", vehicleId);
    formData.set("title", title);
    formData.set("type", type);
    if (reminder) formData.set("reminderId", reminder.id);
    try {
      const result = await createLogFn({ data: formData });
      if (result && "error" in result && result.error) {
        setError(result.error);
      } else if (result && "logId" in result) {
        navigate({
          to: "/vehicles/$vehicleId",
          params: { vehicleId: result.vehicleId },
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mx-auto max-w-lg">
      <h2 className="text-xl font-bold text-ink">Log work</h2>
      {reminder ? (
        <p className="mt-1 text-sm text-ink-muted">
          Knocking out the “{reminder.title}” reminder — saving this log marks
          it done{" "}
          {reminder.intervalMonths != null || reminder.intervalMiles != null
            ? "and schedules the next one"
            : ""}
          .
        </p>
      ) : null}
      <form onSubmit={onSubmit} className="mt-4 space-y-5">
        {error ? <p className={errorBox}>{error}</p> : null}

        <div>
          <span className={label}>What did you do?</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={chip(title === preset)}
                onClick={() => setTitle(preset)}
              >
                {preset}
              </button>
            ))}
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="…or type it"
            aria-label="Title"
            className={`${input} mt-3 text-lg font-semibold`}
          />
        </div>

        <div className={`${card} p-4`}>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              Odometer (mi)
              <input
                name="odometer"
                type="number"
                step="1"
                inputMode="numeric"
                placeholder="98 412"
                className={`${input} text-lg font-semibold tabular-nums`}
              />
            </label>
            <label className={label}>
              Cost (USD)
              <input
                name="cost"
                type="number"
                step="0.01"
                inputMode="decimal"
                placeholder="64.99"
                className={`${input} text-lg font-semibold tabular-nums`}
              />
            </label>
          </div>
        </div>

        <div>
          <span className={label}>Job size</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={chip(type === t)}
                onClick={() => setType(type === t ? "" : t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <label className={label}>
          Notes — torque specs, part numbers, what you'd do differently
          <textarea name="notes" rows={4} className={textarea} />
        </label>

        <label className={label}>
          Shop (if not DIY) — filter your history by vendor later
          <input
            name="shopName"
            placeholder="Desert 4x4 Service Center"
            className={input}
          />
        </label>

        <div className="grid grid-cols-2 items-end gap-3">
          <label className={label}>
            When
            <input name="servicedAt" type="date" className={input} />
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-ink">
            <input
              type="checkbox"
              name="selfService"
              defaultChecked
              className="h-6 w-6 rounded accent-(--app-accent)"
            />
            We did it ourselves
          </label>
        </div>

        <button
          type="submit"
          disabled={pending}
          className={`${btnPrimary} w-full py-4 text-lg`}
        >
          {pending ? "Saving…" : "Save it ✓"}
        </button>
      </form>
    </section>
  );
}
