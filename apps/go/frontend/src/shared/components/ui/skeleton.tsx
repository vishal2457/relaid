import { cn } from "../../utils/cn.utils";
import React from "react";
function Skeleton({
  className,
  disableAnimation = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { disableAnimation?: boolean }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-primary/10",
        className,
        disableAnimation && "animate-none"
      )}
      {...props}
    />
  );
}

export { Skeleton };
