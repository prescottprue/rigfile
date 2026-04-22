import {
  createFileRoute,
  notFound,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { requireAuth } from "~/auth/session.server";
import { deleteLog, getLog } from "~/models/log.server";

const loadLogFn = createServerFn({ method: "GET" })
  .inputValidator((input: { vehicleId: string; logId: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    return getLog({ id: data.logId, userId, vehicleId: data.vehicleId });
  });

const deleteLogFn = createServerFn({ method: "POST" })
  .inputValidator((input: { vehicleId: string; logId: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    await deleteLog({ id: data.logId, userId, vehicleId: data.vehicleId });
    return { vehicleId: data.vehicleId };
  });

export const Route = createFileRoute(
  "/_authed/vehicles/$vehicleId/logs/$logId",
)({
  component: LogDetail,
  loader: async ({ params }) => {
    const log = (await loadLogFn({ data: params })) ?? null;
    if (!log) throw notFound();
    return log;
  },
});

function LogDetail() {
  const navigate = useNavigate();
  const log = Route.useLoaderData();
  const { vehicleId, logId } = useParams({
    from: "/_authed/vehicles/$vehicleId/logs/$logId",
  });

  async function onDelete() {
    if (!window.confirm(`Delete "${log.title}"?`)) return;
    await deleteLogFn({ data: { vehicleId, logId } });
    navigate({
      to: "/vehicles/$vehicleId/logs",
      params: { vehicleId },
    });
  }

  return (
    <section>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{log.title}</h1>
          <div className="mt-1 text-sm text-slate-500">
            {log.servicedAt.toLocaleDateString()}
            {log.type ? ` · ${log.type}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="text-sm text-red-600 hover:underline"
        >
          Delete
        </button>
      </div>
      {log.notes ? (
        <p className="mt-4 whitespace-pre-wrap text-slate-700">{log.notes}</p>
      ) : null}
      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
        {log.odometer != null ? (
          <div>
            <dt className="text-slate-500">Odometer</dt>
            <dd className="text-slate-900">{log.odometer.toLocaleString()}</dd>
          </div>
        ) : null}
        {log.cost != null ? (
          <div>
            <dt className="text-slate-500">Cost</dt>
            <dd className="text-slate-900">${log.cost.toFixed(2)}</dd>
          </div>
        ) : null}
        {log.selfService ? (
          <div>
            <dt className="text-slate-500">Self-service</dt>
            <dd className="text-slate-900">Yes</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
