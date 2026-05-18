import { readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { CodexTaskController } from "../codex/CodexTaskController";
import { removeHistoryEntriesBySessionUuid } from "../codex/history";
import {
  listSessionsForWorkspace,
  readSessionHeader,
  removeCachedSessionRecord,
} from "../codex/sessionFiles";
import type { EventBus } from "../events/EventBus";
import { getEventBus } from "../events/EventBus";
import { codexSessionsRootPath } from "../paths";
import { decodeProjectId } from "../project/id";
import { decodeSessionId } from "./id";

type DeleteSessionDependencies = {
  taskController: Pick<CodexTaskController, "hasAliveTask">;
  eventBus?: Pick<EventBus, "emit">;
  sessionsRootPath?: string;
  historyFilePath?: string;
  removeHistoryEntriesBySessionUuid?: typeof removeHistoryEntriesBySessionUuid;
};

type DeleteSessionOptions = {
  deleteProject?: boolean;
};

export class DeleteSessionError extends Error {
  public readonly status: 400 | 404 | 409 | 500;

  constructor(status: 400 | 404 | 409 | 500, message: string) {
    super(message);
    this.status = status;
    this.name = "DeleteSessionError";
  }
}

const isPathInside = (targetPath: string, rootPath: string) => {
  const rel = relative(rootPath, targetPath);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

export const deleteSession = async (
  projectId: string,
  sessionId: string,
  dependencies: DeleteSessionDependencies,
  options: DeleteSessionOptions = {},
): Promise<{ success: true; deletedProject: boolean }> => {
  const workspacePath = decodeProjectId(projectId);
  const rawSessionPath = decodeSessionId(sessionId);
  const sessionsRootPath = resolve(
    dependencies.sessionsRootPath ?? codexSessionsRootPath,
  );
  const sessionPath = resolve(rawSessionPath);
  const shouldDeleteProject = options.deleteProject === true;

  if (!isPathInside(sessionPath, sessionsRootPath)) {
    throw new DeleteSessionError(400, "Invalid session path");
  }

  if (!sessionPath.endsWith(".jsonl")) {
    throw new DeleteSessionError(400, "Invalid session file");
  }

  try {
    const fileStat = await stat(sessionPath);
    if (!fileStat.isFile()) {
      throw new DeleteSessionError(404, "Session not found");
    }
  } catch (error) {
    if (error instanceof DeleteSessionError) {
      throw error;
    }

    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new DeleteSessionError(404, "Session not found");
    }
    throw new DeleteSessionError(500, "Failed to access session file");
  }

  const header = await readSessionHeader(sessionPath);
  if (!header?.workspacePath) {
    throw new DeleteSessionError(400, "Session metadata is missing");
  }

  if (header.workspacePath !== workspacePath) {
    throw new DeleteSessionError(
      400,
      "Session does not belong to the requested project",
    );
  }

  if (dependencies.taskController.hasAliveTask(sessionId, header.sessionUuid)) {
    throw new DeleteSessionError(
      409,
      "Cannot delete a session that is currently running or waiting",
    );
  }

  if (shouldDeleteProject) {
    try {
      const workspaceStat = await stat(workspacePath);
      if (!workspaceStat.isDirectory()) {
        throw new DeleteSessionError(400, "Project path is not a directory");
      }
    } catch (error) {
      if (error instanceof DeleteSessionError) {
        throw error;
      }

      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new DeleteSessionError(404, "Project directory not found");
      }

      throw new DeleteSessionError(500, "Failed to access project directory");
    }

    const projectSessions = await listSessionsForWorkspace(workspacePath, {
      rootPath: sessionsRootPath,
    });

    if (
      projectSessions.length !== 1 ||
      resolve(projectSessions[0]?.filePath ?? "") !== sessionPath
    ) {
      throw new DeleteSessionError(
        409,
        "Project can only be deleted when this is its last session",
      );
    }
  }

  let originalSessionContent = "";
  try {
    originalSessionContent = await readFile(sessionPath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new DeleteSessionError(404, "Session not found");
    }
    throw new DeleteSessionError(500, "Failed to read session file");
  }

  try {
    await unlink(sessionPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new DeleteSessionError(404, "Session not found");
    }
    throw new DeleteSessionError(500, "Failed to delete session file");
  }

  if (header.sessionUuid) {
    const removeHistoryEntries =
      dependencies.removeHistoryEntriesBySessionUuid ??
      removeHistoryEntriesBySessionUuid;

    try {
      await removeHistoryEntries(header.sessionUuid, {
        historyFilePath: dependencies.historyFilePath,
      });
    } catch (error) {
      console.warn(
        "Failed to clean history entries for deleted session",
        error,
      );

      try {
        await writeFile(sessionPath, originalSessionContent, "utf-8");
      } catch (restoreError) {
        console.error(
          "Failed to restore session file after history cleanup failure",
          restoreError,
        );
        throw new DeleteSessionError(
          500,
          "Failed to cleanup session history and restore session file",
        );
      }

      throw new DeleteSessionError(500, "Failed to cleanup session history");
    }
  }

  removeCachedSessionRecord(sessionPath);

  let deletedProject = false;
  if (shouldDeleteProject) {
    const remainingProjectSessions = await listSessionsForWorkspace(
      workspacePath,
      {
        rootPath: sessionsRootPath,
      },
    );

    if (remainingProjectSessions.length > 0) {
      throw new DeleteSessionError(409, "Project still has remaining sessions");
    }

    try {
      await rm(workspacePath, { recursive: true, force: true });
      deletedProject = true;
    } catch (error) {
      console.error("Failed to delete project directory", error);
      throw new DeleteSessionError(
        500,
        "Session deleted, but failed to delete project directory",
      );
    }
  }

  const eventBus = dependencies.eventBus ?? getEventBus();
  eventBus.emit("project_changed", {
    type: "project_changed",
    data: {
      projectId,
      fileEventType: "rename",
    },
  });
  eventBus.emit("session_changed", {
    type: "session_changed",
    data: {
      projectId,
      sessionId,
      fileEventType: "rename",
    },
  });

  return { success: true, deletedProject };
};
