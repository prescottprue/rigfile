import {
  createFileRoute,
  Link,
  useParams,
  useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { requireAuth } from "~/auth/session.server";
import {
  btnPrimary,
  btnSecondary,
  card,
  errorBox,
  input,
  label,
  textarea,
} from "~/components/ui";
import { createProject, listProjects } from "~/models/project.server";

const listProjectsFn = createServerFn({ method: "GET" })
  .inputValidator((vehicleId: string) => vehicleId)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    return listProjects({ vehicleId: data, userId });
  });

const createProjectFn = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    const vehicleId = String(data.get("vehicleId") ?? "");
    const title = String(data.get("title") ?? "").trim();
    if (!title || !vehicleId) return { error: "Title is required" as const };
    const targetDateRaw = String(data.get("targetDate") ?? "").trim();
    const project = await createProject({
      vehicleId,
      userId,
      title,
      description: String(data.get("description") ?? "").trim() || null,
      targetDate: targetDateRaw ? new Date(targetDateRaw) : null,
      status: "idea",
    });
    return { projectId: project.id };
  });

export const Route = createFileRoute("/_authed/vehicles/$vehicleId/projects/")({
  component: ProjectsList,
  loader: async ({ params }) =>
    (await listProjectsFn({ data: params.vehicleId })) ?? [],
});

const STATUS_LABELS: Record<string, string> = {
  idea: "💡 idea",
  planned: "📋 planned",
  in_progress: "🔧 in progress",
  done: "✅ done",
};

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function NewProjectForm({ vehicleId }: { vehicleId: string }) {
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
      const result = await createProjectFn({ data: formData });
      if (result && "error" in result) {
        setError(result.error ?? "Failed to create project");
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
        + New project
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className={`${card} space-y-4 p-5`}>
      {error ? <p className={errorBox}>{error}</p> : null}
      <label className={label}>
        Project name
        <input
          name="title"
          required
          placeholder="Rally prep — Gorman Ridge"
          className={input}
        />
      </label>
      <label className={label}>
        What's the plan?
        <textarea
          name="description"
          rows={3}
          placeholder="Full service + skid plate + spare wheel setup before the event"
          className={textarea}
        />
      </label>
      <label className={label}>
        Target date (event day, deadline…)
        <input name="targetDate" type="date" className={input} />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Creating…" : "Create project"}
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

function ProjectsList() {
  const { vehicleId } = useParams({
    from: "/_authed/vehicles/$vehicleId/projects/",
  });
  const projects = Route.useLoaderData();

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-ink">Builds & plans</h2>
      <NewProjectForm vehicleId={vehicleId} />
      {projects.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Nothing planned yet. Projects collect parts, prices, and progress for
          bigger jobs — a rally build, a suspension refresh, that turbo you keep
          talking about.
        </p>
      ) : (
        <ul className="space-y-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                to="/vehicles/$vehicleId/projects/$projectId"
                params={{ vehicleId, projectId: p.id }}
                className={`${card} block p-5 transition-shadow hover:shadow-md`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-ink">{p.title}</span>
                  <span className="text-xs font-semibold text-ink-muted">
                    {STATUS_LABELS[p.status] ?? p.status}
                  </span>
                </div>
                {p.description ? (
                  <p className="mt-1 line-clamp-2 text-sm text-ink-muted">
                    {p.description}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                  {p.targetDate ? (
                    <span
                      className={`rounded-full px-2.5 py-1 ${
                        daysUntil(p.targetDate) < 0
                          ? "bg-danger/15 text-danger"
                          : daysUntil(p.targetDate) <= 14
                            ? "bg-warn/15 text-warn"
                            : "bg-sunken text-ink-muted"
                      }`}
                    >
                      {daysUntil(p.targetDate) >= 0
                        ? `${daysUntil(p.targetDate)} days out`
                        : `${-daysUntil(p.targetDate)} days past target`}
                    </span>
                  ) : null}
                  <span className="rounded-full bg-sunken px-2.5 py-1 text-ink-muted">
                    {p.itemCount} {p.itemCount === 1 ? "item" : "items"}
                  </span>
                  {p.estimatedTotal > 0 ? (
                    <span className="rounded-full bg-sunken px-2.5 py-1 text-ink-muted">
                      ~${Math.round(p.estimatedTotal).toLocaleString()} est
                      {p.committedTotal > 0
                        ? ` · $${Math.round(p.committedTotal).toLocaleString()} committed`
                        : ""}
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
