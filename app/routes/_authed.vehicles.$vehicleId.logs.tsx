import { createFileRoute, Outlet } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { useAppSession } from "~/auth/session.server";
import { getLogListItems } from "~/models/log.server";

const listLogsFn = createServerFn({ method: "GET" })
  .inputValidator((vehicleId: string) => vehicleId)
  .handler(async ({ data }) => {
    const session = await useAppSession();
    const userId = session.data.userId;
    if (!userId) return [];
    return getLogListItems({ userId, vehicleId: data });
  });

export const Route = createFileRoute("/_authed/vehicles/$vehicleId/logs")({
  component: LogsLayout,
  loader: ({ params }) => listLogsFn({ data: params.vehicleId }),
});

function LogsLayout() {
  return <Outlet />;
}
