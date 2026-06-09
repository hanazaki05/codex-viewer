import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { getCodexThreadTitle, getCodexThreadTitles } from "./threadStore";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await rm(dir, { recursive: true, force: true });
  }
});

const createThreadStore = async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "codex-viewer-thread-store-"));
  tempDirs.push(rootDir);
  const dbPath = join(rootDir, "state_5.sqlite");

  await execFileAsync("sqlite3", [
    dbPath,
    [
      "CREATE TABLE threads (",
      "id TEXT PRIMARY KEY,",
      "rollout_path TEXT NOT NULL,",
      "title TEXT NOT NULL",
      ");",
      "INSERT INTO threads (id, rollout_path, title) VALUES",
      "('session-1', '/sessions/session-1.jsonl', 'Auto Named Session'),",
      "('session-2', '/sessions/session-2.jsonl', '  ');",
    ].join(" "),
  ]);

  return dbPath;
};

describe("threadStore", () => {
  it("reads a Codex App title by session id or rollout path", async () => {
    const dbPath = await createThreadStore();

    await expect(
      getCodexThreadTitle({
        sessionUuid: "session-1",
        rolloutPath: "/missing.jsonl",
        dbPath,
      }),
    ).resolves.toBe("Auto Named Session");

    await expect(
      getCodexThreadTitle({
        sessionUuid: null,
        rolloutPath: "/sessions/session-1.jsonl",
        dbPath,
      }),
    ).resolves.toBe("Auto Named Session");
  });

  it("returns batch titles and skips blank titles", async () => {
    const dbPath = await createThreadStore();

    const titles = await getCodexThreadTitles({
      sessions: [
        { sessionUuid: "session-1", rolloutPath: "/sessions/session-1.jsonl" },
        { sessionUuid: "session-2", rolloutPath: "/sessions/session-2.jsonl" },
      ],
      dbPath,
    });

    expect(titles.get("session-1")).toBe("Auto Named Session");
    expect(titles.get("/sessions/session-1.jsonl")).toBe("Auto Named Session");
    expect(titles.has("session-2")).toBe(false);
  });
});
