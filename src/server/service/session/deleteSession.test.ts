import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeProjectId } from "../project/id";
import { deleteSession } from "./deleteSession";
import { encodeSessionId } from "./id";

const tempDirs: string[] = [];

const createFixture = async (options?: { workspacePath?: string }) => {
  const rootDir = await mkdtemp(join(tmpdir(), "codex-viewer-delete-session-"));
  tempDirs.push(rootDir);

  const sessionsRootPath = join(rootDir, "sessions");
  const sessionDir = join(sessionsRootPath, "2026", "04", "07");
  const workspacePath = options?.workspacePath ?? join(rootDir, "workspace");
  const sessionUuid = "session-uuid-123";
  const sessionPath = join(sessionDir, "session.jsonl");
  const historyFilePath = join(rootDir, "history.jsonl");

  await mkdir(sessionDir, { recursive: true });
  await mkdir(workspacePath, { recursive: true });

  await writeFile(
    sessionPath,
    [
      JSON.stringify({
        type: "session_meta",
        payload: {
          id: sessionUuid,
          cwd: workspacePath,
          timestamp: "2026-04-07T00:00:00.000Z",
        },
      }),
      JSON.stringify({
        type: "event_msg",
        payload: { type: "user_message", text: "hello" },
      }),
    ].join("\n"),
    "utf-8",
  );

  await writeFile(
    historyFilePath,
    [
      JSON.stringify({
        session_id: sessionUuid,
        ts: 1712450000,
        text: "first",
      }),
      JSON.stringify({
        session_id: "other-session",
        ts: 1712451000,
        text: "second",
      }),
      "{malformed-json}",
      "",
    ].join("\n"),
    "utf-8",
  );

  return {
    rootDir,
    sessionsRootPath,
    sessionPath,
    sessionUuid,
    historyFilePath,
    workspacePath,
    projectId: encodeProjectId(workspacePath),
    sessionId: encodeSessionId(sessionPath),
  };
};

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("deleteSession", () => {
  it("deletes session file, cleans matching history entries and emits events", async () => {
    const fixture = await createFixture();
    const emit = vi.fn();

    const result = await deleteSession(fixture.projectId, fixture.sessionId, {
      taskController: {
        hasAliveTask: () => false,
      },
      eventBus: {
        emit,
      },
      sessionsRootPath: fixture.sessionsRootPath,
      historyFilePath: fixture.historyFilePath,
    });

    expect(result).toEqual({ success: true, deletedProject: false });
    expect(existsSync(fixture.sessionPath)).toBe(false);

    const history = await readFile(fixture.historyFilePath, "utf-8");
    expect(history).not.toContain(fixture.sessionUuid);
    expect(history).toContain("other-session");
    expect(history).toContain("{malformed-json}");

    expect(emit).toHaveBeenNthCalledWith(1, "project_changed", {
      type: "project_changed",
      data: {
        projectId: fixture.projectId,
        fileEventType: "rename",
      },
    });
    expect(emit).toHaveBeenNthCalledWith(2, "session_changed", {
      type: "session_changed",
      data: {
        projectId: fixture.projectId,
        sessionId: fixture.sessionId,
        fileEventType: "rename",
      },
    });
  });

  it("deletes a project directory when requested for the last session", async () => {
    const fixture = await createFixture();
    const emit = vi.fn();

    const result = await deleteSession(
      fixture.projectId,
      fixture.sessionId,
      {
        taskController: {
          hasAliveTask: () => false,
        },
        eventBus: {
          emit,
        },
        sessionsRootPath: fixture.sessionsRootPath,
        historyFilePath: fixture.historyFilePath,
      },
      { deleteProject: true },
    );

    expect(result).toEqual({ success: true, deletedProject: true });
    expect(existsSync(fixture.sessionPath)).toBe(false);
    expect(existsSync(fixture.workspacePath)).toBe(false);
  });

  it("rejects project deletion when the project directory is missing", async () => {
    const fixture = await createFixture();
    await rm(fixture.workspacePath, { recursive: true, force: true });

    await expect(
      deleteSession(
        fixture.projectId,
        fixture.sessionId,
        {
          taskController: {
            hasAliveTask: () => false,
          },
          sessionsRootPath: fixture.sessionsRootPath,
          historyFilePath: fixture.historyFilePath,
        },
        { deleteProject: true },
      ),
    ).rejects.toMatchObject({
      status: 404,
      message: "Project directory not found",
    });

    expect(existsSync(fixture.sessionPath)).toBe(true);
  });

  it("rejects project deletion when the project has other sessions", async () => {
    const fixture = await createFixture();
    const secondSessionPath = join(
      fixture.sessionsRootPath,
      "2026",
      "04",
      "08",
      "second.jsonl",
    );
    await mkdir(join(fixture.sessionsRootPath, "2026", "04", "08"), {
      recursive: true,
    });
    await writeFile(
      secondSessionPath,
      JSON.stringify({
        type: "session_meta",
        payload: {
          id: "second-session",
          cwd: fixture.workspacePath,
          timestamp: "2026-04-08T00:00:00.000Z",
        },
      }),
      "utf-8",
    );

    await expect(
      deleteSession(
        fixture.projectId,
        fixture.sessionId,
        {
          taskController: {
            hasAliveTask: () => false,
          },
          sessionsRootPath: fixture.sessionsRootPath,
          historyFilePath: fixture.historyFilePath,
        },
        { deleteProject: true },
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "Project can only be deleted when this is its last session",
    });

    expect(existsSync(fixture.sessionPath)).toBe(true);
    expect(existsSync(secondSessionPath)).toBe(true);
    expect(existsSync(fixture.workspacePath)).toBe(true);
  });

  it("rejects deletion for running or waiting sessions", async () => {
    const fixture = await createFixture();

    await expect(
      deleteSession(fixture.projectId, fixture.sessionId, {
        taskController: {
          hasAliveTask: () => true,
        },
        sessionsRootPath: fixture.sessionsRootPath,
        historyFilePath: fixture.historyFilePath,
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Cannot delete a session that is currently running or waiting",
    });

    expect(existsSync(fixture.sessionPath)).toBe(true);
  });

  it("rejects deletion when the session does not belong to the project", async () => {
    const fixture = await createFixture();
    const differentProjectId = encodeProjectId(
      join(fixture.rootDir, "other-project"),
    );

    await expect(
      deleteSession(differentProjectId, fixture.sessionId, {
        taskController: {
          hasAliveTask: () => false,
        },
        sessionsRootPath: fixture.sessionsRootPath,
        historyFilePath: fixture.historyFilePath,
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Session does not belong to the requested project",
    });
  });

  it("rejects deletion when session path is outside codex sessions root", async () => {
    const fixture = await createFixture();
    const outsidePath = join(fixture.rootDir, "outside.jsonl");
    await writeFile(outsidePath, "{}", "utf-8");

    await expect(
      deleteSession(fixture.projectId, encodeSessionId(outsidePath), {
        taskController: {
          hasAliveTask: () => false,
        },
        sessionsRootPath: fixture.sessionsRootPath,
        historyFilePath: fixture.historyFilePath,
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Invalid session path",
    });
  });

  it("restores the session file when history cleanup fails", async () => {
    const fixture = await createFixture();
    const originalSessionContent = await readFile(fixture.sessionPath, "utf-8");
    const emit = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      deleteSession(fixture.projectId, fixture.sessionId, {
        taskController: {
          hasAliveTask: () => false,
        },
        eventBus: {
          emit,
        },
        sessionsRootPath: fixture.sessionsRootPath,
        historyFilePath: fixture.historyFilePath,
        removeHistoryEntriesBySessionUuid: async () => {
          throw new Error("history rewrite failed");
        },
      }),
    ).rejects.toMatchObject({
      status: 500,
      message: "Failed to cleanup session history",
    });

    expect(existsSync(fixture.sessionPath)).toBe(true);
    await expect(readFile(fixture.sessionPath, "utf-8")).resolves.toBe(
      originalSessionContent,
    );

    const history = await readFile(fixture.historyFilePath, "utf-8");
    expect(history).toContain(fixture.sessionUuid);
    expect(emit).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });
});
