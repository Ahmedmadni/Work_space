import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/workspace/$workspaceId/project/$projectId/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/project/$projectId",
      params: { projectId: params.projectId },
    });
  },
});
