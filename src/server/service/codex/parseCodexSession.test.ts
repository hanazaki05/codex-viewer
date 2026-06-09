import { describe, expect, it } from "vitest";
import { parseCodexSession } from "./parseCodexSession";

describe("parseCodexSession", () => {
  it("moves system labels into session meta instructions and keeps user text clean", () => {
    const content = [
      JSON.stringify({
        timestamp: "2026-04-07T19:11:46.727Z",
        type: "session_meta",
        payload: {
          id: "session-1",
          cwd: "/workspace",
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
                "<apps_instructions>",
                "## Apps (Connectors)",
                "Apps can be triggered from user messages.",
                "</apps_instructions>",
                "",
                "<permissions instructions>",
                "read-only sandbox",
                "</permissions instructions>",
                "",
                "<collaboration_mode>default</collaboration_mode>",
                "",
                "real question",
              ].join("\n"),
            },
          ],
        },
      }),
      JSON.stringify({
        timestamp: "2026-04-07T19:11:48.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          text: [
            "# AGENTS.md instructions for /workspace",
            "",
            "<INSTRUCTIONS>",
            "use rg",
            "</INSTRUCTIONS>",
            "",
            "follow-up question",
          ].join("\n"),
        },
      }),
    ].join("\n");

    const parsed = parseCodexSession(content);

    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0]).toMatchObject({
      type: "user",
      text: "real question",
    });
    expect(parsed.entries[1]).toMatchObject({
      type: "user",
      text: "follow-up question",
    });
    expect(parsed.sessionMeta.instructions).toContain(
      "<apps_instructions>",
    );
    expect(parsed.sessionMeta.instructions).toContain(
      "<permissions instructions>",
    );
    expect(parsed.sessionMeta.instructions).toContain(
      "<collaboration_mode>default</collaboration_mode>",
    );
    expect(parsed.sessionMeta.instructions).toContain(
      "# AGENTS.md instructions for /workspace",
    );
  });

  it("moves leading memory instructions into session meta", () => {
    const content = [
      JSON.stringify({
        timestamp: "2026-06-09T10:00:00.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [
            {
              text: [
                "# AGENTS.md instructions for /workspace",
                "",
                "<INSTRUCTIONS>",
                "use rg",
                "</INSTRUCTIONS>",
                "<environment_context>",
                "cwd=/workspace",
                "</environment_context>",
                "## Memory",
                "",
                "You have access to a memory folder with guidance from prior runs. It can save",
                "time and help you stay consistent. Use it whenever it is likely to help.",
                "",
                "Do not present unverified memory-derived facts as confirmed-current.",
                "",
                "把这个开头的消息也当成系统消息折叠起来",
              ].join("\n"),
            },
          ],
        },
      }),
    ].join("\n");

    const parsed = parseCodexSession(content);

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]).toMatchObject({
      type: "user",
      text: "把这个开头的消息也当成系统消息折叠起来",
    });
    expect(parsed.sessionMeta.instructions).toContain("## Memory");
    expect(parsed.sessionMeta.instructions).toContain(
      "Use it whenever it is likely to help.",
    );
    expect(parsed.sessionMeta.instructions).toContain(
      "Do not present unverified memory-derived facts as confirmed-current.",
    );
  });
});
