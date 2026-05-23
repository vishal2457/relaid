import React from "react";
import {
  adaptStreamActivity,
  type SessionAssistantBlock,
  type SessionAssistantActivity,
} from "@/src/lib/api/messages";
import type { SessionStreamChunkEvent } from "@/src/lib/sse/events";

export type LiveAssistantPhase = "thinking" | "responding" | "complete";

type LiveAssistantState = {
  phase: LiveAssistantPhase;
  statusText: string | null;
  reasoningById: Record<string, string>;
  reasoningOrder: string[];
  blocks: SessionAssistantBlock[];
  activitiesById: Record<string, SessionAssistantActivity>;
  activityOrder: string[];
  revision: number;
};

type LiveAssistantAction =
  | { type: "reset" }
  | { type: "chunks"; chunks: SessionStreamChunkEvent[] }
  | { type: "text"; chunk: string }
  | { type: "status"; statusText: string }
  | { type: "complete" }
  | { type: "reasoning"; partId: string; content: string; append: boolean }
  | { type: "activity"; partId: string; activity: SessionAssistantActivity };

const initialState: LiveAssistantState = {
  phase: "thinking",
  statusText: null,
  reasoningById: {},
  reasoningOrder: [],
  blocks: [],
  activitiesById: {},
  activityOrder: [],
  revision: 0,
};

function reducer(
  state: LiveAssistantState,
  action: LiveAssistantAction,
): LiveAssistantState {
  switch (action.type) {
    case "reset":
      return initialState;
    case "chunks": {
      return action.chunks.reduce((next, chunk) => {
        const chunkAction = getActionForStreamChunk(chunk);
        return chunkAction ? reducer(next, chunkAction) : next;
      }, state);
    }
    case "text":
      if (!action.chunk) {
        return state;
      }

      if (state.blocks[state.blocks.length - 1]?.type === "text") {
        const nextBlocks = [...state.blocks];
        const lastBlock = nextBlocks[nextBlocks.length - 1];
        if (lastBlock?.type === "text") {
          nextBlocks[nextBlocks.length - 1] = {
            ...lastBlock,
            content: lastBlock.content + action.chunk,
          };
        }

        return {
          ...state,
          phase: "responding",
          blocks: nextBlocks,
          revision: state.revision + 1,
        };
      }

      return {
        ...state,
        phase: "responding",
        blocks: [
          ...state.blocks,
          {
            id: `stream-text-${state.blocks.length}`,
            type: "text",
            content: action.chunk,
            durationSeconds: null,
          },
        ],
        revision: state.revision + 1,
      };
    case "status":
      return {
        ...state,
        statusText: action.statusText,
        revision: state.revision + 1,
      };
    case "complete":
      return {
        ...state,
        phase: "complete",
        revision: state.revision + 1,
      };
    case "reasoning": {
      const isNewPart = !(action.partId in state.reasoningById);
      const previousContent = state.reasoningById[action.partId] ?? "";
      return {
        ...state,
        phase: state.phase === "complete" ? "complete" : "thinking",
        reasoningById: {
          ...state.reasoningById,
          [action.partId]: action.append
            ? previousContent + action.content
            : action.content,
        },
        reasoningOrder: isNewPart
          ? [...state.reasoningOrder, action.partId]
          : state.reasoningOrder,
        revision: state.revision + 1,
      };
    }
    case "activity": {
      const isNewPart = !(action.partId in state.activitiesById);
      const existingBlockIndex = state.blocks.findIndex(
        (block) => block.id === action.partId && block.type === "tool",
      );
      const nextBlocks =
        existingBlockIndex >= 0
          ? state.blocks.map((block, index) =>
              index === existingBlockIndex && block.type === "tool"
                ? {
                    ...block,
                    activity: action.activity,
                  }
                : block,
            )
          : [
              ...state.blocks,
              {
                id: action.partId,
                type: "tool" as const,
                activity: action.activity,
              },
            ];

      return {
        ...state,
        blocks: nextBlocks,
        activitiesById: {
          ...state.activitiesById,
          [action.partId]: action.activity,
        },
        activityOrder: isNewPart
          ? [...state.activityOrder, action.partId]
          : state.activityOrder,
        revision: state.revision + 1,
      };
    }
    default:
      return state;
  }
}

function getReasoningPartId(payload: SessionStreamChunkEvent): string {
  return payload.partId ?? payload.messageId ?? "reasoning";
}

function getActivityPartId(
  payload: SessionStreamChunkEvent,
  activity: SessionAssistantActivity,
): string {
  return payload.partId ?? payload.messageId ?? activity.id;
}

function getActionForStreamChunk(
  payload: SessionStreamChunkEvent,
): LiveAssistantAction | null {
  switch (payload.type) {
    case "text":
      return { type: "text", chunk: payload.chunk };
    case "reasoning":
      return {
        type: "reasoning",
        partId: getReasoningPartId(payload),
        content: payload.chunk,
        append: !payload.partId,
      };
    case "tool":
    case "step": {
      const activity = adaptStreamActivity(payload.type, payload.chunk);
      if (!activity) {
        return null;
      }

      return {
        type: "activity",
        partId: getActivityPartId(payload, activity),
        activity,
      };
    }
    case "status":
      return { type: "status", statusText: payload.chunk };
    case "complete":
      return { type: "complete" };
  }
}

export function useLiveAssistantStream() {
  const [state, dispatch] = React.useReducer(reducer, initialState);

  const applyChunk = React.useCallback((payload: SessionStreamChunkEvent) => {
    const action = getActionForStreamChunk(payload);
    if (action) {
      dispatch(action);
    }
  }, []);

  const applyChunks = React.useCallback((chunks: SessionStreamChunkEvent[]) => {
    if (chunks.length > 0) {
      dispatch({ type: "chunks", chunks });
    }
  }, []);

  const reset = React.useCallback(() => {
    dispatch({ type: "reset" });
  }, []);

  const flush = React.useCallback(() => {}, []);

  const thinkingContent = React.useMemo(() => {
    const content = state.reasoningOrder
      .map((partId) => state.reasoningById[partId]?.trim() ?? "")
      .filter(Boolean)
      .join("\n\n");

    return content || null;
  }, [state.reasoningById, state.reasoningOrder]);

  const activities = React.useMemo(
    () =>
      state.activityOrder
        .map((partId) => state.activitiesById[partId])
        .filter((activity): activity is SessionAssistantActivity =>
          Boolean(activity),
        ),
    [state.activitiesById, state.activityOrder],
  );

  const visibleText = React.useMemo(
    () =>
      state.blocks
        .filter(
          (block): block is Extract<SessionAssistantBlock, { type: "text" }> =>
            block.type === "text",
        )
        .map((block) => block.content)
        .join(""),
    [state.blocks],
  );

  const phase: LiveAssistantPhase =
    visibleText.trim().length > 0 && state.phase !== "complete"
      ? "responding"
      : state.phase;

  return {
    visibleText,
    thinkingContent,
    blocks: state.blocks,
    activities,
    phase,
    statusText: state.statusText,
    revision: state.revision,
    hasContent:
      visibleText.trim().length > 0 ||
      Boolean(thinkingContent) ||
      activities.length > 0,
    applyChunk,
    applyChunks,
    flush,
    reset,
  };
}
