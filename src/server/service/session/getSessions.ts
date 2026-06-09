import { listSessionsForWorkspace } from "../codex/sessionFiles";
import { getCodexThreadTitles } from "../codex/threadStore";
import { decodeProjectId } from "../project/id";
import type { Session } from "../types";
import { getSessionMeta } from "./getSessionMeta";
import { encodeSessionId } from "./id";

const getTime = (date: string | null) => {
  if (date === null) return 0;
  return new Date(date).getTime();
};

export const getSessions = async (
  projectId: string,
): Promise<{ sessions: Session[] }> => {
  const workspacePath = decodeProjectId(projectId);
  const sessionRecords = await listSessionsForWorkspace(workspacePath);
  return getSessionsFromRecords(sessionRecords);
};

export const getSessionsFromRecords = async (
  sessionRecords: Awaited<ReturnType<typeof listSessionsForWorkspace>>,
): Promise<{ sessions: Session[] }> => {
  const titles = await getCodexThreadTitles({
    sessions: sessionRecords.map((record) => ({
      sessionUuid: record.sessionUuid,
      rolloutPath: record.filePath,
    })),
  });

  const sessions = await Promise.all(
    sessionRecords.map(async (record): Promise<Session> => {
      const meta = await getSessionMeta(record.filePath, {
        includeTitle: false,
      });
      meta.title =
        (record.sessionUuid
          ? (titles.get(record.sessionUuid) ?? null)
          : null) ??
        titles.get(record.filePath) ??
        meta.title;
      return {
        id: encodeSessionId(record.filePath),
        sessionUuid: record.sessionUuid,
        jsonlFilePath: record.filePath,
        meta,
      } satisfies Session;
    }),
  );

  sessions.sort((a, b) => {
    return getTime(b.meta.lastModifiedAt) - getTime(a.meta.lastModifiedAt);
  });

  return { sessions };
};
