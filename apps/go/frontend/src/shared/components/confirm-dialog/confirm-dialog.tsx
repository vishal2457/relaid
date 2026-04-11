import { Button } from "../ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../ui/alert-dialog";
import { cn } from "../../utils/cn.utils";
import { ButtonLoader } from "../loader/button.loader";

interface ConfirmDialogProps {
  title: React.ReactNode;
  disabled?: boolean;
  desc: React.JSX.Element | string;
  cancelBtnText?: string;
  confirmText?: React.ReactNode;
  destructive?: boolean;
  handleConfirm: () => void;
  isLoading?: boolean;
  className?: string;
  children?: React.ReactNode;
  trigger: React.ReactNode;
  open?: boolean;
  setOpen?: (open: boolean) => void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const {
    title,
    desc,
    children,
    className,
    confirmText,
    cancelBtnText,
    destructive,
    isLoading,
    disabled = false,
    handleConfirm,
    trigger,
    open,
    setOpen,
  } = props;
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className={cn(className && className)}>
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{desc}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>
            {cancelBtnText ?? "Cancel"}
          </AlertDialogCancel>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={disabled || isLoading}
          >
            {isLoading ? <ButtonLoader /> : confirmText ?? "Continue"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
