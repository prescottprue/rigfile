import {
  createFileRoute,
  notFound,
  useNavigate,
  useParams,
  useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { requireAuth } from "~/auth/session.server";
import { btnSecondary, card, errorBox, input, label } from "~/components/ui";
import {
  addProjectItem,
  deleteProject,
  deleteProjectItem,
  getProject,
  updateProjectItemStatus,
  updateProjectStatus,
} from "~/models/project.server";
import type { ItemStatus, ProjectStatus } from "~/models/project.shared";
import { ITEM_STATUSES, PROJECT_STATUSES } from "~/models/project.shared";

const loadProjectFn = createServerFn({ method: "GET" })
  .inputValidator((data: { vehicleId: string; projectId: string }) => data)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    return getProject({
      id: data.projectId,
      vehicleId: data.vehicleId,
      userId,
    });
  });

const setProjectStatusFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { vehicleId: string; projectId: string; status: ProjectStatus }) =>
      data,
  )
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    await updateProjectStatus({
      id: data.projectId,
      vehicleId: data.vehicleId,
      userId,
      status: data.status,
    });
  });

const deleteProjectFn = createServerFn({ method: "POST" })
  .inputValidator((data: { vehicleId: string; projectId: string }) => data)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    await deleteProject({
      id: data.projectId,
      vehicleId: data.vehicleId,
      userId,
    });
  });

const addItemFn = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    const vehicleId = String(data.get("vehicleId") ?? "");
    const projectId = String(data.get("projectId") ?? "");
    const name = String(data.get("name") ?? "").trim();
    if (!name) return { error: "Part name is required" as const };
    const priceRaw = String(data.get("price") ?? "").trim();
    const qtyRaw = String(data.get("quantity") ?? "").trim();
    await addProjectItem({
      vehicleId,
      userId,
      projectId,
      name,
      url: String(data.get("url") ?? "").trim() || null,
      price: priceRaw ? Number.parseFloat(priceRaw) : null,
      quantity: qtyRaw ? Number.parseInt(qtyRaw, 10) : 1,
    });
    return { ok: true as const };
  });

const setItemStatusFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      vehicleId: string;
      projectId: string;
      itemId: string;
      status: ItemStatus;
    }) => data,
  )
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    await updateProjectItemStatus({
      id: data.itemId,
      projectId: data.projectId,
      vehicleId: data.vehicleId,
      userId,
      status: data.status,
    });
  });

const deleteItemFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { vehicleId: string; projectId: string; itemId: string }) => data,
  )
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    await deleteProjectItem({
      id: data.itemId,
      projectId: data.projectId,
      vehicleId: data.vehicleId,
      userId,
    });
  });

export const Route = createFileRoute(
  "/_authed/vehicles/$vehicleId/projects/$projectId",
)({
  component: ProjectDetail,
  loader: async ({ params }) => {
    const project =
      (await loadProjectFn({
        data: { vehicleId: params.vehicleId, projectId: params.projectId },
      })) ?? null;
    if (!project) throw notFound();
    return project;
  },
});

const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  idea: "💡 Idea",
  planned: "📋 Planned",
  in_progress: "🔧 In progress",
  done: "✅ Done",
};

