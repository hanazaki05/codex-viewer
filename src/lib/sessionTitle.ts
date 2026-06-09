import type { ParsedCommand } from "../server/service/parseCommandXml";
import type { Session } from "../server/service/types";

export const firstCommandToTitle = (firstCommand: ParsedCommand) => {
  switch (firstCommand.kind) {
    case "command":
      if (firstCommand.commandArgs === undefined) {
        return firstCommand.commandName;
      }
      return `${firstCommand.commandName} ${firstCommand.commandArgs}`;
    case "local-command":
      return firstCommand.stdout;
    case "text":
      return firstCommand.content;
    default:
      firstCommand satisfies never;
      throw new Error("Invalid first command");
  }
};

export const sessionToTitle = (session: Session, fallback: string) => {
  const codexAppTitle = session.meta.title?.trim();
  if (codexAppTitle) {
    return codexAppTitle;
  }

  if (session.meta.firstCommand !== null) {
    return firstCommandToTitle(session.meta.firstCommand);
  }

  return fallback;
};
