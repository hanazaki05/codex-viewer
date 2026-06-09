"use client";

import { useMutation } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  CopyIcon,
  ExternalLinkIcon,
  GitCompareIcon,
  LoaderIcon,
  MenuIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FC } from "react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTaskNotifications } from "@/hooks/useTaskNotifications";
import { Badge } from "../../../../../../components/ui/badge";
import { honoClient } from "../../../../../../lib/api/client";
import { useProject } from "../../../hooks/useProject";
import { firstCommandToTitle } from "../../../services/firstCommandToTitle";
import { useAliveTask } from "../hooks/useAliveTask";
import { useSession } from "../hooks/useSession";
import { ConversationList } from "./conversationList/ConversationList";
import { DiffModal } from "./diffModal";
import { ResumeChat } from "./resumeChat/ResumeChat";
import { getNextSessionRoute } from "./sessionNavigation";
import { DeleteSessionDialog } from "./sessionSidebar/DeleteSessionDialog";
import { SessionSidebar } from "./sessionSidebar/SessionSidebar";

export const SessionPageContent: FC<{
  projectId: string;
  sessionId: string;
}> = ({ projectId, sessionId }) => {
  const router = useRouter();
  const { session, turns, sessionMeta } = useSession(projectId, sessionId);

  const abortTask = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await honoClient.api.tasks.abort.$post({
        json: { sessionId },
      });

      if (!response.ok) {
        throw new Error(response.statusText);
      }

      return response.json();
    },
  });

  const { isRunningTask, isPausedTask } = useAliveTask(
    sessionId,
    session.sessionUuid,
  );

  // Set up task completion notifications
  useTaskNotifications(isRunningTask);

  const [previousTurnLength, setPreviousTurnLength] = useState(0);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasInitialScrollRef = useRef(false);
  const sessionTitle =
    session.meta.firstCommand !== null
      ? firstCommandToTitle(session.meta.firstCommand)
      : sessionId;
  const isDeleteDisabled = isRunningTask || isPausedTask;
  const deleteDisabledReason = isRunningTask
    ? "Cannot delete while a conversation is running."
    : isPausedTask
      ? "Cannot delete while Codex is waiting for your input."
      : null;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior });
    }
  }, []);

  const scrollToTop = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const handleCopySessionId = async () => {
    const valueToCopy = session.sessionUuid ?? sessionId;

    try {
      await navigator.clipboard.writeText(valueToCopy);
      toast.success("セッションIDをコピーしました");
    } catch (error) {
      console.error("Failed to copy session id:", error);
      toast.error("セッションIDのコピーに失敗しました");
    }
  };

  // 初期表示はログの最下部へスクロール
  useEffect(() => {
    if (!hasInitialScrollRef.current && turns.length > 0) {
      scrollToBottom("auto");
      hasInitialScrollRef.current = true;
      setPreviousTurnLength(turns.length);
    }
  }, [turns, scrollToBottom]);

  // 自動スクロール処理
  useEffect(() => {
    if (
      (isRunningTask || isPausedTask) &&
      turns.length !== previousTurnLength
    ) {
      setPreviousTurnLength(turns.length);
      scrollToBottom();
    }
  }, [turns, isRunningTask, isPausedTask, previousTurnLength, scrollToBottom]);

  return (
    <div className="flex h-screen max-h-screen overflow-hidden">
      <SessionSidebar
        currentSessionId={sessionId}
        projectId={projectId}
        isMobileOpen={isMobileSidebarOpen}
        onMobileOpenChange={setIsMobileSidebarOpen}
        fallback={<SessionSidebarFallback />}
      />

      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <header className="px-2 sm:px-3 py-2 sm:py-3 sticky top-0 z-10 bg-background w-full flex-shrink-0 min-w-0">
          <div className="space-y-2 sm:space-y-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden flex-shrink-0"
                onClick={() => setIsMobileSidebarOpen(true)}
              >
                <MenuIcon className="w-4 h-4" />
              </Button>
              <h1 className="text-lg sm:text-2xl md:text-3xl font-bold break-all overflow-ellipsis line-clamp-1 px-1 sm:px-5 min-w-0">
                {sessionTitle}
              </h1>
            </div>

            <div className="px-1 sm:px-5 flex flex-wrap items-center gap-1 sm:gap-2">
              {sessionMeta.cwd && (
                <Link
                  href={`/projects/${projectId}`}
                  target="_blank"
                  className="transition-all duration-200"
                >
                  <Badge
                    variant="secondary"
                    className="h-6 sm:h-8 text-xs sm:text-sm flex items-center hover:bg-blue-50/60 hover:border-blue-300/60 hover:shadow-sm transition-all duration-200 cursor-pointer"
                  >
                    <ExternalLinkIcon className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                    {sessionMeta.cwd}
                  </Badge>
                </Link>
              )}
              <div className="flex items-center gap-1 sm:gap-2">
                <Badge
                  variant="secondary"
                  className="h-6 sm:h-8 text-xs sm:text-sm flex items-center gap-1"
                >
                  <span className="font-semibold">sessionId:</span>
                  <span className="font-mono">
                    {session.sessionUuid ?? sessionId}
                  </span>
                </Badge>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 sm:h-8 sm:w-8"
                  onClick={() => {
                    void handleCopySessionId();
                  }}
                  aria-label="セッションIDをコピー"
                >
                  <CopyIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 sm:h-8 sm:w-8 text-destructive hover:text-destructive"
                  disabled={isDeleteDisabled}
                  onClick={() => {
                    setIsDeleteDialogOpen(true);
                  }}
                  aria-label="Delete session"
                  title={deleteDisabledReason ?? "Delete session"}
                >
                  <Trash2Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
              </div>
            </div>

            {isRunningTask && (
              <div className="flex items-center gap-1 sm:gap-2 p-1 bg-primary/10 border border-primary/20 rounded-lg mx-1 sm:mx-5">
                <LoaderIcon className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                <div className="flex-1">
                  <p className="text-xs sm:text-sm font-medium">
                    Conversation is in progress...
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    abortTask.mutate(sessionId);
                  }}
                >
                  <XIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Abort</span>
                </Button>
              </div>
            )}

            {isPausedTask && (
              <div className="flex items-center gap-1 sm:gap-2 p-1 bg-primary/10 border border-primary/20 rounded-lg mx-1 sm:mx-5">
                <div className="flex-1">
                  <p className="text-xs sm:text-sm font-medium">
                    Codex is waiting for your input.
                  </p>
                </div>
              </div>
            )}
          </div>
        </header>

        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto min-h-0 min-w-0 relative"
        >
          <main className="w-full px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 relative z-5 min-w-0">
            <SessionMetaSummary instructions={sessionMeta.instructions} />
            <ConversationList turns={turns} />

            {isRunningTask && (
              <div className="flex justify-start items-center py-8">
                <div className="flex flex-col items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.1s]"></div>
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.2s]"></div>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground font-medium">
                    Codex is processing...
                  </p>
                </div>
              </div>
            )}

            <ResumeChat
              projectId={projectId}
              sessionId={sessionId}
              isPausedTask={isPausedTask}
              isRunningTask={isRunningTask}
            />
          </main>
        </div>
      </div>

      <div className="fixed bottom-24 right-6 flex flex-col gap-2 z-40">
        <Button
          variant="secondary"
          size="icon"
          className="shadow"
          onClick={scrollToTop}
          aria-label="Scroll to top"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="shadow"
          onClick={() => scrollToBottom()}
          aria-label="Scroll to bottom"
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      </div>

      {/* Fixed Diff Button */}
      <Button
        onClick={() => setIsDiffModalOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 z-50"
        size="lg"
      >
        <GitCompareIcon className="w-6 h-6" />
      </Button>

      {/* Diff Modal */}
      <DiffModal
        projectId={projectId}
        isOpen={isDiffModalOpen}
        onOpenChange={setIsDiffModalOpen}
      />
      {isDeleteDialogOpen && (
        <Suspense fallback={null}>
          <ProjectDeleteSessionDialog
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
            projectId={projectId}
            sessionId={sessionId}
            sessionTitle={sessionTitle}
            deletionDisabledReason={deleteDisabledReason}
            onDeletedProject={() => {
              router.replace("/projects");
            }}
            onDeletedSession={(nextRoute) => {
              router.replace(nextRoute);
            }}
          />
        </Suspense>
      )}
    </div>
  );
};

