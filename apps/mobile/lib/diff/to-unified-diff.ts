import { diffLines } from "diff";

export function toUnifiedDiffSmart({
  fileName = "file.ts",
  oldContent,
  newContent,
}: {
  fileName?: string;
  oldContent: string | null;
  newContent: string | null;
}) {
  const parts = diffLines(oldContent ?? "", newContent ?? "");

  const header = [
    `Index: ${fileName}`,
    "===================================================================",
    `--- ${fileName}`,
    `+++ ${fileName}`,
    `@@ -1,0 +1,0 @@`,
  ];

  const body: string[] = [];

  parts.forEach((part) => {
    const lines = part.value.split("\n");

    lines.forEach((line) => {
      if (line === "") return;

      if (part.added) body.push("+" + line);
      else if (part.removed) body.push("-" + line);
      else body.push(" " + line);
    });
  });

  return [...header, ...body].join("\n");
}