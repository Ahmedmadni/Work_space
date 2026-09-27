import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/workspace/$workspaceId/project/$projectId/board/$boardId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/project/$projectId/board/$boardId",
      params: { projectId: params.projectId, boardId: params.boardId },
    });
  },
});
