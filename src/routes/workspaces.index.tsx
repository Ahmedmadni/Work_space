import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/workspaces/")({
  beforeLoad: () => {
    throw redirect({ to: "/projects" });
  },
});
