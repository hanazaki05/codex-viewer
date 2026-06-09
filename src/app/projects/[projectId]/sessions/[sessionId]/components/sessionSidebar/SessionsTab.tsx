"use client";

import { useAtomValue } from "jotai";
import { MessageSquareIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import type { FC } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatShortDisplayDate } from "@/lib/date/format";
import { cn } from "@/lib/utils";
import type { Session } from "../../../../../../../server/service/types";
import { NewChatModal } from "../../../../components/newChat/NewChatModal";
import { sessionToTitle } from "../../../../services/firstCommandToTitle";
import { aliveTasksAtom } from "../../store/aliveTasksAtom";

export const SessionsTab: FC<{
  sessions: Session[];
  currentSessionId: string;
  projectId: string;
}> = ({ sessions, currentSessionId, projectId }) => {
  const aliveTasks = useAtomValue(aliveTasksAtom);

  // Sort sessions: Running > Paused > Others, then by lastModifiedAt (newest first)
  const sortedSessions = [...sessions].sort((a, b) => {
    const findTask = (session: Session) => {
      if (session.sessionUuid) {
        const byUuid = aliveTasks.find(
          (task) => task.sessionUuid === session.sessionUuid,
        );
        if (byUuid) return byUuid;
      }
      return aliveTasks.find((task) => task.sessionId === session.id);
    };

    const aTask = findTask(a);
    const bTask = findTask(b);

    const aStatus = aTask?.status;
    const bStatus = bTask?.status;

    // Define priority: running = 0, paused = 1, others = 2
    const getPriority = (status: string | undefined) => {
      if (status === "running") return 0;
      if (status === "paused") return 1;
      return 2;
    };

    const aPriority = getPriority(aStatus);
    const bPriority = getPriority(bStatus);

    // First sort by priority
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    // Then sort by lastModifiedAt (newest first)
    const aTime = a.meta.lastModifiedAt
      ? new Date(a.meta.lastModifiedAt).getTime()
      : 0;
    const bTime = b.meta.lastModifiedAt
      ? new Date(b.meta.lastModifiedAt).getTime()
      : 0;
    return bTime - aTime;
  });

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-sidebar-border p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-lg">Sessions</h2>
          <NewChatModal
            projectId={projectId}
            trigger={
              <Button size="sm" variant="outline" className="gap-1.5">
                <PlusIcon className="w-3.5 h-3.5" />
                New
              </Button>
            }
          />
        </div>
        <p className="text-xs text-sidebar-foreground/70">
          {sessions.length} total
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {sortedSessions.map((session) => {
          const isActive = session.id === currentSessionId;
          const title = sessionToTitle(session, session.id);

          const aliveTask = aliveTasks.find((task) => {
            if (
              session.sessionUuid &&
              task.sessionUuid === session.sessionUuid
            ) {
              return true;
            }
            return task.sessionId === session.id;
          });
          const isRunning = aliveTask?.status === "running";
          const isWaiting = aliveTask?.status === "waiting";

          return (
            <Link
              key={session.id}
              href={`/projects/${projectId}/sessions/${encodeURIComponent(
                session.id,
              )}`}
              className={cn(
                "block rounded-lg p-2.5 transition-all duration-200 hover:bg-blue-50/60 hover:border-blue-300/60 hover:shadow-sm border border-sidebar-border/40 bg-sidebar/30",
                isActive &&
                  "bg-blue-100 border-blue-400 shadow-md ring-1 ring-blue-200/50 hover:bg-blue-100 hover:border-blue-400",
              )}
            >
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-medium line-clamp-2 leading-tight text-sidebar-foreground flex-1">
                    {title}
                  </h3>
                  {(isRunning || isWaiting) && (
                    <Badge
                      variant={isRunning ? "default" : "secondary"}
                      className={cn(
                        "text-xs",
                        isRunning && "bg-green-500 text-white",
                        isWaiting && "bg-yellow-500 text-white",
                      )}
                    >
                      {isRunning ? "Running" : "Waiting"}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-xs text-sidebar-foreground/70">
                    <MessageSquareIcon className="w-3 h-3" />
                    <span>{session.meta.messageCount}</span>
                  </div>
                  {session.meta.lastModifiedAt && (
                    <span className="text-xs text-sidebar-foreground/60">
                      {formatShortDisplayDate(session.meta.lastModifiedAt)}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};
