import React from "react";

type BufferedStreamingText = {
  text: string;
  appendChunk: (chunk: string) => void;
  flush: () => void;
  reset: () => void;
};

const DEFAULT_FLUSH_INTERVAL_MS = 32;

export function useBufferedStreamingText(
  flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
): BufferedStreamingText {
  const [textState, setTextState] = React.useState({ generation: 0, text: "" });
  const textRef = React.useRef("");
  const generationRef = React.useRef(0);
  const pendingChunkRef = React.useRef("");
  const flushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = React.useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    if (!pendingChunkRef.current) {
      return;
    }

    const nextText = textRef.current + pendingChunkRef.current;
    pendingChunkRef.current = "";
    textRef.current = nextText;
    setTextState({ generation: generationRef.current, text: nextText });
  }, []);

  const scheduleFlush = React.useCallback(() => {
    if (flushTimerRef.current) {
      return;
    }

    flushTimerRef.current = setTimeout(() => {
      flush();
    }, flushIntervalMs);
  }, [flush, flushIntervalMs]);

  const appendChunk = React.useCallback(
    (chunk: string) => {
      if (!chunk) {
        return;
      }

      pendingChunkRef.current += chunk;

      if (chunk.includes("\n")) {
        flush();
        return;
      }

      scheduleFlush();
    },
    [flush, scheduleFlush],
  );

  const reset = React.useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    pendingChunkRef.current = "";
    textRef.current = "";
    generationRef.current += 1;
    setTextState({ generation: generationRef.current, text: "" });
  }, []);

  React.useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
      }
    };
  }, []);

  return {
    text:
      textState.generation === generationRef.current ? textState.text : "",
    appendChunk,
    flush,
    reset,
  };
}