const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  proposed: "proposed",
  ordered: "ordered",
  received: "received",
  installed: "installed",
};

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function AddItemForm({
  vehicleId,
  projectId,
}: {
  vehicleId: string;
  projectId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("vehicleId", vehicleId);
    formData.set("projectId", projectId);
    try {
      const result = await addItemFn({ data: formData });
      if (result && "error" in result) {
        setError(result.error ?? "Failed to add item");
      } else {
        form.reset();
        await router.invalidate();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {error ? <p className={errorBox}>{error}</p> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_4rem_auto]">
        <label className={label}>
          Part / item
          <input
            name="name"
            required
            placeholder="Hawk DTC-30 front pads"
            className={input}
          />
        </label>
        <label className={label}>
          Price each
          <input
            name="price"
            type="number"
            step="0.01"
            inputMode="decimal"
            placeholder="189.00"
            className={input}
          />
        </label>
        <label className={label}>
          Qty
          <input
            name="quantity"
            type="number"
            inputMode="numeric"
            defaultValue={1}
            min={1}
            className={input}
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className={`${btnSecondary} self-end`}
        >
          Add
        </button>
      </div>
      <label className={label}>
        Link (store page, forum thread…)
        <input
          name="url"
          type="url"
          placeholder="https://…"
          className={input}
        />
      </label>
    </form>
  );
}

function ProjectDetail() {
  const router = useRouter();
  const navigate = useNavigate();
  const { vehicleId, projectId } = useParams({
    from: "/_authed/vehicles/$vehicleId/projects/$projectId",
  });
  const project = Route.useLoaderData();

  const estimated = project.items.reduce(
    (sum, i) => sum + (i.price ?? 0) * i.quantity,
    0,
  );
  const committed = project.items
    .filter((i) => i.status !== "proposed")
    .reduce((sum, i) => sum + (i.price ?? 0) * i.quantity, 0);
  const installedCount = project.items.filter(
    (i) => i.status === "installed",
  ).length;

  async function onDelete() {
    if (!window.confirm(`Delete project "${project.title}" and its items?`))
      return;
    await deleteProjectFn({ data: { vehicleId, projectId } });
    await router.invalidate();
    navigate({ to: "/vehicles/$vehicleId/projects", params: { vehicleId } });
  }

  return (
    <section className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-ink">{project.title}</h2>
          <select
            value={project.status}
            aria-label="Project status"
            className="min-h-11 rounded-xl border border-line bg-card px-3 text-sm font-semibold text-ink"
            onChange={async (e) => {
              await setProjectStatusFn({
                data: {
                  vehicleId,
                  projectId,
                  status: e.target.value as ProjectStatus,
                },
              });
              await router.invalidate();
            }}
          >
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        {project.description ? (
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">
            {project.description}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
          {project.targetDate ? (
            <span
              className={`rounded-full px-2.5 py-1 ${
                daysUntil(project.targetDate) < 0
                  ? "bg-danger/15 text-danger"
                  : daysUntil(project.targetDate) <= 14
                    ? "bg-warn/15 text-warn"
                    : "bg-sunken text-ink-muted"
              }`}
            >
              🏁{" "}
              {daysUntil(project.targetDate) >= 0
                ? `${daysUntil(project.targetDate)} days to ${project.targetDate.toLocaleDateString()}`
                : `target was ${project.targetDate.toLocaleDateString()}`}
            </span>
          ) : null}
          <span className="rounded-full bg-sunken px-2.5 py-1 text-ink-muted">
            ~${Math.round(estimated).toLocaleString()} estimated
          </span>
          <span className="rounded-full bg-sunken px-2.5 py-1 text-ink-muted">
            ${Math.round(committed).toLocaleString()} committed
          </span>
          <span className="rounded-full bg-sunken px-2.5 py-1 text-ink-muted">
            {installedCount}/{project.items.length} installed
          </span>
        </div>
      </div>

      <div className={`${card} p-5`}>
        <h3 className="font-bold text-ink">Parts & items</h3>
        {project.items.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">
            No items yet — add parts below as you spec the build.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {project.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-line underline-offset-2 hover:decoration-accent"
                      >
                        {item.name}
                      </a>
                    ) : (
                      item.name
                    )}
                    {item.quantity > 1 ? ` ×${item.quantity}` : ""}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {item.price != null
                      ? `$${(item.price * item.quantity).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                      : "no price yet"}
                  </p>
                </div>
                <select
                  value={item.status}
                  aria-label={`${item.name} status`}
                  className="min-h-11 rounded-xl border border-line bg-card px-2 text-sm font-semibold text-ink"
                  onChange={async (e) => {
                    await setItemStatusFn({
                      data: {
                        vehicleId,
                        projectId,
                        itemId: item.id,
                        status: e.target.value as ItemStatus,
                      },
                    });
                    await router.invalidate();
                  }}
                >
                  {ITEM_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {ITEM_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label={`Delete ${item.name}`}
                  className="min-h-11 px-2 text-sm text-danger hover:underline"
                  onClick={async () => {
                    await deleteItemFn({
                      data: { vehicleId, projectId, itemId: item.id },
                    });
                    await router.invalidate();
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 border-t border-line pt-4">
          <AddItemForm vehicleId={vehicleId} projectId={projectId} />
        </div>
      </div>

      <div className="text-right">
        <button
          type="button"
          onClick={onDelete}
          className="text-sm text-danger hover:underline"
        >
          Delete project
        </button>
      </div>
    </section>
  );
}
