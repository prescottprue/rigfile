import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { useAppSession } from "~/auth/session.server";
import { getVehicle } from "~/models/vehicle.server";

const loadVehicleFn = createServerFn({ method: "GET" })
  .inputValidator((vehicleId: string) => vehicleId)
  .handler(async ({ data }) => {
    const session = await useAppSession();
    const userId = session.data.userId;
    if (!userId) return null;
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

function VehicleLayout() {
  return <Outlet />;
}
