import { createFileRoute } from "@tanstack/react-router";

import { getStorage } from "~/storage.server";

export const Route = createFileRoute("/files/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const key = params._splat;
        if (!key) return new Response("Not found", { status: 404 });
        const file = await getStorage().read(key);
        if (!file) return new Response("Not found", { status: 404 });
        return new Response(file.body as BodyInit, {
          headers: {
            "content-type": file.contentType,
            "cache-control": "private, max-age=300",
          },
        });
      },
    },
  },
});
