import type {
  CodexConversationEntry,
  CodexMessage,
  CodexMetaEvent,
  CodexReasoning,
  CodexSessionMeta,
  CodexSessionTurn,
  CodexToolCall,
  CodexToolResult,
} from "../types";

type CodexLogLine = {
  timestamp?: string;
  type?: string;
  payload?: unknown;
};

type MessageContentItem = {
  type?: unknown;
  text?: unknown;
};

type ResponseMessagePayload = {
  type?: unknown;
  role?: unknown;
  content?: unknown;
};

type ResponseReasoningPayload = {
  type?: unknown;
  summary?: unknown;
  content?: unknown;
  encrypted_content?: unknown;
};

type ResponseFunctionCallPayload = {
  type?: unknown;
  name?: unknown;
  arguments?: unknown;
  call_id?: unknown;
};

type ResponseFunctionCallOutputPayload = {
  type?: unknown;
  call_id?: unknown;
  output?: unknown;
};

type EventMessagePayload = {
  type?: unknown;
  text?: unknown;
  message?: unknown;
};

const SYSTEM_BLOCK_PATTERNS = [
  /<user_instructions>[\s\S]*?<\/user_instructions>/gi,
  /<apps_instructions>[\s\S]*?<\/apps_instructions>/gi,
  /<environment_context>[\s\S]*?<\/environment_context>/gi,
  /<collaboration_mode>[\s\S]*?<\/collaboration_mode>/gi,
  /<skills_instructions>[\s\S]*?<\/skills_instructions>/gi,
  /<plugins_instructions>[\s\S]*?<\/plugins_instructions>/gi,
  /<personality_spec>[\s\S]*?<\/personality_spec>/gi,
  /<permissions instructions>[\s\S]*?<\/permissions instructions>/gi,
  /# AGENTS\.md instructions for[^\n]*\n+<INSTRUCTIONS>[\s\S]*?<\/INSTRUCTIONS>/gi,
  /<INSTRUCTIONS>[\s\S]*?<\/INSTRUCTIONS>/gi,
];

const DANGLING_SYSTEM_BLOCK_PATTERNS = [
  /[\s\S]*?<\/user_instructions>/gi,
  /[\s\S]*?<\/apps_instructions>/gi,
  /[\s\S]*?<\/environment_context>/gi,
  /[\s\S]*?<\/collaboration_mode>/gi,
  /[\s\S]*?<\/skills_instructions>/gi,
  /[\s\S]*?<\/plugins_instructions>/gi,
  /[\s\S]*?<\/personality_spec>/gi,
  /[\s\S]*?<\/permissions instructions>/gi,
  /[\s\S]*?<\/INSTRUCTIONS>/gi,
  /<user_instructions>[\s\S]*/gi,
  /<apps_instructions>[\s\S]*/gi,
  /<environment_context>[\s\S]*/gi,
  /<collaboration_mode>[\s\S]*/gi,
  /<skills_instructions>[\s\S]*/gi,
  /<plugins_instructions>[\s\S]*/gi,
  /<personality_spec>[\s\S]*/gi,
  /<permissions instructions>[\s\S]*/gi,
  /<INSTRUCTIONS>[\s\S]*/gi,
];

const MEMORY_INSTRUCTION_INTRO_PATTERN =
  /^\s*## Memory\s*\n+You have access to a memory folder with guidance from prior runs\. It can save\s+time and help you stay consistent\. Use it whenever it is likely to help\./i;

const MEMORY_INSTRUCTION_END_PATTERNS = [
  /Do not try to edit the memory files yourself, only add one update note in[^\n]*(?:\n\/[^\n]*)?/i,
  /Do not present unverified memory-derived facts as confirmed-current\./i,
  /========= MEMORY_SUMMARY ENDS =========/i,
];

const normalizeTextBlock = (text: string) => {
  return text.replace(/\n{3,}/g, "\n\n").trim();
};

const extractLeadingMemoryInstructions = (text: string) => {
  const introMatch = MEMORY_INSTRUCTION_INTRO_PATTERN.exec(text);
  if (!introMatch) {
    return { text, labels: [] as string[] };
  }

  let endIndex = introMatch[0].length;
  for (const pattern of MEMORY_INSTRUCTION_END_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      endIndex = match.index + match[0].length;
      break;
    }
  }

  const label = normalizeTextBlock(text.slice(0, endIndex));
  return {
    text: text.slice(endIndex),
    labels: label.length > 0 ? [label] : [],
  };
};

