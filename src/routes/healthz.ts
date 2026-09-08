import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/healthz")({
  server: {
    handlers: {
      GET: () =>
        new Response("ok\n", {
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
    },
  },
});
