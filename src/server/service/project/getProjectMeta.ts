import {
  type CodexSessionRecord,
  getWorkspaceName,
  listSessionsForWorkspace,
} from "../codex/sessionFiles";
import type { ProjectMeta } from "../types";
import { isStandaloneProjectPath } from "./standalone";

export const getProjectMetaFromSessionRecords = (
  workspacePath: string,
  sessions: CodexSessionRecord[],
): ProjectMeta => {
  const lastSessionAt = sessions.reduce<Date | null>((acc, record) => {
    if (!record.lastModifiedAt) return acc;
    if (!acc || record.lastModifiedAt > acc) {
      return record.lastModifiedAt;
    }
    return acc;
  }, null);

  const projectMeta: ProjectMeta = {
    workspaceName: getWorkspaceName(workspacePath),
    workspacePath,
    isStandalone: isStandaloneProjectPath(workspacePath),
    lastSessionAt,
    sessionCount: sessions.length,
  };

  return projectMeta;
};

export const getProjectMeta = async (
  workspacePath: string,
): Promise<ProjectMeta> => {
  const sessions = await listSessionsForWorkspace(workspacePath);
  return getProjectMetaFromSessionRecords(workspacePath, sessions);
};