const extractSystemLabels = (text: string) => {
  const labels: string[] = [];
  let visibleText = text;

  const leadingMemoryInstructions =
    extractLeadingMemoryInstructions(visibleText);
  visibleText = leadingMemoryInstructions.text;
  labels.push(...leadingMemoryInstructions.labels);

  for (const pattern of SYSTEM_BLOCK_PATTERNS) {
    visibleText = visibleText.replace(pattern, (match) => {
      const normalized = normalizeTextBlock(match);
      if (normalized.length > 0) {
        labels.push(normalized);
      }
      return "";
    });
  }

  for (const pattern of DANGLING_SYSTEM_BLOCK_PATTERNS) {
    visibleText = visibleText.replace(pattern, "");
  }

  const remainingLeadingMemoryInstructions =
    extractLeadingMemoryInstructions(visibleText);
  visibleText = remainingLeadingMemoryInstructions.text;
  labels.push(...remainingLeadingMemoryInstructions.labels);

  return {
    text: normalizeTextBlock(visibleText),
    labels,
  };
};

const extractTextFromContent = (content: unknown) => {
  if (typeof content === "string") {
    return extractSystemLabels(content);
  }

  if (!Array.isArray(content)) {
    return { text: "", labels: [] as string[] };
  }

  const texts: string[] = [];
  const labels: string[] = [];
  for (const item of content) {
    if (typeof item === "string") {
      const extracted = extractSystemLabels(item);
      texts.push(extracted.text);
      labels.push(...extracted.labels);
      continue;
    }
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const contentItem = item as MessageContentItem;
    if (typeof contentItem.text === "string") {
      const extracted = extractSystemLabels(contentItem.text);
      texts.push(extracted.text);
      labels.push(...extracted.labels);
    }
  }
  return {
    text: texts
      .filter((text) => text.length > 0)
      .join("\n\n")
      .trim(),
    labels,
  };
};

const createEntryId = (() => {
  let counter = 0;
  return (prefix: string) => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
})();

