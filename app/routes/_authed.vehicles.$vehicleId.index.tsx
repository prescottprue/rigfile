import {
  createFileRoute,
  getRouteApi,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { requireAuth } from "~/auth/session.server";
import { formatDateOnly } from "~/components/format";
import { statusBadgeClass, statusLabel } from "~/components/reminder-display";
import {
  btnPrimary,
  btnSecondary,
  card,
  errorBox,
  input,
} from "~/components/ui";
import { getLogListItems } from "~/models/log.server";
import {
  inviteToCrew,
  listCrew,
  removeCrewMember,
  revokeInvite,
} from "~/models/member.server";
import { getLatestOdometer } from "~/models/odometer.server";
import { listProjects } from "~/models/project.server";
import { listReminders } from "~/models/reminder.server";
import { deleteVehicle } from "~/models/vehicle.server";

const parentApi = getRouteApi("/_authed/vehicles/$vehicleId");

const loadDashboardFn = createServerFn({ method: "GET" })
  .inputValidator((vehicleId: string) => vehicleId)
  .handler(async ({ data: vehicleId }) => {
    const userId = await requireAuth();
    const [reminders, recentLogs, projects, crew, odometer] = await Promise.all(
      [
        listReminders({ vehicleId, userId }),
        getLogListItems({ vehicleId, userId, limit: 4 }),
        listProjects({ vehicleId, userId }),
        listCrew({ vehicleId, userId }),
        getLatestOdometer({ vehicleId }),
      ],
    );
    return {
      nextUp: reminders.filter((r) => r.status !== "done").slice(0, 3),
      recentLogs,
      activeProjects: projects.filter((p) => p.status !== "done").slice(0, 3),
      crew,
      odometer,
      userId,
    };
  });

const inviteFn = createServerFn({ method: "POST" })
  .inputValidator((data: { vehicleId: string; email: string }) => data)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    try {
      return await inviteToCrew({ ...data, userId });
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Invite failed" };
    }
  });

const removeMemberFn = createServerFn({ method: "POST" })
  .inputValidator((data: { vehicleId: string; memberUserId: string }) => data)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    await removeCrewMember({ ...data, userId });
  });

const revokeInviteFn = createServerFn({ method: "POST" })
  .inputValidator((data: { vehicleId: string; inviteId: string }) => data)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    await revokeInvite({ ...data, userId });
  });

const deleteVehicleFn = createServerFn({ method: "POST" })
  .inputValidator((vehicleId: string) => vehicleId)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    await deleteVehicle({ id: data, userId });
  });

