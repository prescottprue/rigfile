import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/healthcheck")({
  server: {
    handlers: {
      GET: () =>
        new Response("ok", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
    },
  },
});
