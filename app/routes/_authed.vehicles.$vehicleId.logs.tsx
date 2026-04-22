import { createFileRoute, Outlet } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { requireAuth } from "~/auth/session.server";
import { getLogListItems } from "~/models/log.server";

const listLogsFn = createServerFn({ method: "GET" })
  .inputValidator((vehicleId: string) => vehicleId)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    return getLogListItems({ userId, vehicleId: data });
  });

export const Route = createFileRoute("/_authed/vehicles/$vehicleId/logs")({
  component: LogsLayout,
  loader: async ({ params }) =>
    (await listLogsFn({ data: params.vehicleId })) ?? [],
});

function LogsLayout() {
  return <Outlet />;
}
