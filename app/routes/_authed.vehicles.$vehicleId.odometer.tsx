import {
  createFileRoute,
  getRouteApi,
  Link,
  useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { requireAuth } from "~/auth/session.server";
import { formatDateOnly } from "~/components/format";
import {
  btnPrimary,
  card,
  errorBox,
  input,
  label as labelClass,
} from "~/components/ui";
import {
  createOdometerReading,
  deleteOdometerReading,
  listOdometerHistory,
} from "~/models/odometer.server";

const parentApi = getRouteApi("/_authed/vehicles/$vehicleId");

const loadOdometerFn = createServerFn({ method: "GET" })
  .inputValidator((vehicleId: string) => vehicleId)
  .handler(async ({ data: vehicleId }) => {
    const userId = await requireAuth();
    const history = await listOdometerHistory({ vehicleId, userId });
    return { history, userId };
  });

const addReadingFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      vehicleId: string;
      odometer: number;
      readAt: string;
      note: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    try {
      const readAt = new Date(data.readAt);
      await createOdometerReading({
        vehicleId: data.vehicleId,
        userId,
        odometer: data.odometer,
        readAt: Number.isNaN(readAt.getTime()) ? null : readAt,
        note: data.note || null,
      });
      return {};
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Failed to save reading",
      };
    }
  });

const deleteReadingFn = createServerFn({ method: "POST" })
  .inputValidator((data: { vehicleId: string; readingId: string }) => data)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    await deleteOdometerReading({
      id: data.readingId,
      vehicleId: data.vehicleId,
      userId,
    });
  });

export const Route = createFileRoute("/_authed/vehicles/$vehicleId/odometer")({
  component: OdometerPage,
  loader: async ({ params }) => loadOdometerFn({ data: params.vehicleId }),
});

/** Today as a YYYY-MM-DD string in UTC — matches date-only storage. */
function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function OdometerPage() {
  const router = useRouter();
  const v = parentApi.useLoaderData();
  const { history, userId } = Route.useLoaderData();
  const isOwner = v.role === "owner";
  const latest = history[0] ?? null;

  const [miles, setMiles] = useState("");
  const [readAt, setReadAt] = useState(todayInputValue());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await addReadingFn({
        data: {
          vehicleId: v.id,
          odometer: Number.parseFloat(miles),
          readAt,
          note: note.trim(),
        },
      });
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      setMiles("");
      setNote("");
      setReadAt(todayInputValue());
      await router.invalidate();
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mx-auto max-w-lg space-y-4">
      <div className={`${card} p-5`}>
        <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted">
          Last odometer
        </h2>
        {latest ? (
          <>
            <p className="mt-1 text-3xl font-bold tabular-nums text-ink">
              {Math.round(latest.odometer).toLocaleString()} mi
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              {formatDateOnly(latest.date)} ·{" "}
              {latest.source === "log" && latest.logId ? (
                <>
                  from service:{" "}
                  <Link
                    to="/vehicles/$vehicleId/logs/$logId"
                    params={{ vehicleId: v.id, logId: latest.logId }}
                    className="font-semibold text-accent hover:underline"
                  >
                    {latest.logTitle}
                  </Link>
                </>
              ) : (
                "manual reading"
              )}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-ink-muted">
            No readings yet — log work with an odometer, or add one below.
          </p>
        )}
      </div>

      <form onSubmit={onAdd} className={`${card} space-y-3 p-5`}>
        <h2 className="font-bold text-ink">Add a reading</h2>
        {error ? <p className={errorBox}>{error}</p> : null}
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Miles
            <input
              type="number"
              step="1"
              min="1"
              inputMode="numeric"
              required
              value={miles}
              onChange={(e) => setMiles(e.target.value)}
              className={`${input} text-lg font-semibold tabular-nums`}
            />
          </label>
          <label className={labelClass}>
            Date
            <input
              type="date"
              required
              value={readAt}
              onChange={(e) => setReadAt(e.target.value)}
              className={input}
            />
          </label>
        </div>
        <label className={labelClass}>
          Note (optional)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Spotted before the trail run"
            className={input}
          />
        </label>
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Saving…" : "Add reading"}
        </button>
      </form>

      <div className={`${card} p-5`}>
        <h2 className="font-bold text-ink">History</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Nothing recorded yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {history.map((entry) => (
              <li
                key={entry.readingId ?? `log-${entry.logId}`}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold tabular-nums text-ink">
                    {Math.round(entry.odometer).toLocaleString()} mi
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {formatDateOnly(entry.date)}
                    {entry.source === "log" && entry.logId ? (
                      <>
                        {" · "}
                        <Link
                          to="/vehicles/$vehicleId/logs/$logId"
                          params={{ vehicleId: v.id, logId: entry.logId }}
                          className="text-accent hover:underline"
                        >
                          {entry.logTitle}
                        </Link>
                      </>
                    ) : (
                      <>
                        {entry.authorName ? ` · ${entry.authorName}` : ""}
                        {entry.note ? ` · ${entry.note}` : ""}
                      </>
                    )}
                  </p>
                </div>
                {entry.source === "reading" &&
                entry.readingId &&
                (isOwner || entry.authorUserId === userId) ? (
                  <button
                    type="button"
                    className="min-h-11 shrink-0 px-3 text-xs font-semibold text-danger hover:underline"
                    onClick={async () => {
                      if (!window.confirm("Delete this reading?")) return;
                      await deleteReadingFn({
                        data: {
                          vehicleId: v.id,
                          readingId: entry.readingId as string,
                        },
                      });
                      await router.invalidate();
                    }}
                  >
                    Delete
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
