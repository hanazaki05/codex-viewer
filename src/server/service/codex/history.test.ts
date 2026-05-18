import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const importHistoryModule = async (homeDir: string) => {
  vi.resetModules();
  vi.stubEnv("HOME", homeDir);
  return await import("./history");
};

describe("codex history parser", () => {
  let tempHomeDir = "";

  beforeEach(async () => {
    tempHomeDir = await mkdtemp(join(tmpdir(), "codex-viewer-history-test-"));
    await mkdir(join(tempHomeDir, ".codex"), { recursive: true });
  });

  afterEach(async () => {
    if (tempHomeDir) {
      await rm(tempHomeDir, { recursive: true, force: true });
    }
  });

  it("returns latest timestamps per session id and ignores invalid lines", async () => {
    const historyPath = join(tempHomeDir, ".codex", "history.jsonl");
    const content = [
      JSON.stringify({ session_id: "session-a", ts: 1000, text: "first" }),
      "{invalid-json",
      JSON.stringify({ session_id: "session-a", ts: 1500, text: "second" }),
      JSON.stringify({ session_id: "session-b", ts: 1_700_000_000_000 }),
      JSON.stringify({ session_id: 123, ts: 2000 }),
      "",
    ].join("\n");
    await writeFile(historyPath, content, "utf-8");

    const { getHistoryTimestamps } = await importHistoryModule(tempHomeDir);
    const timestamps = await getHistoryTimestamps();

    expect(timestamps.size).toBe(2);
    expect(timestamps.get("session-a")?.toISOString()).toBe(
      "1970-01-01T00:25:00.000Z",
    );
    expect(timestamps.get("session-b")?.toISOString()).toBe(
      "2023-11-14T22:13:20.000Z",
    );
  });

  it("returns latest valid history entry when the file ends with a malformed line", async () => {
    const historyPath = join(tempHomeDir, ".codex", "history.jsonl");
    const content = [
      JSON.stringify({ session_id: "session-a", ts: 1000, text: "first" }),
      "",
      JSON.stringify({
        session_id: "session-b",
        ts: 2_000,
        text: "latest-message",
      }),
      '{"session_id":"session-c","text":"partial',
      "  ",
    ].join("\n");
    await writeFile(historyPath, content, "utf-8");

    const { readLatestHistoryEntry } = await importHistoryModule(tempHomeDir);
    const latest = await readLatestHistoryEntry();

    expect(latest).not.toBeNull();
    expect(latest?.sessionId).toBe("session-b");
    expect(latest?.text).toBe("latest-message");
    expect(latest?.timestamp?.toISOString()).toBe("1970-01-01T00:33:20.000Z");
  });

  it("returns null when no valid history entries exist", async () => {
    const historyPath = join(tempHomeDir, ".codex", "history.jsonl");
    const content = [
      '{"session_id":"session-a","text":"partial',
      "{oops",
      " ",
    ].join("\n");
    await writeFile(historyPath, content, "utf-8");

    const { readLatestHistoryEntry } = await importHistoryModule(tempHomeDir);

    await expect(readLatestHistoryEntry()).resolves.toBeNull();
  });

  it("returns empty values when history file does not exist", async () => {
    const { getHistoryTimestamps, readLatestHistoryEntry } =
      await importHistoryModule(tempHomeDir);

    await expect(getHistoryTimestamps()).resolves.toEqual(new Map());
    await expect(readLatestHistoryEntry()).resolves.toBeNull();
  });
});
