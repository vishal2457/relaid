import { Loader2 } from "lucide-react";
import { cn } from "../../utils/cn.utils";

export const SpinnerLoader = ({ className }: { className?: string }) => {
  return (
    <Loader2 className={cn("h-4 w-4 opacity-50 animate-spin", className)} />
  );
};
