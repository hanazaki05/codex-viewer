import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createInterface } from "node:readline";

import {
  extractSystemLabels,
  extractTextFromContent,
  type parseCodexSession,
} from "../codex/parseCodexSession";
import type { ParsedCommand } from "../parseCommandXml";
import type { SessionMeta } from "../types";

type ParsedSession = ReturnType<typeof parseCodexSession>;

type CodexLogLine = {
  timestamp?: unknown;
  type?: unknown;
  payload?: unknown;
};

type ResponseMessagePayload = {
  type?: unknown;
  role?: unknown;
  content?: unknown;
};

type EventMessagePayload = {
  type?: unknown;
  text?: unknown;
  message?: unknown;
};

type SessionMetaCacheEntry = {
  mtimeMs: number;
  size: number;
  meta: SessionMeta;
};

const sessionMetaCache = new Map<string, SessionMetaCacheEntry>();

const cloneSessionMeta = (meta: SessionMeta): SessionMeta => {
  return {
    ...meta,
    firstCommand: meta.firstCommand ? { ...meta.firstCommand } : null,
  };
};

const getFirstCommandFromParsedSession = (
  parsed: ParsedSession,
): ParsedCommand | null => {
  const firstTurnWithUserMessage = parsed.turns.find((turn) => {
    const text = turn.userMessage?.text;
    return typeof text === "string" && text.trim().length > 0;
  });
  if (firstTurnWithUserMessage?.userMessage?.text) {
    return {
      kind: "text",
      content: firstTurnWithUserMessage.userMessage.text,
    };
  }

  if (
    typeof parsed.sessionMeta.instructions === "string" &&
    parsed.sessionMeta.instructions.trim().length > 0
  ) {
    return {
      kind: "text",
      content: "[system instructions only]",
    };
  }

  return null;
};

export const getSessionMetaFromParsed = async (
  jsonlFilePath: string,
  parsed: ParsedSession,
): Promise<SessionMeta> => {
  let stats: Awaited<ReturnType<typeof stat>> | undefined;
  try {
    stats = await stat(jsonlFilePath);
  } catch (error) {
    console.warn(`Failed to stat session file ${jsonlFilePath}`, error);
  }

  return {
    messageCount: parsed.entries.length,
    firstCommand: getFirstCommandFromParsedSession(parsed),
    lastModifiedAt: stats?.mtime ? stats.mtime.toISOString() : null,
    startedAt: stats?.birthtime ? stats.birthtime.toISOString() : null,
  };
};

const parseLine = (line: string): CodexLogLine | null => {
  try {
    return JSON.parse(line) as CodexLogLine;
  } catch (error) {
    console.warn("Failed to parse Codex log line", { error, line });
    return null;
  }
};

