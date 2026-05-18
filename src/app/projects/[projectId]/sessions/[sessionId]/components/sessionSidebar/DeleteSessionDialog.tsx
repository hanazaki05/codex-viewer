"use client";

import type { FC } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDeleteSession } from "../../hooks/useDeleteSession";

type DeleteSessionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  sessionId: string;
  sessionTitle: string;
  projectName?: string;
  projectPath?: string;
  isLastSessionInProject?: boolean;
  deletionDisabledReason?: string | null;
  onSuccess?: (result: { deletedProject: boolean }) => void;
};

export const DeleteSessionDialog: FC<DeleteSessionDialogProps> = ({
  open,
  onOpenChange,
  projectId,
  sessionId,
  sessionTitle,
  projectName,
  projectPath,
  isLastSessionInProject = false,
  deletionDisabledReason,
  onSuccess,
}) => {
  const [isConfirmingProjectDeletion, setIsConfirmingProjectDeletion] =
    useState(false);
  const deleteSession = useDeleteSession();
  const isDeleteDisabled =
    typeof deletionDisabledReason === "string" &&
    deletionDisabledReason.trim().length > 0;
  const shouldOfferProjectDeletion = isLastSessionInProject;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setIsConfirmingProjectDeletion(false);
    }
    onOpenChange(nextOpen);
  };

  const executeDelete = (deleteProject: boolean) => {
    if (isDeleteDisabled) {
      toast.error(deletionDisabledReason);
      return;
    }

    deleteSession.mutate(
      { projectId, sessionId, deleteProject },
      {
        onSuccess: (result) => {
          toast.success(
            result.deletedProject
              ? "Session and project deleted successfully"
              : "Session deleted successfully",
          );
          setIsConfirmingProjectDeletion(false);
          onOpenChange(false);
          onSuccess?.({ deletedProject: result.deletedProject });
        },
        onError: (error) => {
          toast.error(error.message);
        },
      },
    );
  };

  const handleDelete = () => {
    if (isDeleteDisabled) {
      toast.error(deletionDisabledReason);
      return;
    }

    if (shouldOfferProjectDeletion) {
      setIsConfirmingProjectDeletion(true);
      return;
    }

    executeDelete(false);
  };

  const deleteButtonLabel = deleteSession.isPending
    ? "Deleting..."
    : "Delete Session";
  const projectLabel = projectName ?? projectPath ?? "this project";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>
            {isConfirmingProjectDeletion ? "Delete Project?" : "Delete Session"}
          </DialogTitle>
          {isConfirmingProjectDeletion ? (
            <DialogDescription className="break-words">
              This is the last session in:
              <span className="block mt-2 break-all text-foreground font-medium">
                {projectLabel}
              </span>
              <span className="block mt-3">
                Do you also want to delete the project directory?
              </span>
              {projectPath ? (
                <span className="block mt-2 break-all font-mono text-xs">
                  {projectPath}
                </span>
              ) : null}
            </DialogDescription>
          ) : (
            <DialogDescription className="break-words line-clamp-10">
              This action permanently deletes the session:
              <span className="block mt-2 break-all text-foreground font-medium">
                {sessionTitle}
              </span>
            </DialogDescription>
          )}
        </DialogHeader>

        {isDeleteDisabled ? (
          <p className="text-sm text-destructive">{deletionDisabledReason}</p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={deleteSession.isPending}
          >
            Cancel
          </Button>
          {isConfirmingProjectDeletion ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => executeDelete(false)}
                disabled={deleteSession.isPending || isDeleteDisabled}
              >
                {deleteSession.isPending
                  ? "Deleting..."
                  : "Delete Session Only"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => executeDelete(true)}
                disabled={deleteSession.isPending || isDeleteDisabled}
              >
                {deleteSession.isPending
                  ? "Deleting..."
                  : "Delete Session and Project"}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteSession.isPending || isDeleteDisabled}
            >
              {deleteButtonLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
