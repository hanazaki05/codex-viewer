import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseCodexSession } from "../codex/parseCodexSession";
import { getSessionMeta, getSessionMetaFromParsed } from "./getSessionMeta";

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

  it("matches full session parsing without constructing all turns", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "codex-viewer-session-meta-"));
    tempDirs.push(rootDir);

    const sessionDir = join(rootDir, "sessions", "2026", "04", "07");
    const sessionPath = join(sessionDir, "session.jsonl");
    await mkdir(sessionDir, { recursive: true });

    const content = [
      JSON.stringify({
        timestamp: "2026-04-07T19:11:46.727Z",
        type: "session_meta",
        payload: {
          id: "session-1",
          cwd: "/workspace",
          instructions: "system prompt",
        },
      }),
      JSON.stringify({
        timestamp: "2026-04-07T19:11:47.716Z",
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
                "real question",
              ].join("\n"),
            },
          ],
        },
      }),
      JSON.stringify({
        timestamp: "2026-04-07T19:11:47.800Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ text: "real question" }],
        },
      }),
      JSON.stringify({
        timestamp: "2026-04-07T19:11:48.000Z",
        type: "response_item",
        payload: {
          type: "reasoning",
          summary: [{ text: "thinking" }],
        },
      }),
      JSON.stringify({
        timestamp: "2026-04-07T19:11:49.000Z",
        type: "response_item",
        payload: {
          type: "function_call",
          name: "shell",
          arguments: "{}",
          call_id: "call-1",
        },
      }),
      JSON.stringify({
        timestamp: "2026-04-07T19:11:50.000Z",
        type: "response_item",
        payload: {
          type: "function_call_output",
          output: "done",
          call_id: "call-1",
        },
      }),
      JSON.stringify({
        timestamp: "2026-04-07T19:11:51.000Z",
        type: "event_msg",
        payload: {
          type: "agent_message",
          text: "answer",
        },
      }),
      JSON.stringify({
        timestamp: "2026-04-07T19:11:52.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: { total: 10 },
        },
      }),
      JSON.stringify({
        timestamp: "2026-04-07T19:11:53.000Z",
        type: "event_msg",
        payload: {
          type: "custom_status",
          text: "status update",
        },
      }),
    ].join("\n");

    await writeFile(sessionPath, content, "utf-8");

    const fullMeta = await getSessionMetaFromParsed(
      sessionPath,
      parseCodexSession(content),
    );
    const fastMeta = await getSessionMeta(sessionPath);

    expect(fastMeta).toEqual(fullMeta);
  });
});