export const Route = createFileRoute("/_authed/vehicles/$vehicleId/")({
  component: VehicleDashboard,
  loader: async ({ params }) => loadDashboardFn({ data: params.vehicleId }),
});

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={`${card} p-5`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold text-ink">{title}</h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function CrewCard({
  vehicleId,
  isOwner,
  userId,
  crew,
}: {
  vehicleId: string;
  isOwner: boolean;
  userId: string;
  crew: Awaited<ReturnType<typeof listCrew>>;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setPending(true);
    try {
      const result = await inviteFn({ data: { vehicleId, email } });
      if ("error" in result) {
        setError(result.error ?? "Invite failed");
      } else if (result.status === "added") {
        setMessage(`${result.email} added to the crew`);
        setEmail("");
      } else if (result.status === "invited") {
        setMessage(
          `Invite saved — ${result.email} joins the crew when they sign up`,
        );
        setEmail("");
      } else {
        setMessage(`${result.email} is already on the crew`);
      }
      await router.invalidate();
    } finally {
      setPending(false);
    }
  }

  return (
    <SectionCard title="Crew">
      <ul className="space-y-2">
        {crew.members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3">
            {m.avatarPath ? (
              <img
                src={`/files/${m.avatarPath}`}
                alt=""
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sunken text-sm font-medium text-ink">
                {(m.displayName ?? m.email)[0]?.toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">
                {m.displayName ?? m.email}
                {m.userId === userId ? " (you)" : ""}
              </p>
              <p className="text-xs text-ink-muted">{m.role}</p>
            </div>
            {isOwner && m.role !== "owner" ? (
              <button
                type="button"
                className="text-xs font-semibold text-danger hover:underline"
                onClick={async () => {
                  if (!window.confirm(`Remove ${m.displayName ?? m.email}?`))
                    return;
                  await removeMemberFn({
                    data: { vehicleId, memberUserId: m.userId },
                  });
                  await router.invalidate();
                }}
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
        {crew.pendingInvites.map((invite) => (
          <li key={invite.id} className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-line text-sm text-ink-muted">
              ?
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">{invite.email}</p>
              <p className="text-xs text-ink-muted">
                invited — not signed up yet
              </p>
            </div>
            {isOwner ? (
              <button
                type="button"
                className="text-xs font-semibold text-danger hover:underline"
                onClick={async () => {
                  await revokeInviteFn({
                    data: { vehicleId, inviteId: invite.id },
                  });
                  await router.invalidate();
                }}
              >
                Revoke
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {isOwner ? (
        <form onSubmit={onInvite} className="mt-4">
          <div className="flex gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="steph@example.com"
              aria-label="Email to invite"
              className={`${input} mt-0 flex-1`}
            />
            <button type="submit" disabled={pending} className={btnSecondary}>
              Invite
            </button>
          </div>
          {message ? <p className="mt-2 text-sm text-ok">{message}</p> : null}
          {error ? <p className={`${errorBox} mt-2`}>{error}</p> : null}
        </form>
      ) : null}
    </SectionCard>
  );
}

function VehicleDashboard() {
  const router = useRouter();
  const navigate = useNavigate();
  const v = parentApi.useLoaderData();
  const data = Route.useLoaderData();
  const isOwner = v.role === "owner";

  async function onDelete() {
    if (
      !window.confirm(
        `Delete ${v.year} ${v.make} ${v.model}? This removes all logs, reminders, and projects.`,
      )
    )
      return;
    await deleteVehicleFn({ data: v.id });
    await router.invalidate();
    navigate({ to: "/vehicles" });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/vehicles/$vehicleId/logs/new"
          params={{ vehicleId: v.id }}
          className={`${btnPrimary} flex-1 py-4 text-lg sm:flex-none sm:px-8`}
        >
          🔧 Log work
        </Link>
        <Link
          to="/vehicles/$vehicleId/scan"
          params={{ vehicleId: v.id }}
          className={`${btnSecondary} flex-1 py-4 text-lg sm:flex-none sm:px-6`}
        >
          📷 Scan receipt
        </Link>
        <Link
          to="/vehicles/$vehicleId/odometer"
          params={{ vehicleId: v.id }}
          className={`${card} flex items-center gap-3 px-5 py-3 transition-colors hover:bg-sunken`}
        >
          <span className="text-xs font-bold uppercase tracking-wide text-ink-muted">
            Last odometer
          </span>
          <span className="flex flex-col">
            <span className="text-xl font-bold tabular-nums text-ink">
              {data.odometer != null
                ? `${Math.round(data.odometer.odometer).toLocaleString()} mi`
                : "—"}
            </span>
            {data.odometer != null ? (
              <span className="text-xs text-ink-muted">
                {formatDateOnly(data.odometer.date)}
              </span>
            ) : null}
          </span>
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Next up"
          action={
            <Link
              to="/vehicles/$vehicleId/reminders"
              params={{ vehicleId: v.id }}
              className="text-sm font-semibold text-accent hover:underline"
            >
              All reminders →
            </Link>
          }
        >
          {data.nextUp.length === 0 ? (
            <p className="text-sm text-ink-muted">
              Nothing scheduled. Add reminders for oil, brakes, tires — they
              track both date and mileage.
            </p>
          ) : (
            <ul className="space-y-3">
              {data.nextUp.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="min-w-0 truncate font-medium text-ink">
                    {r.title}
                  </span>
                  <span className={statusBadgeClass(r.status)}>
                    {statusLabel(r)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Builds & plans"
          action={
            <Link
              to="/vehicles/$vehicleId/projects"
              params={{ vehicleId: v.id }}
              className="text-sm font-semibold text-accent hover:underline"
            >
              All projects →
            </Link>
          }
        >
          {data.activeProjects.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No active projects. Plan the next build — parts, prices, and a
              countdown to event day.
            </p>
          ) : (
            <ul className="space-y-3">
              {data.activeProjects.map((p) => (
                <li key={p.id}>
                  <Link
                    to="/vehicles/$vehicleId/projects/$projectId"
                    params={{ vehicleId: v.id, projectId: p.id }}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="min-w-0 truncate font-medium text-ink">
                      {p.title}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-ink-muted">
                      {p.targetDate
                        ? daysUntil(p.targetDate) >= 0
                          ? `${daysUntil(p.targetDate)}d out`
                          : "past due"
                        : `${p.itemCount} items`}
                      {p.estimatedTotal > 0
                        ? ` · $${Math.round(p.estimatedTotal).toLocaleString()}`
                        : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Recent work"
          action={
            <Link
              to="/vehicles/$vehicleId/logs"
              params={{ vehicleId: v.id }}
              className="text-sm font-semibold text-accent hover:underline"
            >
              All logs →
            </Link>
          }
        >
          {data.recentLogs.length === 0 ? (
            <p className="text-sm text-ink-muted">No work logged yet.</p>
          ) : (
            <ul className="space-y-3">
              {data.recentLogs.map((log) => (
                <li key={log.id}>
                  <Link
                    to="/vehicles/$vehicleId/logs/$logId"
                    params={{ vehicleId: v.id, logId: log.id }}
                    className="block"
                  >
                    <span className="font-medium text-ink">{log.title}</span>
                    <span className="mt-0.5 block text-xs text-ink-muted">
                      {formatDateOnly(log.servicedAt)}
                      {log.odometer != null
                        ? ` · ${Math.round(log.odometer).toLocaleString()} mi`
                        : ""}
                      {log.authorName ? ` · ${log.authorName}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <CrewCard
          vehicleId={v.id}
          isOwner={isOwner}
          userId={data.userId}
          crew={data.crew}
        />
      </div>

      {isOwner ? (
        <div className="flex items-center justify-end gap-6 pt-4">
          <Link
            to="/vehicles/$vehicleId/edit"
            params={{ vehicleId: v.id }}
            className="text-sm font-semibold text-accent hover:underline"
          >
            Edit vehicle
          </Link>
          <button
            type="button"
            onClick={onDelete}
            className="text-sm text-danger hover:underline"
          >
            Delete vehicle
          </button>
        </div>
      ) : null}
    </div>
  );
}
