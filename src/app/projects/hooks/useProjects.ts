import { useSuspenseQuery } from "@tanstack/react-query";
import { honoClient } from "../../../lib/api/client";
import type { Project } from "../../../server/service/types";

type ProjectResponse = {
  id: string;
  workspacePath: string;
  meta: {
    workspaceName: string;
    workspacePath: string;
    isStandalone: boolean;
    lastSessionAt: string | null;
    sessionCount: number;
  };
};

export const projetsQueryConfig = {
  queryKey: ["projects"],
  queryFn: async () => {
    const response = await honoClient.api.projects.$get();
    const { projects } = (await response.json()) as {
      projects: ProjectResponse[];
    };

    return projects.map((project) => {
      return {
        ...project,
        meta: {
          ...project.meta,
          lastSessionAt:
            project.meta.lastSessionAt !== null
              ? new Date(project.meta.lastSessionAt)
              : null,
        },
      } satisfies Project;
    });
  },
} as const;

export const useProjects = () => {
  return useSuspenseQuery({
    queryKey: projetsQueryConfig.queryKey,
    queryFn: projetsQueryConfig.queryFn,
  });
};
