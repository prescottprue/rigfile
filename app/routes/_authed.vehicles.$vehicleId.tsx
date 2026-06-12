import {
  createFileRoute,
  Link,
  notFound,
  Outlet,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { requireAuth } from "~/auth/session.server";
import { getVehicle } from "~/models/vehicle.server";

const loadVehicleFn = createServerFn({ method: "GET" })
  .inputValidator((vehicleId: string) => vehicleId)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    return getVehicle({ id: data, userId });
  });

export const Route = createFileRoute("/_authed/vehicles/$vehicleId")({
  component: VehicleLayout,
  loader: async ({ params }) => {
    const vehicle = (await loadVehicleFn({ data: params.vehicleId })) ?? null;
    if (!vehicle) throw notFound();
    return vehicle;
  },
});

const tabs = [
  { to: "/vehicles/$vehicleId", label: "Dashboard", exact: true },
  { to: "/vehicles/$vehicleId/logs", label: "Logs", exact: false },
  { to: "/vehicles/$vehicleId/reminders", label: "Reminders", exact: false },
  { to: "/vehicles/$vehicleId/projects", label: "Projects", exact: false },
] as const;

function VehicleLayout() {
  const v = Route.useLoaderData();

  return (
    <div>
      <div className="flex items-center gap-4">
        {v.avatarPath ? (
          <img
            src={`/files/${v.avatarPath}`}
            alt=""
            className="h-14 w-14 rounded-2xl object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sunken text-2xl"
          >
            🚗
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-ink sm:text-2xl">
            {v.name ?? `${v.year} ${v.make} ${v.model}`}
          </h1>
          <p className="truncate text-sm text-ink-muted">
            {v.name ? `${v.year} ${v.make} ${v.model}` : null}
            {v.name && v.trim ? ` ${v.trim}` : !v.name && v.trim ? v.trim : ""}
            {v.role === "member" ? " · shared with you" : ""}
          </p>
          {v.vin ? (
            <p className="truncate font-mono text-xs text-ink-muted">
              VIN {v.vin}
            </p>
          ) : null}
        </div>
      </div>
      <nav className="-mx-4 mt-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            params={{ vehicleId: v.id }}
            activeOptions={{ exact: tab.exact }}
            activeProps={{
              className: "border-accent text-ink",
            }}
            inactiveProps={{
              className: "border-transparent text-ink-muted hover:text-ink",
            }}
            className="whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  );
}
