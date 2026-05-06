import { ButtonLoader } from "../loader/button.loader";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

export const UpdateDialog = ({
  open,
  setOpen,
  handleUpdate,
  isUpdating,
  currentVersion,
  latestVersion,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  handleUpdate: () => void;
  isUpdating: boolean;
  currentVersion: string;
  latestVersion: string;
}) => {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="fixed bottom-4 left-4 top-auto translate-x-0 translate-y-0 max-w-sm "
        hideOverlay
      >
        <DialogHeader>
          <DialogTitle>New update is available</DialogTitle>
          <DialogDescription>
            Relaid {latestVersion} is available. You are currently on{" "}
            {currentVersion}. Update now to install the latest desktop build.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose>
            <Button variant="secondary">Close</Button>
          </DialogClose>
          <Button onClick={handleUpdate} disabled={isUpdating}>
            {isUpdating ? <ButtonLoader space="small" /> : "Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
