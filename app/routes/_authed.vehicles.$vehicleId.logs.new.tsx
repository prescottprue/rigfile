import {
  createFileRoute,
  redirect,
  useParams,
  useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { useAppSession } from "~/auth/session.server";
import { createLog } from "~/models/log.server";

const createLogFn = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data }) => {
    const session = await useAppSession();
    const userId = session.data.userId;
    if (!userId)
      throw redirect({ to: "/login", search: { redirectTo: undefined } });

    const vehicleId = String(data.get("vehicleId") ?? "");
    const title = String(data.get("title") ?? "").trim();
    const notes = String(data.get("notes") ?? "").trim() || null;
    const type = String(data.get("type") ?? "").trim() || null;
    const costRaw = String(data.get("cost") ?? "").trim();
    const odometerRaw = String(data.get("odometer") ?? "").trim();
    const servicedAtRaw = String(data.get("servicedAt") ?? "").trim();
    const selfService = data.get("selfService") === "on";

    if (!title || !vehicleId) {
      return { error: "Title is required" as const };
    }

    const cost = costRaw ? Number.parseFloat(costRaw) : null;
    const odometer = odometerRaw ? Number.parseFloat(odometerRaw) : null;
    const servicedAt = servicedAtRaw ? new Date(servicedAtRaw) : new Date();

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
    });

    throw redirect({
      to: "/vehicles/$vehicleId/logs/$logId",
      params: { vehicleId, logId: log.id },
    });
  });

export const Route = createFileRoute("/_authed/vehicles/$vehicleId/logs/new")({
  component: NewLog,
});

function NewLog() {
  const router = useRouter();
  const { vehicleId } = useParams({
    from: "/_authed/vehicles/$vehicleId/logs/new",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData(e.currentTarget);
    formData.set("vehicleId", vehicleId);
    try {
      const result = await createLogFn({ data: formData });
      if (result && "error" in result) {
        setError(result.error);
      } else {
        await router.invalidate();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold text-slate-900">New service log</h1>
      <form onSubmit={onSubmit} className="mt-6 max-w-lg space-y-4">
        {error ? (
          <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <label className="block text-sm font-medium text-slate-700">
          Title
          <input
            name="title"
            required
            className="mt-1 w-full rounded border border-slate-300 p-2"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Notes
          <textarea
            name="notes"
            rows={4}
            className="mt-1 w-full rounded border border-slate-300 p-2"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Type
          <select
            name="type"
            className="mt-1 w-full rounded border border-slate-300 p-2"
          >
            <option value="">—</option>
            <option>Minor</option>
            <option>Major</option>
            <option>Modify</option>
            <option>Check</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium text-slate-700">
            Cost (USD)
            <input
              name="cost"
              type="number"
              step="0.01"
              className="mt-1 w-full rounded border border-slate-300 p-2"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Odometer
            <input
              name="odometer"
              type="number"
              step="1"
              className="mt-1 w-full rounded border border-slate-300 p-2"
            />
          </label>
        </div>
        <label className="block text-sm font-medium text-slate-700">
          Serviced at
          <input
            name="servicedAt"
            type="date"
            className="mt-1 w-full rounded border border-slate-300 p-2"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="selfService" />
          Self-service
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save log"}
        </button>
      </form>
    </section>
  );
}
