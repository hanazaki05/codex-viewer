import { useMutation, useQueryClient } from "@tanstack/react-query";
import { projetsQueryConfig } from "../../../../hooks/useProjects";
import { projectQueryConfig } from "../../../hooks/useProject";

type DeleteSessionParams = {
  projectId: string;
  sessionId: string;
  deleteProject?: boolean;
};

const getDeleteErrorMessage = async (response: Response) => {
  let fallbackMessage = "Failed to delete session";

  if (response.status === 404) {
    fallbackMessage = "Session not found";
  } else if (response.status === 409) {
    fallbackMessage =
      "Cannot delete an active session. Stop the task or wait until it finishes.";
  } else if (response.status === 400) {
    fallbackMessage = "Invalid session request";
  }

  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim().length > 0) {
      return body.error;
    }
  } catch {
    // no-op: fallback message is enough
  }

  return fallbackMessage;
};

export const useDeleteSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      sessionId,
      deleteProject = false,
    }: DeleteSessionParams) => {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(
          sessionId,
        )}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ deleteProject }),
        },
      );

      if (!response.ok) {
        throw new Error(await getDeleteErrorMessage(response));
      }

      return response.json() as Promise<{
        success: true;
        deletedProject: boolean;
      }>;
    },
    onSuccess: async (_, { projectId, sessionId }) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: projectQueryConfig(projectId).queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: projetsQueryConfig.queryKey,
        }),
        queryClient.invalidateQueries({ queryKey: ["sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["sessions", sessionId] }),
      ]);
    },
  });
};
