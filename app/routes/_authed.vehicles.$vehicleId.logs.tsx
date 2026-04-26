import { createFileRoute, Outlet } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { requireAuth } from "~/auth/session.server";
import { getLogListItems } from "~/models/log.server";
import { getLogFileCountsByLogIds } from "~/models/log-file.server";

const listLogsFn = createServerFn({ method: "GET" })
  .inputValidator((vehicleId: string) => vehicleId)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    const logList = await getLogListItems({ userId, vehicleId: data });
    const logIds = logList.map((l) => l.id);
    const fileCounts = await getLogFileCountsByLogIds({ logIds, userId });
    return { logs: logList, fileCounts };
  });

export const Route = createFileRoute("/_authed/vehicles/$vehicleId/logs")({
  component: LogsLayout,
  loader: async ({ params }) =>
    (await listLogsFn({ data: params.vehicleId })) ?? {
      logs: [],
      fileCounts: {},
    },
});

function LogsLayout() {
  return <Outlet />;
}
