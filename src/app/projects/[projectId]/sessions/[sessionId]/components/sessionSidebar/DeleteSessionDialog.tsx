"use client";

import type { FC } from "react";
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
  deletionDisabledReason?: string | null;
  onSuccess?: () => void;
};

export const DeleteSessionDialog: FC<DeleteSessionDialogProps> = ({
  open,
  onOpenChange,
  projectId,
  sessionId,
  sessionTitle,
  deletionDisabledReason,
  onSuccess,
}) => {
  const deleteSession = useDeleteSession();
  const isDeleteDisabled =
    typeof deletionDisabledReason === "string" &&
    deletionDisabledReason.trim().length > 0;

  const handleDelete = () => {
    if (isDeleteDisabled) {
      toast.error(deletionDisabledReason);
      return;
    }

    deleteSession.mutate(
      { projectId, sessionId },
      {
        onSuccess: () => {
          toast.success("Session deleted successfully");
          onOpenChange(false);
          onSuccess?.();
        },
        onError: (error) => {
          toast.error(error.message);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Delete Session</DialogTitle>
          <DialogDescription className="break-words line-clamp-10">
            This action permanently deletes the session:
            <span className="block mt-2 break-all text-foreground font-medium">
              {sessionTitle}
            </span>
          </DialogDescription>
        </DialogHeader>

        {isDeleteDisabled ? (
          <p className="text-sm text-destructive">{deletionDisabledReason}</p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteSession.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteSession.isPending || isDeleteDisabled}
          >
            {deleteSession.isPending ? "Deleting..." : "Delete Session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
