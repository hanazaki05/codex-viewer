import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getSessionMeta } from "./getSessionMeta";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("getSessionMeta", () => {
  it("labels sessions that only contain system instructions", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "codex-viewer-session-meta-"));
    tempDirs.push(rootDir);

    const sessionDir = join(rootDir, "sessions", "2026", "04", "07");
    const sessionPath = join(sessionDir, "session.jsonl");
    await mkdir(sessionDir, { recursive: true });

    await writeFile(
      sessionPath,
      [
        JSON.stringify({
          type: "session_meta",
          payload: {
            id: "session-1",
            cwd: "/workspace",
          },
        }),
        JSON.stringify({
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [
              {
                text: [
                  "<permissions instructions>",
                  "read-only sandbox",
                  "</permissions instructions>",
                  "",
                  "<collaboration_mode>default</collaboration_mode>",
                ].join("\n"),
              },
            ],
          },
        }),
      ].join("\n"),
      "utf-8",
    );

    const meta = await getSessionMeta(sessionPath);

    expect(meta.firstCommand).toEqual({
      kind: "text",
      content: "[system instructions only]",
    });
  });
});
