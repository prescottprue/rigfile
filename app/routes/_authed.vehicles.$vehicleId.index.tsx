import {
  createFileRoute,
  getRouteApi,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { requireAuth } from "~/auth/session.server";
import { deleteVehicle } from "~/models/vehicle.server";

const parentApi = getRouteApi("/_authed/vehicles/$vehicleId");

const deleteVehicleFn = createServerFn({ method: "POST" })
  .inputValidator((vehicleId: string) => vehicleId)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    await deleteVehicle({ id: data, userId });
  });

export const Route = createFileRoute("/_authed/vehicles/$vehicleId/")({
  component: VehicleDetail,
});

function VehicleDetail() {
  const navigate = useNavigate();
  const v = parentApi.useLoaderData();

  async function onDelete() {
    if (!window.confirm(`Delete ${v.year} ${v.make} ${v.model}?`)) return;
    await deleteVehicleFn({ data: v.id });
    navigate({ to: "/vehicles" });
  }

  return (
    <section>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {v.year} {v.make} {v.model}
            {v.trim ? ` ${v.trim}` : ""}
          </h1>
          {v.name ? <p className="mt-1 text-slate-600">“{v.name}”</p> : null}
          {v.avatarPath ? (
            <img
              src={`/files/${v.avatarPath}`}
              alt={`${v.make} ${v.model}`}
              className="mt-4 h-48 w-auto rounded-lg object-cover"
            />
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="text-sm text-red-600 hover:underline"
        >
          Delete vehicle
        </button>
      </div>
      <div className="mt-8">
        <Link
          to="/vehicles/$vehicleId/logs"
          params={{ vehicleId: v.id }}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          View service logs
        </Link>
      </div>
    </section>
  );
}
