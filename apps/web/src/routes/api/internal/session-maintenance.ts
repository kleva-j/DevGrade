import { createFileRoute } from "@tanstack/react-router";

import { sessionMaintenanceHandler } from "@/server/sessionMaintenanceHandler";

export const Route = createFileRoute("/api/internal/session-maintenance")({
  server: {
    handlers: {
      GET: ({ request }) => sessionMaintenanceHandler(request),
      ANY: ({ request }) => sessionMaintenanceHandler(request),
    },
  },
});
