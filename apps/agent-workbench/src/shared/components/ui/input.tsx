import * as React from "react";

import { cn } from "../../utils/cn.utils";
import { Label } from "./label";
export interface InputProps extends React.ComponentProps<"input"> {
  label?: string;
  containerClassName?: string;
  error?: string;
  suffixButton?: React.ReactNode;
  prefixButton?: React.ReactNode;
  hint?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      label,
      error,
      hint,
      suffixButton,
      prefixButton,
      containerClassName,
      ...props
    },
    ref
  ) => {
    return (
      <div className={cn("w-full", containerClassName)}>
        <Label>{label}</Label>
        <div
          className={cn((suffixButton || prefixButton) && "flex items-center")}
        >
          {prefixButton ? prefixButton : null}
          <input
            type={type}
            className={cn(
              "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
              className,
              suffixButton && "border-r-0 rounded-r-none",
              prefixButton && "border-l-0 rounded-l-none"
            )}
            ref={ref}
            placeholder={props.placeholder || `Enter ${label?.toLowerCase()}`}
            {...props}
          />
          {suffixButton ? suffixButton : null}
        </div>
        <p className="text-sm text-red-500">{error}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
