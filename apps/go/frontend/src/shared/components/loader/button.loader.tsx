import { cn } from "../../utils/cn.utils";

export const ButtonLoader = ({
  space = "large",
}: {
  space?: "small" | "large";
}) => {
  return (
    <div
      className={cn(
        "flex space-x-2 items-center justify-center",
        space === "small" ? "space-x-1" : "space-x-2"
      )}
    >
      <div className="w-2 h-2 rounded-full bg-neutral-400 animate-bounce delay-0"></div>
      <div className="w-2 h-2 rounded-full bg-neutral-500 animate-bounce delay-150"></div>
      <div className="w-2 h-2 rounded-full bg-neutral-600 animate-bounce delay-300"></div>
    </div>
  );
};
