import { createFileRoute } from "@tanstack/react-router";
import { eq, inArray } from "drizzle-orm";

import { useAppSession } from "~/auth/session.server";
import { getDb } from "~/db/client";
import {
  logs,
  logsToParts,
  logsToTags,
  mechanics,
  parts,
  tags,
  users,
  vehicles,
} from "~/db/schema";

export const Route = createFileRoute("/account/export")({
  server: {
    handlers: {
      GET: async () => {
        const session = await useAppSession();
        const userId = session.data.userId;
        if (!userId) return new Response("Unauthorized", { status: 401 });

        const db = getDb();
        const [user] = await db
          .select({
            id: users.id,
            email: users.email,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
          })
          .from(users)
          .where(eq(users.id, userId));

        if (!user) return new Response("Not found", { status: 404 });

        const [userVehicles, userLogs] = await Promise.all([
          db.select().from(vehicles).where(eq(vehicles.userId, userId)),
          db.select().from(logs).where(eq(logs.userId, userId)),
        ]);

        const logIds = userLogs.map((l) => l.id);
        const mechanicIds = Array.from(
          new Set(
            userLogs
              .map((l) => l.mechanicId)
              .filter((id): id is string => !!id),
          ),
        );

        const [tagJoins, partJoins, mechanicRows] = await Promise.all([
          logIds.length
            ? db
                .select()
                .from(logsToTags)
                .where(inArray(logsToTags.logId, logIds))
            : Promise.resolve([]),
          logIds.length
            ? db
                .select()
                .from(logsToParts)
                .where(inArray(logsToParts.logId, logIds))
            : Promise.resolve([]),
          mechanicIds.length
            ? db
                .select()
                .from(mechanics)
                .where(inArray(mechanics.id, mechanicIds))
            : Promise.resolve([]),
        ]);

        const tagIds = Array.from(new Set(tagJoins.map((j) => j.tagId)));
        const partIds = Array.from(new Set(partJoins.map((j) => j.partId)));

        const [tagRows, partRows] = await Promise.all([
          tagIds.length
            ? db.select().from(tags).where(inArray(tags.id, tagIds))
            : Promise.resolve([]),
          partIds.length
            ? db.select().from(parts).where(inArray(parts.id, partIds))
            : Promise.resolve([]),
        ]);

        const body = {
          schemaVersion: 1 as const,
          exportedAt: new Date().toISOString(),
          user,
          vehicles: userVehicles.map((v) => ({
            ...v,
            avatarUrl: v.avatarPath ? `/files/${v.avatarPath}` : null,
          })),
          logs: userLogs,
          mechanics: mechanicRows,
          tags: tagRows,
          parts: partRows,
          logsToTags: tagJoins,
          logsToParts: partJoins,
        };

        return Response.json(body, {
          headers: {
            "content-disposition": `attachment; filename="vehicle-work-log-${user.email}.json"`,
          },
        });
      },
    },
  },
});
