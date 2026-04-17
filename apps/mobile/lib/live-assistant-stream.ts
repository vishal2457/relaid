import React from "react";
import {
  adaptStreamActivity,
  type SessionAssistantActivity,
} from "@/lib/api/messages";
import type { SessionStreamChunkEvent } from "@/lib/sse/events";
import { useBufferedStreamingText } from "@/lib/streaming-text";

export type LiveAssistantPhase = "thinking" | "responding" | "complete";

type LiveAssistantState = {
  phase: LiveAssistantPhase;
  statusText: string | null;
  reasoningById: Record<string, string>;
  reasoningOrder: string[];
  activitiesById: Record<string, SessionAssistantActivity>;
  activityOrder: string[];
  revision: number;
};

type LiveAssistantAction =
  | { type: "reset" }
  | { type: "text" }
  | { type: "status"; statusText: string }
  | { type: "complete" }
  | { type: "reasoning"; partId: string; content: string; append: boolean }
  | { type: "activity"; partId: string; activity: SessionAssistantActivity };

const initialState: LiveAssistantState = {
  phase: "thinking",
  statusText: null,
  reasoningById: {},
  reasoningOrder: [],
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
    case "text":
      return {
        ...state,
        phase: "responding",
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
      return {
        ...state,
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

export function useLiveAssistantStream() {
  const {
    text: visibleText,
    appendChunk,
    flush: flushText,
    reset: resetText,
  } = useBufferedStreamingText();
  const [state, dispatch] = React.useReducer(reducer, initialState);

  const applyChunk = React.useCallback(
    (payload: SessionStreamChunkEvent) => {
      switch (payload.type) {
        case "text":
          appendChunk(payload.chunk);
          dispatch({ type: "text" });
          return;
        case "reasoning":
          dispatch({
            type: "reasoning",
            partId: getReasoningPartId(payload),
            content: payload.chunk,
            append: !payload.partId,
          });
          return;
        case "tool":
        case "step": {
          const activity = adaptStreamActivity(payload.type, payload.chunk);
          if (!activity) {
            return;
          }

          dispatch({
            type: "activity",
            partId: getActivityPartId(payload, activity),
            activity,
          });
          return;
        }
        case "status":
          dispatch({ type: "status", statusText: payload.chunk });
          return;
        case "complete":
          flushText();
          dispatch({ type: "complete" });
          return;
      }
    },
    [appendChunk, flushText],
  );

  const reset = React.useCallback(() => {
    resetText();
    dispatch({ type: "reset" });
  }, [resetText]);

  const flush = React.useCallback(() => {
    flushText();
  }, [flushText]);

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

  const phase: LiveAssistantPhase =
    visibleText.trim().length > 0 && state.phase !== "complete"
      ? "responding"
      : state.phase;

  return {
    visibleText,
    thinkingContent,
    activities,
    phase,
    statusText: state.statusText,
    revision: state.revision,
    hasContent:
      visibleText.trim().length > 0 ||
      Boolean(thinkingContent) ||
      activities.length > 0,
    applyChunk,
    flush,
    reset,
  };
}
