import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/workspace/$workspaceId/")({
  beforeLoad: () => {
    throw redirect({ to: "/projects" });
  },
});
