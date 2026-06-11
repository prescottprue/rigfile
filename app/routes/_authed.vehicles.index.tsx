import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { requireAuth } from "~/auth/session.server";
import { btnPrimary, card } from "~/components/ui";
import { getVehicleListItems } from "~/models/vehicle.server";

const listVehiclesFn = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireAuth();
  return getVehicleListItems({ userId });
});

export const Route = createFileRoute("/_authed/vehicles/")({
  component: VehicleList,
  loader: async () => (await listVehiclesFn()) ?? [],
});

function VehicleList() {
  const vehicles = Route.useLoaderData();
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">The garage</h1>
        <Link to="/vehicles/new" className={btnPrimary}>
          + Add vehicle
        </Link>
      </div>
      {vehicles.length === 0 ? (
        <div className={`${card} mt-8 p-8 text-center`}>
          <p className="text-4xl" aria-hidden>
            🏎️
          </p>
          <p className="mt-3 font-semibold text-ink">The garage is empty</p>
          <p className="mt-1 text-sm text-ink-muted">
            Add a vehicle to start logging work, setting service reminders, and
            planning builds.
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {vehicles.map((v) => (
            <li key={v.id}>
              <Link
                to="/vehicles/$vehicleId"
                params={{ vehicleId: v.id }}
                className={`${card} block p-5 transition-shadow hover:shadow-md`}
              >
                <div className="flex items-start gap-4">
                  {v.avatarPath ? (
                    <img
                      src={`/files/${v.avatarPath}`}
                      alt=""
                      className="h-16 w-16 rounded-xl object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="flex h-16 w-16 items-center justify-center rounded-xl bg-sunken text-3xl"
                    >
                      🚗
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-lg font-bold text-ink">
                      {v.name ?? `${v.year} ${v.make} ${v.model}`}
                    </div>
                    <div className="truncate text-sm text-ink-muted">
                      {v.name
                        ? `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ""}`
                        : (v.trim ?? "")}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
                      {v.latestOdometer != null ? (
                        <span className="rounded-full bg-sunken px-2.5 py-1 text-ink-muted">
                          {Math.round(v.latestOdometer).toLocaleString()} mi
                        </span>
                      ) : null}
                      {v.overdueCount > 0 ? (
                        <span className="rounded-full bg-danger/15 px-2.5 py-1 text-danger">
                          {v.overdueCount} overdue
                        </span>
                      ) : null}
                      {v.dueSoonCount > 0 ? (
                        <span className="rounded-full bg-warn/15 px-2.5 py-1 text-warn">
                          {v.dueSoonCount} due soon
                        </span>
                      ) : null}
                      {v.overdueCount === 0 && v.dueSoonCount === 0 ? (
                        <span className="rounded-full bg-ok/15 px-2.5 py-1 text-ok">
                          all good
                        </span>
                      ) : null}
                      {v.role === "member" ? (
                        <span className="rounded-full bg-sunken px-2.5 py-1 text-ink-muted">
                          shared
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
