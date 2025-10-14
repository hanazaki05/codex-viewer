"use client";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  CodexSessionTurn,
  CodexToolCall,
  CodexToolResult,
} from "@/server/service/types";

type ToolPair = {
  call: CodexToolCall;
  result?: CodexToolResult;
};

const formatTimestamp = (timestamp: string | null) => {
  if (!timestamp) return "";
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return timestamp;
  }
};

const formatText = (value: string | null | undefined) => {
  if (!value) return "";
  return value.trim();
};

const UserMessage = ({
  text,
  timestamp,
}: {
  text: string;
  timestamp: string | null;
}) => {
  return (
    <Card className="p-1 max-w-4xl bg-gray-50/50 dark:bg-gray-900/20 border-gray-200/50 dark:border-gray-800/50">
      <CardContent className="p-2">
        <pre className="whitespace-pre-wrap break-words text-sm font-mono">
          {text}
        </pre>
        {timestamp && (
          <div className="text-xs text-muted-foreground mt-2">
            {formatTimestamp(timestamp)}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const AssistantMessage = ({
  text,
  timestamp,
}: {
  text: string;
  timestamp: string | null;
}) => {
  return (
    <div className="max-w-4xl">
      <pre className="whitespace-pre-wrap break-words text-sm font-mono">
        {text}
      </pre>
      {timestamp && (
        <div className="text-xs text-muted-foreground mt-2">
          {formatTimestamp(timestamp)}
        </div>
      )}
    </div>
  );
};

const pairToolCalls = (turn: CodexSessionTurn): ToolPair[] => {
  const resultByCallId = new Map<string, CodexToolResult>();
  for (const result of turn.toolResults) {
    if (result.callId) {
      resultByCallId.set(result.callId, result);
    }
  }

  const paired: ToolPair[] = turn.toolCalls.map((call) => {
    const result = call.callId ? resultByCallId.get(call.callId) : undefined;
    if (call.callId && result) {
      resultByCallId.delete(call.callId);
    }
    return { call, result };
  });

  // Any leftover results without a matching call
  for (const result of turn.toolResults) {
    if (result.callId && resultByCallId.has(result.callId)) {
      paired.push({
        call: {
          id: `${result.id}-orphan`,
          name: "(unknown)",
          arguments: null,
          callId: result.callId,
          timestamp: result.timestamp,
        },
        result,
      });
      resultByCallId.delete(result.callId);
    }
  }

  return paired;
};

const formatToolName = (name: string) => {
  // Remove tool_ prefix if it exists
  const cleanName = name.replace(/^tool_/, "");
  // Convert snake_case to Title Case
  return cleanName
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const JsonViewer = ({ data }: { data: string | null }) => {
  if (!data) return <span className="text-muted-foreground">null</span>;

  try {
    const parsed = JSON.parse(data);
    return (
      <pre className="text-xs font-mono overflow-x-auto">
        {JSON.stringify(parsed, null, 2)}
      </pre>
    );
  } catch {
    // If it's not valid JSON, display as is
    return <pre className="text-xs font-mono overflow-x-auto">{data}</pre>;
  }
};

const ToolCallCard = ({
  call,
  result,
  variant = "default",
}: {
  call: CodexToolCall;
  result?: CodexToolResult;
  variant?: "default" | "nested";
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [isResultOpen, setIsResultOpen] = useState(false);

  useEffect(() => {
    if (!isExpanded) {
      setIsInputOpen(false);
      setIsResultOpen(false);
    }
  }, [isExpanded]);

  const wrapperClassName = cn(
    "w-full bg-blue-50/50 dark:bg-blue-950/10 border-blue-200/50 dark:border-blue-800/50 px-3 !py-3",
    variant === "default" ? "max-w-4xl" : "max-w-full",
    variant === "nested" && "px-2 !py-2",
  );

  const contentClassName = cn(
    "px-4 !py-2",
    variant === "nested" && "px-3 !py-1.5",
  );

  return (
    <Card className={wrapperClassName}>
      <CardContent className={contentClassName}>
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex w-full items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-200 transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span>Tool Use</span>
          <Badge
            variant="secondary"
            className="text-xs text-blue-600 dark:text-blue-400 bg-transparent border-blue-200 dark:border-blue-800"
          >
            {formatToolName(call.name)}
          </Badge>
        </button>

        {isExpanded && (
          <div className="mt-3 space-y-3 text-xs">
            <div className="text-muted-foreground">
              Tool execution with ID: toolu_
              {call.callId?.substring(0, 20) || "unknown"}...
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => setIsInputOpen((prev) => !prev)}
                className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left py-1"
              >
                {isInputOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Input Parameters
              </button>
              {isInputOpen && (
                <div className="mt-2 pl-4">
                  <JsonViewer data={call.arguments} />
                </div>
              )}
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => setIsResultOpen((prev) => !prev)}
                className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left py-1"
              >
                {isResultOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Tool Result
              </button>
              {isResultOpen && (
                <div className="mt-2 pl-4">
                  {result ? (
                    <JsonViewer data={result.output} />
                  ) : (
                    <span className="text-muted-foreground">
                      No result available
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const ToolCallGroup = ({ pairs }: { pairs: ToolPair[] }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const toolNames = Array.from(
    new Set(pairs.map((pair) => formatToolName(pair.call.name))),
  );
  const previewNames = toolNames.slice(0, 3).join(", ");
  const remainingCount = toolNames.length > 3 ? toolNames.length - 3 : 0;

  return (
    <Card className="max-w-4xl bg-blue-100/40 dark:bg-blue-950/20 border-blue-200/60 dark:border-blue-800/60 !py-3">
      <CardContent className="px-4 !py-2 space-y-2">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex w-full items-center gap-2 text-sm font-semibold text-blue-800 hover:text-blue-900 dark:text-blue-200 dark:hover:text-blue-100 transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span>Tool Uses</span>
          <Badge
            variant="secondary"
            className="text-xs bg-transparent border-blue-200/80 dark:border-blue-800/80 text-blue-700 dark:text-blue-300"
          >
            {pairs.length}
          </Badge>
          <span className="ml-auto text-xs text-muted-foreground truncate">
            {previewNames}
            {remainingCount > 0 ? `, +${remainingCount} more` : ""}
          </span>
        </button>

        {isExpanded && (
          <div className="space-y-3">
            {pairs.map(({ call, result }) => (
              <ToolCallCard
                key={`${call.id}-${result?.id ?? "result"}`}
                call={call}
                result={result}
                variant="nested"
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export const ConversationList = ({ turns }: { turns: CodexSessionTurn[] }) => {
  if (turns.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No conversation entries yet. Send a message to Codex to begin.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {turns.map((turn) => {
        const toolPairs = pairToolCalls(turn);
        const singlePair = toolPairs.length === 1 ? toolPairs[0] : null;

        return (
          <section key={turn.id} className="flex flex-col gap-3">
            {turn.userMessage ? (
              <UserMessage
                text={formatText(turn.userMessage.text)}
                timestamp={turn.userMessage.timestamp}
              />
            ) : null}

            {/* Thought process (assistant reasoning) intentionally hidden per Codex UX request */}

            {toolPairs.length > 1 ? (
              <ToolCallGroup pairs={toolPairs} />
            ) : singlePair ? (
              <ToolCallCard call={singlePair.call} result={singlePair.result} />
            ) : null}

            {turn.assistantMessages.length > 0 ? (
              <div className="flex flex-col gap-4">
                {turn.assistantMessages.map((message) => (
                  <AssistantMessage
                    key={message.id}
                    text={formatText(message.text)}
                    timestamp={message.timestamp}
                  />
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
};
