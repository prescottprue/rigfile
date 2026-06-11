import {
  createFileRoute,
  notFound,
  useNavigate,
  useParams,
  useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { requireAuth } from "~/auth/session.server";
import { card } from "~/components/ui";
import { listLogAttachments } from "~/models/attachment.server";
import { deleteLog, getLog } from "~/models/log.server";

const loadLogFn = createServerFn({ method: "GET" })
  .inputValidator((input: { vehicleId: string; logId: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    const log = await getLog({
      id: data.logId,
      userId,
      vehicleId: data.vehicleId,
    });
    if (!log) return null;
    const attachments = await listLogAttachments({
      logId: data.logId,
      vehicleId: data.vehicleId,
      userId,
    });
    return { ...log, attachments };
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
  const router = useRouter();
  const navigate = useNavigate();
  const log = Route.useLoaderData();
  const { vehicleId, logId } = useParams({
    from: "/_authed/vehicles/$vehicleId/logs/$logId",
  });

  async function onDelete() {
    if (!window.confirm(`Delete "${log.title}"?`)) return;
    await deleteLogFn({ data: { vehicleId, logId } });
    await router.invalidate();
    navigate({
      to: "/vehicles/$vehicleId/logs",
      params: { vehicleId },
    });
  }

  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink">{log.title}</h2>
          <div className="mt-1 text-sm text-ink-muted">
            {log.servicedAt.toLocaleDateString()}
            {log.type ? ` · ${log.type}` : ""}
            {log.authorName ? ` · logged by ${log.authorName}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 text-sm text-danger hover:underline"
        >
          Delete
        </button>
      </div>
      {log.notes ? (
        <p className="mt-4 whitespace-pre-wrap text-ink">{log.notes}</p>
      ) : null}
      <dl
        className={`${card} mt-6 grid grid-cols-2 gap-4 p-5 text-sm sm:grid-cols-3`}
      >
        <div>
          <dt className="text-ink-muted">Odometer</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-ink">
            {log.odometer != null
              ? `${Math.round(log.odometer).toLocaleString()} mi`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Cost</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-ink">
            {log.cost != null ? `$${log.cost.toFixed(2)}` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Who did it</dt>
          <dd className="mt-0.5 font-semibold text-ink">
            {log.selfService ? "DIY 🔧" : "Shop"}
          </dd>
        </div>
      </dl>
      {log.attachments.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-ink-muted">
            Scans & attachments
          </h3>
          <ul className="mt-2 flex flex-wrap gap-3">
            {log.attachments.map((att) => {
              const href = `/files/${att.path}`;
              const isImage = att.contentType.startsWith("image/");
              return (
                <li key={att.id}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className={`${card} block overflow-hidden transition-colors hover:bg-sunken`}
                    title={att.originalName ?? "Attachment"}
                  >
                    {isImage ? (
                      <img
                        src={href}
                        alt={att.originalName ?? "Scan"}
                        className="h-32 w-32 object-cover"
                      />
                    ) : (
                      <span className="flex h-32 w-32 items-center justify-center text-4xl">
                        📄
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
