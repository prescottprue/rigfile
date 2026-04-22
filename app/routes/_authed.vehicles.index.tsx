import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { useAppSession } from "~/auth/session.server";
import { getVehicleListItems } from "~/models/vehicle.server";

const listVehiclesFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useAppSession();
  const userId = session.data.userId;
  if (!userId) return [];
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Your vehicles</h1>
        <Link
          to="/vehicles/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          Add vehicle
        </Link>
      </div>
      {vehicles.length === 0 ? (
        <p className="mt-8 text-slate-600">
          No vehicles yet. Add one to start logging maintenance.
        </p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((v) => (
            <li
              key={v.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <Link
                to="/vehicles/$vehicleId"
                params={{ vehicleId: v.id }}
                className="block"
              >
                <div className="text-lg font-medium text-slate-900">
                  {v.year} {v.make} {v.model}
                  {v.trim ? ` ${v.trim}` : ""}
                </div>
                {v.name ? (
                  <div className="text-sm text-slate-500">“{v.name}”</div>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