export const parseCodexSession = (
  content: string,
): {
  entries: CodexConversationEntry[];
  turns: CodexSessionTurn[];
  metaEvents: CodexMetaEvent[];
  sessionMeta: CodexSessionMeta;
} => {
  const entries: CodexConversationEntry[] = [];
  const turns: CodexSessionTurn[] = [];
  const metaEvents: CodexMetaEvent[] = [];
  let sessionMeta: CodexSessionMeta = {
    sessionUuid: null,
    cwd: null,
    instructions: null,
    originator: null,
    cliVersion: null,
    timestamp: null,
  };

  let turnCounter = 0;
  const createTurn = (): CodexSessionTurn => {
    const turn: CodexSessionTurn = {
      id: `turn-${++turnCounter}`,
      userMessage: null,
      assistantMessages: [],
      reasonings: [],
      toolCalls: [],
      toolResults: [],
      metaEvents: [],
    };
    turns.push(turn);
    return turn;
  };

  const getCurrentTurn = (): CodexSessionTurn => {
    if (turns.length === 0) {
      return createTurn();
    }
    return turns[turns.length - 1] ?? createTurn();
  };

  const startNewTurn = (): CodexSessionTurn => {
    return createTurn();
  };

  const callIdToTurn = new Map<string, CodexSessionTurn>();
  const extractedSystemLabels: string[] = [];
  const lastMessageText: Record<"user" | "assistant", string | null> = {
    user: null,
    assistant: null,
  };

  const appendSystemLabels = (labels: string[]) => {
    for (const label of labels) {
      if (!extractedSystemLabels.includes(label)) {
        extractedSystemLabels.push(label);
      }
    }
  };

  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    let parsed: CodexLogLine;
    try {
      parsed = JSON.parse(line) as CodexLogLine;
    } catch (error) {
      console.warn("Failed to parse Codex log line", { error, line });
      continue;
    }

    const timestamp =
      typeof parsed.timestamp === "string" ? parsed.timestamp : null;

    if (parsed.type === "session_meta") {
      if (parsed.payload && typeof parsed.payload === "object") {
        const payload = parsed.payload as Partial<{
          id: string;
          cwd: string;
          instructions: string;
          originator: string;
          cli_version: string;
          timestamp: string;
        }>;
        const idValue = payload.id;
        const cwdValue = payload.cwd;
        const instructionsValue = payload.instructions;
        const originatorValue = payload.originator;
        const cliVersionValue = payload.cli_version;
        const timestampValue = payload.timestamp;
        sessionMeta = {
          sessionUuid:
            typeof idValue === "string" ? idValue : sessionMeta.sessionUuid,
          cwd: typeof cwdValue === "string" ? cwdValue : sessionMeta.cwd,
          instructions:
            typeof instructionsValue === "string"
              ? instructionsValue
              : sessionMeta.instructions,
          originator:
            typeof originatorValue === "string"
              ? originatorValue
              : sessionMeta.originator,
          cliVersion:
            typeof cliVersionValue === "string"
              ? cliVersionValue
              : sessionMeta.cliVersion,
          timestamp:
            typeof timestampValue === "string" ? timestampValue : timestamp,
        };
      }
      continue;
    }

    if (parsed.type === "turn_context") {
      const metaEvent: CodexMetaEvent = {
        type: "turn_context",
        timestamp,
        context: parsed.payload ?? null,
      };
      metaEvents.push(metaEvent);
      const currentTurn = turns.length > 0 ? getCurrentTurn() : null;
      if (currentTurn) {
        currentTurn.metaEvents.push(metaEvent);
      }
      continue;
    }

    if (parsed.type === "response_item") {
      const payload = parsed.payload as
        | ResponseMessagePayload
        | ResponseReasoningPayload
        | ResponseFunctionCallPayload
        | ResponseFunctionCallOutputPayload
        | undefined;

      if (!payload || typeof payload !== "object") {
        continue;
      }

      switch ((payload as { type?: unknown }).type) {
        case "message": {
          const messagePayload = payload as ResponseMessagePayload;
          const role =
            messagePayload.role === "assistant" ? "assistant" : "user";
          const extracted = extractTextFromContent(messagePayload.content);
          appendSystemLabels(extracted.labels);
          const normalized = extracted.text.trim();

          if (role === "user") {
            if (normalized.length === 0) {
              const currentTurn =
                turns.length > 0 ? turns[turns.length - 1] : null;
              if (!currentTurn || currentTurn.userMessage) {
                startNewTurn();
              }
              break;
            }
          } else if (normalized.length === 0) {
            break;
          }

          if (lastMessageText[role] === normalized) {
            break;
          }

          const entryId = createEntryId(role);
          entries.push({
            type: role,
            id: entryId,
            timestamp,
            text: normalized,
            source: "response_item",
          });
          const message: CodexMessage = {
            id: entryId,
            text: normalized,
            timestamp,
            source: "response_item",
          };
          if (role === "user") {
            const currentTurn =
              turns.length > 0 ? turns[turns.length - 1] : null;
            if (!currentTurn || currentTurn.userMessage) {
              const turn = startNewTurn();
              turn.userMessage = message;
            } else {
              currentTurn.userMessage = message;
            }
          } else {
            const turn = getCurrentTurn();
            turn.assistantMessages.push(message);
          }
          lastMessageText[role] = normalized;
          break;
        }
        case "reasoning": {
          const reasoningPayload = payload as ResponseReasoningPayload;
          const summaryArray = Array.isArray(reasoningPayload.summary)
            ? reasoningPayload.summary
            : [];
          const summaryText =
            summaryArray
              .map((item) => {
                if (typeof item === "string") return item;
                if (item && typeof item === "object" && "text" in item) {
                  const value = (item as { text?: unknown }).text;
                  return typeof value === "string" ? value : null;
                }
                return null;
              })
              .filter((value): value is string => value !== null)
              .join("\n\n") || null;

          const reasoningEntry: CodexConversationEntry = {
            type: "assistant-reasoning",
            id: createEntryId("reasoning"),
            timestamp,
            summary: summaryText,
            text: null,
            encrypted: typeof reasoningPayload.encrypted_content === "string",
          };
          entries.push(reasoningEntry);
          const turn = getCurrentTurn();
          const reasoning: CodexReasoning = {
            id: reasoningEntry.id,
            summary: summaryText,
            text: null,
            timestamp,
            encrypted: reasoningEntry.encrypted ?? false,
          };
          turn.reasonings.push(reasoning);
          break;
        }
        case "function_call": {
          const callPayload = payload as ResponseFunctionCallPayload;
          const name =
            typeof callPayload.name === "string" ? callPayload.name : "unknown";
          const args =
            typeof callPayload.arguments === "string"
              ? callPayload.arguments
              : callPayload.arguments
                ? JSON.stringify(callPayload.arguments)
                : null;
          const callId =
            typeof callPayload.call_id === "string"
              ? callPayload.call_id
              : null;
          const entryId = createEntryId("tool");
          entries.push({
            type: "tool-call",
            id: entryId,
            timestamp,
            name,
            arguments: args,
            callId,
          });
          const turn = getCurrentTurn();
          const toolCall: CodexToolCall = {
            id: entryId,
            name,
            arguments: args,
            callId,
            timestamp,
          };
          turn.toolCalls.push(toolCall);
          if (callId) {
            callIdToTurn.set(callId, turn);
          }
          break;
        }
        case "function_call_output": {
          const outputPayload = payload as ResponseFunctionCallOutputPayload;
          const callId =
            typeof outputPayload.call_id === "string"
              ? outputPayload.call_id
              : null;
          const output =
            typeof outputPayload.output === "string"
              ? outputPayload.output
              : outputPayload.output
                ? JSON.stringify(outputPayload.output)
                : null;
          const entryId = createEntryId("tool-result");
          entries.push({
            type: "tool-result",
            id: entryId,
            timestamp,
            callId,
            output,
          });
          const mappedTurn = callId ? callIdToTurn.get(callId) : undefined;
          const callTurn = mappedTurn ?? getCurrentTurn();
          const toolResult: CodexToolResult = {
            id: entryId,
            callId,
            output,
            timestamp,
          };
          callTurn.toolResults.push(toolResult);
          break;
        }
        default:
          break;
      }

      continue;
    }

    if (parsed.type === "event_msg") {
      const payload = parsed.payload as EventMessagePayload | undefined;
      if (!payload || typeof payload !== "object") {
        continue;
      }

      if (payload.type === "agent_reasoning") {
        const rawText =
          typeof payload.text === "string"
            ? payload.text
            : typeof payload.message === "string"
              ? payload.message
              : null;
        if (rawText) {
          const extracted = extractSystemLabels(rawText);
          appendSystemLabels(extracted.labels);
          const text = extracted.text;
          if (!text) {
            continue; // Skip if text is empty after filtering
          }
          const entryId = createEntryId("reasoning");
          entries.push({
            type: "assistant-reasoning",
            id: entryId,
            timestamp,
            summary: text,
            text,
            encrypted: false,
          });
          const turn = getCurrentTurn();
          turn.reasonings.push({
            id: entryId,
            summary: text,
            text,
            timestamp,
            encrypted: false,
          });
        }
        continue;
      }

      if (payload.type === "agent_message" || payload.type === "user_message") {
        const rawText =
          typeof payload.text === "string"
            ? payload.text
            : typeof payload.message === "string"
              ? payload.message
              : null;
        if (rawText) {
          const extracted = extractSystemLabels(rawText);
          appendSystemLabels(extracted.labels);
          const text = extracted.text;
          if (!text) {
            continue; // Skip if text is empty after filtering
          }
          const role = payload.type === "agent_message" ? "assistant" : "user";
          const currentTurn = turns.length > 0 ? getCurrentTurn() : null;
          const normalized = text.trim();
          if (normalized.length === 0) {
            continue;
          }
          if (lastMessageText[role] === normalized) {
            continue;
          }

          if (role === "user") {
            const duplicate = currentTurn?.userMessage
              ? currentTurn.userMessage.text.trim() === normalized
              : false;
            if (duplicate) {
              continue;
            }
            const entryId = createEntryId(role);
            entries.push({
              type: role,
              id: entryId,
              timestamp,
              text: normalized,
              source: "event_msg",
            });
            const message: CodexMessage = {
              id: entryId,
              text: normalized,
              timestamp,
              source: "event_msg",
            };
            if (currentTurn && !currentTurn.userMessage) {
              currentTurn.userMessage = message;
            } else {
              const turn = startNewTurn();
              turn.userMessage = message;
            }
          } else {
            const turn = currentTurn ?? startNewTurn();
            const assistantDuplicate = turn.assistantMessages.some(
              (msg) => msg.text.trim() === normalized,
            );
            if (assistantDuplicate) {
              continue;
            }
            const entryId = createEntryId(role);
            entries.push({
              type: role,
              id: entryId,
              timestamp,
              text: normalized,
              source: "event_msg",
            });
            const message: CodexMessage = {
              id: entryId,
              text: normalized,
              timestamp,
              source: "event_msg",
            };
            turn.assistantMessages.push(message);
          }
          lastMessageText[role] = normalized;
        }
        continue;
      }

      if (payload.type === "token_count") {
        const info = (payload as { info?: unknown }).info ?? null;
        const metaEvent: CodexMetaEvent = {
          type: "token_count",
          timestamp,
          info,
        };
        metaEvents.push(metaEvent);
        const currentTurn = turns.length > 0 ? getCurrentTurn() : null;
        if (currentTurn) {
          currentTurn.metaEvents.push(metaEvent);
        }
        continue;
      }

      if (typeof payload.type === "string") {
        const text =
          typeof payload.text === "string"
            ? payload.text
            : typeof payload.message === "string"
              ? payload.message
              : null;
        const entryId = createEntryId("event");
        entries.push({
          type: "system",
          id: entryId,
          timestamp,
          subtype: payload.type,
          text,
        });
      }
    }
  }

  if (extractedSystemLabels.length > 0) {
    const combinedInstructions = [
      sessionMeta.instructions,
      ...extractedSystemLabels,
    ].filter((value): value is string => {
      return typeof value === "string" && value.trim().length > 0;
    });
    sessionMeta.instructions = combinedInstructions.join("\n\n");
  }

  return {
    entries,
    turns,
    metaEvents,
    sessionMeta,
  };
};