const SessionSidebarFallback = () => {
  return (
    <div className="hidden md:flex h-full">
      <div className="h-full w-12 border-r border-sidebar-border bg-sidebar text-sidebar-foreground" />
    </div>
  );
};

const ProjectDeleteSessionDialog: FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  sessionId: string;
  sessionTitle: string;
  deletionDisabledReason: string | null;
  onDeletedProject: () => void;
  onDeletedSession: (nextRoute: string) => void;
}> = ({
  open,
  onOpenChange,
  projectId,
  sessionId,
  sessionTitle,
  deletionDisabledReason,
  onDeletedProject,
  onDeletedSession,
}) => {
  const {
    data: { project, sessions },
  } = useProject(projectId);

  return (
    <DeleteSessionDialog
      open={open}
      onOpenChange={onOpenChange}
      projectId={projectId}
      sessionId={sessionId}
      sessionTitle={sessionTitle}
      projectName={project.meta.workspaceName}
      projectPath={project.meta.workspacePath}
      isLastSessionInProject={project.meta.sessionCount === 1}
      deletionDisabledReason={deletionDisabledReason}
      onSuccess={({ deletedProject }) => {
        if (deletedProject) {
          onDeletedProject();
          return;
        }

        onDeletedSession(
          getNextSessionRoute({
            currentSessionId: sessionId,
            projectId,
            sessions,
          }),
        );
      }}
    />
  );
};

const SessionMetaSummary = ({
  instructions,
}: {
  instructions: string | null;
}) => {
  const hasInstructions =
    typeof instructions === "string" && instructions.trim().length > 0;

  if (!hasInstructions) {
    return null;
  }

  return (
    <div className="mb-6 flex flex-col gap-4">
      {hasInstructions ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">System Labels</CardTitle>
          </CardHeader>
          <CardContent>
            <details className="whitespace-pre-wrap break-words text-sm font-mono">
              <summary className="cursor-pointer text-sm text-muted-foreground">
                Show system labels
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-words text-sm font-mono">
                {instructions}
              </pre>
            </details>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};
