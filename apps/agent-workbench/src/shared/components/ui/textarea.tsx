import * as React from "react";

import { cn } from "../../utils/cn.utils";
import { Label } from "./label";

interface TextareaProps extends React.ComponentProps<"textarea"> {
    label?: string;
    containerClassName?: string;
    error?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, label, error, containerClassName, ...props }, ref) => {
        return (
            <div className={cn("w-full", containerClassName)}>
                <Label>{label}</Label>
                <textarea
                    className={cn(
                        "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
                        className
                    )}
                    ref={ref}
                    placeholder={props.placeholder || `Enter ${label?.toLowerCase()}`}
                    {...props}
                />
                <p className="text-sm text-red-500">{error}</p>
            </div>
        );
    }
);
Textarea.displayName = "Textarea";

export { Textarea };
