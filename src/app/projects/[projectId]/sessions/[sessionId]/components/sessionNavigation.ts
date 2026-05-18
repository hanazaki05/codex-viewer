import type { Session } from "@/server/service/types";

export const getNextSessionRoute = ({
  currentSessionId,
  projectId,
  sessions,
}: {
  currentSessionId: string;
  projectId: string;
  sessions: Session[];
}) => {
  const currentIndex = sessions.findIndex((session) => {
    return session.id === currentSessionId;
  });

  const remainingSessions = sessions.filter((session) => {
    return session.id !== currentSessionId;
  });

  if (remainingSessions.length === 0) {
    return `/projects/${projectId}`;
  }

  if (currentIndex === -1) {
    return `/projects/${projectId}/sessions/${encodeURIComponent(
      remainingSessions[0]?.id ?? "",
    )}`;
  }

  const nextSession =
    remainingSessions[currentIndex] ?? remainingSessions[currentIndex - 1];

  if (!nextSession) {
    return `/projects/${projectId}`;
  }

  return `/projects/${projectId}/sessions/${encodeURIComponent(nextSession.id)}`;
};