const createFastSessionMetaReader = () => {
  let messageCount = 0;
  let firstUserMessage: string | null = null;
  let sessionInstructions: string | null = null;
  const extractedSystemLabels: string[] = [];
  const lastMessageText: Record<"user" | "assistant", string | null> = {
    user: null,
    assistant: null,
  };

  let hasCurrentTurn = false;
  let currentTurnUserText: string | null = null;
  let currentTurnAssistantTexts: string[] = [];

  const startNewTurn = (userText: string | null = null) => {
    hasCurrentTurn = true;
    currentTurnUserText = userText;
    currentTurnAssistantTexts = [];
  };

  const ensureCurrentTurn = () => {
    if (!hasCurrentTurn) {
      startNewTurn();
    }
  };

  const appendSystemLabels = (labels: string[]) => {
    for (const label of labels) {
      if (!extractedSystemLabels.includes(label)) {
        extractedSystemLabels.push(label);
      }
    }
  };

  const rememberUserMessage = (text: string) => {
    if (firstUserMessage === null) {
      firstUserMessage = text;
    }
  };

  const isConversationRole = (role: unknown): role is "assistant" | "user" => {
    return role === "assistant" || role === "user";
  };

  const handleResponseMessage = (payload: ResponseMessagePayload) => {
    const extracted = extractTextFromContent(payload.content);
    appendSystemLabels(extracted.labels);
    const normalized = extracted.text.trim();
    if (!isConversationRole(payload.role)) {
      appendSystemLabels(normalized.length > 0 ? [normalized] : []);
      return;
    }

    const role = payload.role;

    if (role === "user" && normalized.length === 0) {
      if (!hasCurrentTurn || currentTurnUserText !== null) {
        startNewTurn();
      }
      return;
    }
    if (role === "assistant" && normalized.length === 0) {
      return;
    }
    if (lastMessageText[role] === normalized) {
      return;
    }

    messageCount += 1;
    if (role === "user") {
      rememberUserMessage(normalized);
      if (!hasCurrentTurn || currentTurnUserText !== null) {
        startNewTurn(normalized);
      } else {
        currentTurnUserText = normalized;
      }
    } else {
      ensureCurrentTurn();
      currentTurnAssistantTexts.push(normalized);
    }
    lastMessageText[role] = normalized;
  };

  const handleEventMessage = (payload: EventMessagePayload) => {
    if (payload.type === "agent_reasoning") {
      const rawText =
        typeof payload.text === "string"
          ? payload.text
          : typeof payload.message === "string"
            ? payload.message
            : null;
      if (!rawText) {
        return;
      }
      const extracted = extractSystemLabels(rawText);
      appendSystemLabels(extracted.labels);
      const normalized = extracted.text.trim();
      if (!normalized) {
        return;
      }
      messageCount += 1;
      ensureCurrentTurn();
      return;
    }

    if (payload.type !== "agent_message" && payload.type !== "user_message") {
      if (typeof payload.type === "string" && payload.type !== "token_count") {
        messageCount += 1;
      }
      return;
    }

    const rawText =
      typeof payload.text === "string"
        ? payload.text
        : typeof payload.message === "string"
          ? payload.message
          : null;
    if (!rawText) {
      return;
    }

    const extracted = extractSystemLabels(rawText);
    appendSystemLabels(extracted.labels);
    const normalized = extracted.text.trim();
    if (!normalized) {
      return;
    }

    const role = payload.type === "agent_message" ? "assistant" : "user";
    if (lastMessageText[role] === normalized) {
      return;
    }

    if (role === "user") {
      const duplicate =
        currentTurnUserText !== null &&
        currentTurnUserText.trim() === normalized;
      if (duplicate) {
        return;
      }
      messageCount += 1;
      rememberUserMessage(normalized);
      if (hasCurrentTurn && !currentTurnUserText) {
        currentTurnUserText = normalized;
      } else {
        startNewTurn(normalized);
      }
    } else {
      ensureCurrentTurn();
      if (currentTurnAssistantTexts.includes(normalized)) {
        return;
      }
      messageCount += 1;
      currentTurnAssistantTexts.push(normalized);
    }
    lastMessageText[role] = normalized;
  };

  const readLine = (line: string) => {
    const parsed = parseLine(line);
    if (!parsed) {
      return;
    }

    if (parsed.type === "session_meta") {
      if (parsed.payload && typeof parsed.payload === "object") {
        const instructionsValue = (
          parsed.payload as Partial<{ instructions: unknown }>
        ).instructions;
        if (typeof instructionsValue === "string") {
          sessionInstructions = instructionsValue;
        }
      }
      return;
    }

    if (parsed.type === "turn_context") {
      return;
    }

    if (parsed.type === "response_item") {
      const payload = parsed.payload as
        | (ResponseMessagePayload & { type?: unknown })
        | undefined;
      if (!payload || typeof payload !== "object") {
        return;
      }

      switch (payload.type) {
        case "message":
          handleResponseMessage(payload);
          break;
        case "reasoning":
        case "function_call":
        case "function_call_output":
          messageCount += 1;
          ensureCurrentTurn();
          break;
        default:
          break;
      }
      return;
    }

    if (parsed.type === "event_msg") {
      const payload = parsed.payload as EventMessagePayload | undefined;
      if (!payload || typeof payload !== "object") {
        return;
      }
      handleEventMessage(payload);
    }
  };

  const getFirstCommand = (): ParsedCommand | null => {
    if (firstUserMessage !== null) {
      return {
        kind: "text",
        content: firstUserMessage,
      };
    }

    const instructions = [sessionInstructions, ...extractedSystemLabels].filter(
      (value): value is string => {
        return typeof value === "string" && value.trim().length > 0;
      },
    );

    if (instructions.length > 0) {
      return {
        kind: "text",
        content: "[system instructions only]",
      };
    }

    return null;
  };

  return {
    readLine,
    getMeta: (stats: Awaited<ReturnType<typeof stat>> | undefined) => {
      return {
        messageCount,
        firstCommand: getFirstCommand(),
        lastModifiedAt: stats?.mtime ? stats.mtime.toISOString() : null,
        startedAt: stats?.birthtime ? stats.birthtime.toISOString() : null,
      } satisfies SessionMeta;
    },
  };
};

export const getSessionMeta = async (
  jsonlFilePath: string,
): Promise<SessionMeta> => {
  let stats: Awaited<ReturnType<typeof stat>> | undefined;
  try {
    stats = await stat(jsonlFilePath);
  } catch (error) {
    console.warn(`Failed to stat session file ${jsonlFilePath}`, error);
  }

  if (stats) {
    const mtimeMs = Number(stats.mtimeMs);
    const size = Number(stats.size);
    const cached = sessionMetaCache.get(jsonlFilePath);
    if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
      return cloneSessionMeta(cached.meta);
    }
  }

  const reader = createFastSessionMetaReader();
  try {
    const stream = createReadStream(jsonlFilePath, { encoding: "utf-8" });
    const lines = createInterface({
      input: stream,
      crlfDelay: Number.POSITIVE_INFINITY,
    });
    for await (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        reader.readLine(trimmed);
      }
    }
  } catch (error) {
    console.warn(`Failed to read session file ${jsonlFilePath}`, error);
  }

  const sessionMeta = reader.getMeta(stats);
  if (stats) {
    const mtimeMs = Number(stats.mtimeMs);
    const size = Number(stats.size);
    sessionMetaCache.set(jsonlFilePath, {
      mtimeMs,
      size,
      meta: cloneSessionMeta(sessionMeta),
    });
  }
  return sessionMeta;
};
