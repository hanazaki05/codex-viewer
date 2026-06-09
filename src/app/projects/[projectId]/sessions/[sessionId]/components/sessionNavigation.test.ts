import { describe, expect, it } from "vitest";
import type { Session } from "@/server/service/types";
import { getNextSessionRoute } from "./sessionNavigation";

const createSession = (id: string): Session => {
  return {
    id,
    sessionUuid: null,
    jsonlFilePath: `/tmp/${id}.jsonl`,
    meta: {
      title: null,
      messageCount: 1,
      firstCommand: {
        kind: "text",
        content: id,
      },
      lastModifiedAt: null,
      startedAt: null,
    },
  };
};

describe("getNextSessionRoute", () => {
  it("returns the following session when one exists", () => {
    const route = getNextSessionRoute({
      projectId: "project-1",
      currentSessionId: "session-2",
      sessions: [
        createSession("session-1"),
        createSession("session-2"),
        createSession("session-3"),
      ],
    });

    expect(route).toBe("/projects/project-1/sessions/session-3");
  });

  it("falls back to the previous session when deleting the last one", () => {
    const route = getNextSessionRoute({
      projectId: "project-1",
      currentSessionId: "session-3",
      sessions: [
        createSession("session-1"),
        createSession("session-2"),
        createSession("session-3"),
      ],
    });

    expect(route).toBe("/projects/project-1/sessions/session-2");
  });

  it("returns the project page when no sessions remain", () => {
    const route = getNextSessionRoute({
      projectId: "project-1",
      currentSessionId: "session-1",
      sessions: [createSession("session-1")],
    });

    expect(route).toBe("/projects/project-1");
  });
});
