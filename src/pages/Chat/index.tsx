/**
 * Chat Page
 * Native React implementation communicating with OpenClaw Gateway
 * via gateway:rpc IPC. Session selector, thinking toggle, and refresh
 * are in the toolbar; messages render with markdown + streaming.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  BarChart3,
  BookOpenText,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileCheck2,
  FileSearch,
  GitBranch,
  LockKeyhole,
  Loader2,
  MapPinned,
  PackageCheck,
  PlayCircle,
  SendHorizontal,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Workflow,
  Wrench,
} from 'lucide-react';
import { useChatStore, type RawMessage } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';
import { useAgentsStore } from '@/stores/agents';
import { hostApiFetch } from '@/lib/host-api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ExecutionGraphCard } from './ExecutionGraphCard';
import { ChatToolbar } from './ChatToolbar';
import { extractImages, extractText, extractThinking, extractToolUse, stripProcessMessagePrefix } from './message-utils';
import { deriveTaskSteps, findReplyMessageIndex, parseSubagentCompletionInfo, type TaskStep } from './task-visualization';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useStickToBottomInstant } from '@/hooks/use-stick-to-bottom-instant';
import { useMinLoading } from '@/hooks/use-min-loading';
import { enterpriseApi, type OperationDemoResult } from '@/lib/enterprise-api';
import workmateBackground from '@/assets/brand/background.svg';
import workmateMascot from '@/assets/brand/assistant.svg';
import workmateLogo from '@/assets/brand/logo.svg';

type GraphStepCacheEntry = {
  steps: ReturnType<typeof deriveTaskSteps>;
  agentLabel: string;
  sessionLabel: string;
  segmentEnd: number;
  replyIndex: number | null;
  triggerIndex: number;
};

type UserRunCard = {
  triggerIndex: number;
  replyIndex: number | null;
  active: boolean;
  agentLabel: string;
  sessionLabel: string;
  segmentEnd: number;
  steps: TaskStep[];
  messageStepTexts: string[];
  streamingReplyText: string | null;
  /**
   * Whether the trailing "Thinking..." indicator should be hidden for this
   * card. True only when the run's live stream is currently rendered AS a
   * streaming step inside the graph (the step itself already signals
   * liveness, so the extra indicator would be redundant). False in all
   * other cases — including when the stream is promoted to a bubble
   * below the graph, or when there is no streaming content at all (the
   * gap between tool rounds), because the graph has no visible activity
   * of its own in those windows and the indicator is what tells the user
   * "work is still in progress".
   */
  suppressThinking: boolean;
};

function getPrimaryMessageStepTexts(steps: TaskStep[]): string[] {
  return steps
    .filter((step) => step.kind === 'message' && step.parentId === 'agent-run' && !!step.detail)
    .map((step) => step.detail!);
}

// Keep the last non-empty execution-graph snapshot per session/run outside
// React state so `loadHistory` refreshes can still fall back to the previous
// steps without tripping React's set-state-in-effect lint rule.
const graphStepCacheStore = new Map<string, Record<string, GraphStepCacheEntry>>();
const streamingTimestampStore = new Map<string, number>();

export function Chat() {
  const { t } = useTranslation('chat');
  const gatewayStatus = useGatewayStore((s) => s.status);
  const isGatewayRunning = gatewayStatus.state === 'running';

  const messages = useChatStore((s) => s.messages);
  const currentSessionKey = useChatStore((s) => s.currentSessionKey);
  const currentAgentId = useChatStore((s) => s.currentAgentId);
  const sessionLabels = useChatStore((s) => s.sessionLabels);
  const loading = useChatStore((s) => s.loading);
  const sending = useChatStore((s) => s.sending);
  const error = useChatStore((s) => s.error);
  const runError = useChatStore((s) => s.runError);
  const streamingMessage = useChatStore((s) => s.streamingMessage);
  const streamingTools = useChatStore((s) => s.streamingTools);
  const pendingFinal = useChatStore((s) => s.pendingFinal);
  const activeRunId = useChatStore((s) => s.activeRunId);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const abortRun = useChatStore((s) => s.abortRun);
  const clearError = useChatStore((s) => s.clearError);
  const fetchAgents = useAgentsStore((s) => s.fetchAgents);
  const agents = useAgentsStore((s) => s.agents);

  const cleanupEmptySession = useChatStore((s) => s.cleanupEmptySession);
  const [childTranscripts, setChildTranscripts] = useState<Record<string, RawMessage[]>>({});
  // Persistent per-run override for the Execution Graph's expanded/collapsed
  // state. Keyed by a stable run id (trigger message id, or a fallback of
  // `${sessionKey}:${triggerIdx}`) so user toggles survive the `loadHistory`
  // refresh that runs after every final event — otherwise the card would
  // remount and reset. `undefined` values mean "user hasn't toggled, let the
  // card pick a default from its own `active` prop."
  const [graphExpandedOverrides, setGraphExpandedOverrides] = useState<Record<string, boolean>>({});
  const graphStepCache: Record<string, GraphStepCacheEntry> = graphStepCacheStore.get(currentSessionKey) ?? {};
  const minLoading = useMinLoading(loading && messages.length > 0);
  const { contentRef, scrollRef } = useStickToBottomInstant(currentSessionKey);

  // Load data when gateway is running.
  // When the store already holds messages for this session (i.e. the user
  // is navigating *back* to Chat), use quiet mode so the existing messages
  // stay visible while fresh data loads in the background.  This avoids
  // an unnecessary messages → spinner → messages flicker.
  useEffect(() => {
    return () => {
      // If the user navigates away without sending any messages, remove the
      // empty session so it doesn't linger as a ghost entry in the sidebar.
      cleanupEmptySession();
    };
  }, [cleanupEmptySession]);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    const completions = messages
      .map((message) => parseSubagentCompletionInfo(message))
      .filter((value): value is NonNullable<typeof value> => value != null);
    const missing = completions.filter((completion) => !childTranscripts[completion.sessionId]);
    if (missing.length === 0) return;

    let cancelled = false;
    void Promise.all(
      missing.map(async (completion) => {
        try {
          const result = await hostApiFetch<{ success: boolean; messages?: RawMessage[] }>(
            `/api/sessions/transcript?agentId=${encodeURIComponent(completion.agentId)}&sessionId=${encodeURIComponent(completion.sessionId)}`,
          );
          if (!result.success) {
            console.warn('Failed to load child transcript:', {
              agentId: completion.agentId,
              sessionId: completion.sessionId,
              result,
            });
            return null;
          }
          return { sessionId: completion.sessionId, messages: result.messages || [] };
        } catch (error) {
          console.warn('Failed to load child transcript:', {
            agentId: completion.agentId,
            sessionId: completion.sessionId,
            error,
          });
          return null;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      setChildTranscripts((current) => {
        const next = { ...current };
        for (const result of results) {
          if (!result) continue;
          next[result.sessionId] = result.messages;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [messages, childTranscripts]);

  const streamMsg = streamingMessage && typeof streamingMessage === 'object'
    ? streamingMessage as unknown as { role?: string; content?: unknown; timestamp?: number }
    : null;
  const streamTimestamp = typeof streamMsg?.timestamp === 'number' ? streamMsg.timestamp : 0;
  useEffect(() => {
    if (!sending) {
      streamingTimestampStore.delete(currentSessionKey);
      return;
    }
    if (!streamingTimestampStore.has(currentSessionKey)) {
      streamingTimestampStore.set(currentSessionKey, streamTimestamp || Date.now() / 1000);
    }
  }, [currentSessionKey, sending, streamTimestamp]);

  const streamingTimestamp = sending
    ? (streamingTimestampStore.get(currentSessionKey) ?? streamTimestamp)
    : 0;
  const streamText = streamMsg ? extractText(streamMsg) : (typeof streamingMessage === 'string' ? streamingMessage : '');
  const hasStreamText = streamText.trim().length > 0;
  // Whether the streaming chunk currently carries a `thinking` block. Used as
  // a liveness signal so the run stays "active" (and the ExecutionGraphCard
  // keeps showing its trailing "Thinking..." indicator) during the brief window
  // between a tool finishing and the next text/tool chunk arriving — that gap
  // is normally only filled by streamed thinking. NOT included in
  // `shouldRenderStreaming`: a thinking-only stream chunk should not produce
  // a chat bubble (thinking is rendered exclusively inside the ExecutionGraph).
  const streamThinking = streamMsg ? extractThinking(streamMsg) : null;
  const hasStreamThinking = !!streamThinking && streamThinking.trim().length > 0;
  const streamTools = streamMsg ? extractToolUse(streamMsg) : [];
  const hasStreamTools = streamTools.length > 0;
  const streamImages = streamMsg ? extractImages(streamMsg) : [];
  const hasStreamImages = streamImages.length > 0;
  const hasStreamToolStatus = streamingTools.length > 0;
  const hasRunningStreamToolStatus = streamingTools.some((tool) => tool.status === 'running');
  const shouldRenderStreaming = sending && (hasStreamText || hasStreamTools || hasStreamImages || hasStreamToolStatus);
  const hasAnyStreamContent = hasStreamText || hasStreamThinking || hasStreamTools || hasStreamImages || hasStreamToolStatus;

  const isEmpty = messages.length === 0 && !sending;
  const subagentCompletionInfos = messages.map((message) => parseSubagentCompletionInfo(message));
  // Build an index of the *next* real user message after each position.
  // Gateway history may contain `role: 'user'` messages that are actually
  // tool-result wrappers (Anthropic API format).  These must NOT split
  // the run into multiple segments — only genuine user-authored messages
  // should act as run boundaries.
  const isRealUserMessage = (msg: RawMessage): boolean => {
    if (msg.role !== 'user') return false;
    const content = msg.content;
    if (!Array.isArray(content)) return true;
    // If every block in the content is a tool_result, this is a Gateway
    // tool-result wrapper, not a real user message.
    const blocks = content as Array<{ type?: string }>;
    return blocks.length === 0 || !blocks.every((b) => b.type === 'tool_result');
  };
  const nextUserMessageIndexes = new Array<number>(messages.length).fill(-1);
  let nextUserMessageIndex = -1;
  for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
    nextUserMessageIndexes[idx] = nextUserMessageIndex;
    if (isRealUserMessage(messages[idx]) && !subagentCompletionInfos[idx]) {
      nextUserMessageIndex = idx;
    }
  }

  // Indices of intermediate assistant process messages that are represented
  // in the ExecutionGraphCard (narration text and/or thinking). We suppress
  // them from the chat stream so they don't appear duplicated below the graph.
  const foldedNarrationIndices = new Set<number>();

  const userRunCards: UserRunCard[] = messages.flatMap((message, idx) => {
    if (!isRealUserMessage(message) || subagentCompletionInfos[idx]) return [];

    const runKey = message.id
      ? `msg-${message.id}`
      : `${currentSessionKey}:trigger-${idx}`;
    const nextUserIndex = nextUserMessageIndexes[idx];
    const segmentEnd = nextUserIndex === -1 ? messages.length : nextUserIndex;
    const segmentMessages = messages.slice(idx + 1, segmentEnd);
    const completionInfos = subagentCompletionInfos
      .slice(idx + 1, segmentEnd)
      .filter((value): value is NonNullable<typeof value> => value != null);
    // A run is considered "open" (still active) when it's the last segment
    // AND at least one of:
    //  - sending/pendingFinal/streaming data (normal streaming path)
    //  - segment has tool calls but no pure-text final reply yet (server-side
    //    tool execution — Gateway fires phase "end" per tool round which
    //    briefly clears sending, but the run is still in progress)
    const hasToolActivity = segmentMessages.some((m) =>
      m.role === 'assistant' && extractToolUse(m).length > 0,
    );
    // Locate the last tool-use message so we only count text messages that
    // come AFTER all tool calls as "final reply".  Intermediate narration
    // messages (pure text, no tool_use) sit BEFORE tool calls and must not
    // be misread as the concluding reply — otherwise `runStillExecutingTools`
    // flips to false between tool rounds, collapsing the trailing
    // "Thinking..." indicator during the brief gap before the next stream chunk.
    let lastToolUseOffset = -1;
    for (let i = segmentMessages.length - 1; i >= 0; i -= 1) {
      const m = segmentMessages[i];
      if (m.role === 'assistant' && extractToolUse(m).length > 0) {
        lastToolUseOffset = i;
        break;
      }
    }
    const hasFinalReply = segmentMessages.some((m, i) => {
      if (i <= lastToolUseOffset) return false;
      if (m.role !== 'assistant') return false;
      if (extractText(m).trim().length === 0) return false;
      const content = m.content;
      if (!Array.isArray(content)) return true;
      return !(content as Array<{ type?: string }>).some(
        (b) => b.type === 'tool_use' || b.type === 'toolCall',
      );
    });
    const runStillExecutingTools = hasToolActivity && !hasFinalReply;
    // runStillExecutingTools bridges the brief gap between tool rounds when
    // Gateway temporarily clears sending.  However, after an explicit abort
    // (which clears activeRunId), we must NOT keep the run "open" — so we
    // gate it on activeRunId being present. We also bail out as soon as a
    // terminal model error has been surfaced so the run doesn't appear active.
    const isLatestRunSegment = nextUserIndex === -1;
    const isLatestOpenRun = isLatestRunSegment
      && !runError
      && (sending || pendingFinal || hasAnyStreamContent || (runStillExecutingTools && !!activeRunId));
    const replyIndexOffset = findReplyMessageIndex(segmentMessages, isLatestOpenRun);
    const replyIndex = replyIndexOffset === -1 ? null : idx + 1 + replyIndexOffset;

    const buildSteps = (omitLastStreamingMessageSegment: boolean): TaskStep[] => {
      let builtSteps = deriveTaskSteps({
        messages: segmentMessages,
        streamingMessage: isLatestOpenRun ? streamingMessage : null,
        streamingTools: isLatestOpenRun ? streamingTools : [],
        omitLastStreamingMessageSegment: isLatestOpenRun ? omitLastStreamingMessageSegment : false,
      });

      for (const completion of completionInfos) {
        const childMessages = childTranscripts[completion.sessionId];
        if (!childMessages || childMessages.length === 0) continue;
        const branchRootId = `subagent:${completion.sessionId}`;
        const childSteps = deriveTaskSteps({
          messages: childMessages,
          streamingMessage: null,
          streamingTools: [],
        }).map((step) => ({
          ...step,
          id: `${completion.sessionId}:${step.id}`,
          depth: step.depth + 1,
          parentId: branchRootId,
        }));

        builtSteps = [
          ...builtSteps,
          {
            id: branchRootId,
            label: `${completion.agentId} subagent`,
            status: 'completed',
            kind: 'system' as const,
            detail: completion.sessionKey,
            depth: 1,
            parentId: 'agent-run',
          },
          ...childSteps,
        ];
      }

      return builtSteps;
    };

    // Show the streaming response as a separate bubble (not inside the
    // execution graph) once tool activity has happened and the CURRENT stream
    // chunk carries no tool_use block.
    //
    // We use an optimistic promotion strategy because the distinguishing
    // signal between "narration-before-next-tool" and "final reply" is not
    // available during early deltas — both are text-only, both arrive after
    // `hasToolActivity` has flipped true.  Any of these signals opens the
    // promotion gate:
    //   1. `pendingFinal`       — tool-result final just fired; next text is
    //      (almost always) the final reply.
    //   2. `allToolsCompleted`  — every client-tracked tool entry reached
    //      `completed` state.
    //   3. `hasToolActivity`    — at least one prior tool_use exists in the
    //      segment, i.e. we're past the first tool round.
    //
    // Demotion happens the moment a tool_use block appears in the streaming
    // message (`streamTools.length > 0`) OR a tool transitions back to
    // `running`.  When demoted, the stream re-renders inside the graph as a
    // narration step.  A brief flicker when narration turns into the next
    // tool round is inherent to optimistic promotion and is accepted.
    //
    // Earlier iterations tried restricting this gate to only
    // `pendingFinal || allToolsCompleted` to protect the trailing
    // "Thinking..." indicator.  That check is real, but belongs in the
    // `suppressThinking` coupling below — not here.  With the coupling
    // fixed, the three-signal gate gives the correct bubble placement for
    // both narration and final reply.
    const allToolsCompleted = streamingTools.length > 0 && !hasRunningStreamToolStatus;
    const rawStreamingReplyCandidate = isLatestOpenRun
      && (pendingFinal || allToolsCompleted || hasToolActivity)
      && (hasStreamText || hasStreamImages)
      && streamTools.length === 0
      && !hasRunningStreamToolStatus;

    let steps = buildSteps(rawStreamingReplyCandidate);
    let streamingReplyText: string | null = null;
    if (rawStreamingReplyCandidate) {
      const trimmedReplyText = stripProcessMessagePrefix(streamText, getPrimaryMessageStepTexts(steps));
      const hasReplyText = trimmedReplyText.trim().length > 0;
      if (hasReplyText || hasStreamImages) {
        streamingReplyText = trimmedReplyText;
      } else {
        steps = buildSteps(false);
      }
    }

    const segmentAgentId = currentAgentId;
    const segmentAgentLabel = agents.find((agent) => agent.id === segmentAgentId)?.name || segmentAgentId;
    const segmentSessionLabel = sessionLabels[currentSessionKey] || currentSessionKey;

    if (steps.length === 0) {
      if (isLatestOpenRun && streamingReplyText == null) {
        return [{
          triggerIndex: idx,
          replyIndex,
          active: true,
          agentLabel: segmentAgentLabel,
          sessionLabel: segmentSessionLabel,
          segmentEnd: nextUserIndex === -1 ? messages.length - 1 : nextUserIndex - 1,
          steps: [],
          messageStepTexts: [],
          streamingReplyText: null,
          suppressThinking: false,
        }];
      }
      const cached = graphStepCache[runKey];
      if (!cached) return [];
      // The cache was captured during streaming and may contain stream-
      // generated message steps that include accumulated narration + reply
      // text.  Strip these out — historical message steps (from messages[])
      // will be properly recomputed on the next render with fresh data.
      const cleanedSteps = cached.steps.filter(
        (s) => !(s.kind === 'message' && s.id.startsWith('stream-message')),
      );
      return [{
        triggerIndex: idx,
        replyIndex: cached.replyIndex,
        active: false,
        agentLabel: cached.agentLabel,
        sessionLabel: cached.sessionLabel,
        segmentEnd: nextUserIndex === -1 ? messages.length - 1 : nextUserIndex - 1,
        steps: cleanedSteps,
        messageStepTexts: getPrimaryMessageStepTexts(cleanedSteps),
        streamingReplyText: null,
        suppressThinking: false,
      }];
    }

    // Mark intermediate assistant messages whose process output should be folded into
    // the ExecutionGraphCard. We fold the text regardless of whether the
    // message ALSO carries tool calls (mixed `text + toolCall` messages are
    // common — e.g. "waiting for the page to load…" followed by a `wait`
    // tool call). This prevents orphan narration bubbles from leaking into
    // the chat stream once the graph is collapsed.
    //
    // When the run is still streaming (`isLatestOpenRun`) the final reply is
    // not yet part of `segmentMessages`, so every assistant message in the
    // segment counts as intermediate. For completed runs, we preserve the
    // final reply bubble by skipping the message that `findReplyMessageIndex`
    // identifies as the answer.
    const segmentReplyOffset = findReplyMessageIndex(segmentMessages, isLatestOpenRun);
    for (let offset = 0; offset < segmentMessages.length; offset += 1) {
      if (offset === segmentReplyOffset) continue;
      const candidate = segmentMessages[offset];
      if (!candidate || candidate.role !== 'assistant') continue;
      const hasNarrationText = extractText(candidate).trim().length > 0;
      const hasThinking = !!extractThinking(candidate);
      if (!hasNarrationText && !hasThinking) continue;
      foldedNarrationIndices.add(idx + 1 + offset);
    }

    // The graph should stay "active" (expanded, can show trailing thinking)
    // for the entire duration of the run — not just until a streaming reply
    // appears.  Tying active to streamingReplyText caused a flicker: a brief
    // active→false→true transition collapsed the graph via ExecutionGraphCard's
    // uncontrolled path before the controlled `expanded` override could kick in.
    const cardActive = isLatestOpenRun;

    // Suppress the trailing "Thinking..." indicator only when the live stream is
    // currently rendered AS a streaming step inside this card's graph. In
    // that case the streaming step itself is the activity signal, and the
    // separate trailing indicator would be redundant.
    //   - streamingReplyText != null: stream is promoted to a bubble → graph
    //     has no live step of its own → DO show the trailing indicator so the
    //     user still sees progress in the graph (indicator rendered above the
    //     bubble).
    //   - no stream content at all (the gap between tool rounds): graph also
    //     has no live step → DO show the indicator — this is the very case
    //     the indicator exists for.
    //   - stream IS in graph (e.g. tool_use is streaming): indicator is
    //     redundant → suppress.
    const streamIsInGraph =
      isLatestOpenRun && streamingReplyText == null && hasAnyStreamContent;
    const suppressThinking = streamIsInGraph;

    return [{
      triggerIndex: idx,
      replyIndex,
      active: cardActive,
      agentLabel: segmentAgentLabel,
      sessionLabel: segmentSessionLabel,
      segmentEnd: nextUserIndex === -1 ? messages.length - 1 : nextUserIndex - 1,
      steps,
      messageStepTexts: getPrimaryMessageStepTexts(steps),
      streamingReplyText,
      suppressThinking,
    }];
  }, [messages, subagentCompletionInfos, currentSessionKey, streamingMessage, streamingTools, pendingFinal, sending, hasAnyStreamContent, hasStreamText, hasStreamImages, streamText, streamTools.length, hasRunningStreamToolStatus, childTranscripts, currentAgentId, agents, sessionLabels, graphStepCache, runError]);
  const hasActiveExecutionGraph = userRunCards.some((card) => card.active);
  const replyTextOverrides = useMemo(() => {
    const map = new Map<number, string>();
    for (const card of userRunCards) {
      if (card.replyIndex == null) continue;
      const replyMessage = messages[card.replyIndex];
      if (!replyMessage || replyMessage.role !== 'assistant') continue;
      const fullReplyText = extractText(replyMessage);
      const trimmedReplyText = stripProcessMessagePrefix(fullReplyText, card.messageStepTexts);
      if (trimmedReplyText !== fullReplyText) {
        map.set(card.replyIndex, trimmedReplyText);
      }
    }
    return map;
  }, [userRunCards, messages]);
  const streamingReplyText = userRunCards.find((card) => card.streamingReplyText != null)?.streamingReplyText ?? null;

  // Derive the set of run keys that should be auto-collapsed (run finished
  // streaming or has a reply override) during render instead of in an effect,
  // so we don't violate react-hooks/set-state-in-effect. Explicit user toggles
  // still win via `graphExpandedOverrides` and are merged in at the call site.
  const autoCollapsedRunKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const card of userRunCards) {
      // Auto-collapse once the run is complete and a final reply exists.
      // Don't collapse while the reply is still streaming.
      const isStillStreaming = card.streamingReplyText != null;
      const shouldCollapse = !isStillStreaming && !card.active && card.replyIndex != null;
      if (!shouldCollapse) continue;
      const triggerMsg = messages[card.triggerIndex];
      const runKey = triggerMsg?.id
        ? `msg-${triggerMsg.id}`
        : `${currentSessionKey}:trigger-${card.triggerIndex}`;
      keys.add(runKey);
    }
    return keys;
  }, [currentSessionKey, messages, userRunCards]);

  useEffect(() => {
    if (userRunCards.length === 0) return;
    const current = graphStepCacheStore.get(currentSessionKey) ?? {};
    let changed = false;
    const next = { ...current };
    for (const card of userRunCards) {
      if (card.steps.length === 0) continue;
      const triggerMsg = messages[card.triggerIndex];
      const runKey = triggerMsg?.id
        ? `msg-${triggerMsg.id}`
        : `${currentSessionKey}:trigger-${card.triggerIndex}`;
      const existing = current[runKey];
      const sameSteps = !!existing
        && existing.steps.length === card.steps.length
        && existing.steps.every((step, index) => {
          const nextStep = card.steps[index];
          return nextStep
            && step.id === nextStep.id
            && step.label === nextStep.label
            && step.status === nextStep.status
            && step.kind === nextStep.kind
            && step.detail === nextStep.detail
            && step.depth === nextStep.depth
            && step.parentId === nextStep.parentId;
        });
      if (
        sameSteps
        && existing?.agentLabel === card.agentLabel
        && existing?.sessionLabel === card.sessionLabel
        && existing?.segmentEnd === card.segmentEnd
        && existing?.replyIndex === card.replyIndex
        && existing?.triggerIndex === card.triggerIndex
      ) {
        continue;
      }
      next[runKey] = {
        steps: card.steps,
        agentLabel: card.agentLabel,
        sessionLabel: card.sessionLabel,
        segmentEnd: card.segmentEnd,
        replyIndex: card.replyIndex,
        triggerIndex: card.triggerIndex,
      };
      changed = true;
    }
    if (changed) {
      graphStepCacheStore.set(currentSessionKey, next);
    }
  }, [userRunCards, messages, currentSessionKey]);

  return (
    <div className={cn("relative flex min-h-0 flex-col -m-6 transition-colors duration-500 dark:bg-background")} style={{ height: 'calc(100vh - 2.5rem)' }}>
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-end px-4 py-2">
        <ChatToolbar />
      </div>

      {/* Messages Area */}
      <div className="min-h-0 flex-1 overflow-hidden px-4 py-4">
        <div className="mx-auto flex h-full min-h-0 max-w-6xl flex-col gap-4 lg:flex-row lg:items-stretch">
          <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            <div
              ref={contentRef}
              className={cn(
                "mx-auto space-y-4 transition-all duration-300",
                isEmpty ? "w-full max-w-3xl" : "max-w-4xl",
              )}
            >
              {isEmpty ? (
                <WelcomeScreen onSend={sendMessage} disabled={!isGatewayRunning} />
              ) : (
                <>
                  {messages.map((msg, idx) => {
                    if (foldedNarrationIndices.has(idx)) return null;
                    const suppressToolCards = userRunCards.some((card) =>
                      idx > card.triggerIndex && idx <= card.segmentEnd,
                    );
                    return (
                    <div
                      key={msg.id || `msg-${idx}`}
                      className="space-y-3"
                      id={`chat-message-${idx}`}
                      data-testid={`chat-message-${idx}`}
                    >
                      <ChatMessage
                        message={msg}
                        textOverride={replyTextOverrides.get(idx)}
                        suppressToolCards={suppressToolCards}
                        suppressProcessAttachments={suppressToolCards}
                      />
                      {userRunCards
                        .filter((card) => card.triggerIndex === idx)
                        .map((card) => {
                          const triggerMsg = messages[card.triggerIndex];
                          const runKey = triggerMsg?.id
                            ? `msg-${triggerMsg.id}`
                            : `${currentSessionKey}:trigger-${card.triggerIndex}`;
                          const userOverride = graphExpandedOverrides[runKey];
                          // Always use the controlled expanded prop instead of
                          // relying on ExecutionGraphCard's uncontrolled state.
                          // Uncontrolled state is lost on remount (key changes
                          // when loadHistory replaces message ids), causing
                          // spurious collapse.  The controlled prop survives
                          // remounts because it's computed fresh each render.
                          const expanded = userOverride != null
                            ? userOverride
                            : !autoCollapsedRunKeys.has(runKey);
                          return (
                            <ExecutionGraphCard
                              key={`graph-${currentSessionKey}:${card.triggerIndex}`}
                              agentLabel={card.agentLabel}
                              steps={card.steps}
                              active={card.active}
                              suppressThinking={card.suppressThinking}
                              expanded={expanded}
                              onExpandedChange={(next) =>
                                setGraphExpandedOverrides((prev) => ({ ...prev, [runKey]: next }))
                              }
                            />
                          );
                        })}
                    </div>
                    );
                  })}

                  {/* Streaming message — render when reply text is separated from graph,
                      OR when there's streaming content without an active graph */}
                  {shouldRenderStreaming && (streamingReplyText != null || !hasActiveExecutionGraph) && (
                    <ChatMessage
                      message={(() => {
                        const base = streamMsg
                          ? {
                              ...(streamMsg as Record<string, unknown>),
                              role: (typeof streamMsg.role === 'string' ? streamMsg.role : 'assistant') as RawMessage['role'],
                              content: streamMsg.content ?? streamText,
                              timestamp: streamMsg.timestamp ?? streamingTimestamp,
                            }
                          : {
                              role: 'assistant' as const,
                              content: streamText,
                              timestamp: streamingTimestamp,
                            };
                        // When the reply renders as a separate bubble, strip
                        // thinking blocks from the message — they belong to
                        // the execution phase and are already omitted from
                        // the graph via omitLastStreamingMessageSegment.
                        if (streamingReplyText != null && Array.isArray(base.content)) {
                          return {
                            ...base,
                            content: (base.content as Array<{ type?: string }>).filter(
                              (block) => block.type !== 'thinking',
                            ),
                          } as RawMessage;
                        }
                        return base as RawMessage;
                      })()}
                      textOverride={streamingReplyText ?? undefined}
                      isStreaming
                      streamingTools={streamingReplyText != null ? [] : streamingTools}
                    />
                  )}

                  {/* Activity indicator: waiting for next AI turn after tool execution */}
                  {sending && pendingFinal && !shouldRenderStreaming && !hasActiveExecutionGraph && (
                    <ActivityIndicator phase="tool_processing" />
                  )}

                  {/* Typing indicator when sending but no stream content yet */}
                  {sending && !pendingFinal && !hasAnyStreamContent && !hasActiveExecutionGraph && (
                    <TypingIndicator />
                  )}
                </>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Run error callout */}
      {runError && (
        <div className="px-4 pt-2">
          <div className="max-w-4xl mx-auto rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3">
            <p className="text-sm font-medium text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {t('runError.title')}
            </p>
            <p className="mt-1 text-sm text-destructive/90 break-words">
              {runError}
            </p>
          </div>
        </div>
      )}

      {/* Error bar */}
      {error && (
        <div className="px-4 py-2 bg-destructive/10 border-t border-destructive/20">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <p className="text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
            <button
              onClick={clearError}
              className="text-xs text-destructive/60 hover:text-destructive underline"
            >
              {t('common:actions.dismiss')}
            </button>
          </div>
        </div>
      )}

      {/* Input Area */}
      <ChatInput
        onSend={sendMessage}
        onStop={abortRun}
        disabled={!isGatewayRunning}
        sending={sending || hasActiveExecutionGraph}
        isEmpty={isEmpty}
      />

      {/* Transparent loading overlay */}
      {minLoading && !sending && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/20 backdrop-blur-[1px] rounded-xl pointer-events-auto">
          <div className="bg-background shadow-lg rounded-full p-2.5 border border-border">
            <LoadingSpinner size="md" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Welcome Screen ──────────────────────────────────────────────

type WelcomeAction = {
  key: string;
  icon: ReactNode;
  accentClassName: string;
};

type PlatformPlan = {
  key: string;
  icon: ReactNode;
};

function WelcomeScreen({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation('chat');
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoResult, setDemoResult] = useState<OperationDemoResult | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const quickActions: WelcomeAction[] = [
    {
      key: 'workOrder',
      icon: <Wrench className="h-5 w-5" />,
      accentClassName: 'bg-sky-500/10 text-sky-600 dark:bg-sky-400/12 dark:text-sky-300',
    },
    {
      key: 'investment',
      icon: <BriefcaseBusiness className="h-5 w-5" />,
      accentClassName: 'bg-cyan-500/10 text-cyan-600 dark:bg-cyan-400/12 dark:text-cyan-300',
    },
    {
      key: 'enterpriseService',
      icon: <ClipboardCheck className="h-5 w-5" />,
      accentClassName: 'bg-blue-500/10 text-blue-600 dark:bg-blue-400/12 dark:text-blue-300',
    },
    {
      key: 'knowledge',
      icon: <BookOpenText className="h-5 w-5" />,
      accentClassName: 'bg-sky-500/12 text-sky-600 dark:bg-sky-400/12 dark:text-sky-300',
    },
    {
      key: 'operationInsight',
      icon: <BarChart3 className="h-5 w-5" />,
      accentClassName: 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/12 dark:text-indigo-300',
    },
  ];
  const platformPlans: PlatformPlan[] = [
    { key: 'skillFactory', icon: <PackageCheck className="h-4 w-4" /> },
    { key: 'dataConnectors', icon: <Database className="h-4 w-4" /> },
    { key: 'knowledgeHub', icon: <FileSearch className="h-4 w-4" /> },
    { key: 'workflowGate', icon: <Workflow className="h-4 w-4" /> },
    { key: 'permissionAudit', icon: <LockKeyhole className="h-4 w-4" /> },
    { key: 'agentOps', icon: <GitBranch className="h-4 w-4" /> },
  ];
  const handleRunDemo = async () => {
    setDemoLoading(true);
    setDemoError(null);
    try {
      const result = await enterpriseApi.runParkOperationsDemo();
      setDemoResult(result);
    } catch (error) {
      setDemoError(error instanceof Error ? error.message : String(error));
      setDemoResult(createLocalOperationDemoResult());
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div data-testid="workmate-welcome" className="flex min-h-[62vh] flex-col gap-5 pb-4">
      <section className="relative overflow-hidden rounded-lg border border-sky-100 bg-white shadow-sm shadow-sky-950/5 dark:border-white/10 dark:bg-card">
        <img
          src={workmateBackground}
          alt=""
          aria-hidden="true"
          data-testid="workmate-hero-background"
          className="absolute inset-y-0 right-0 hidden h-full w-[58%] object-cover object-center opacity-80 md:block"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/96 to-sky-50/72 dark:from-background dark:via-background/90 dark:to-background/50" />
        <div className="relative grid min-h-[280px] gap-5 p-6 md:p-7 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-5 text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm shadow-sky-950/5 backdrop-blur dark:border-white/10 dark:bg-card/75">
              <img src={workmateLogo} alt="" aria-hidden="true" className="h-4 w-4 rounded object-cover" />
              <span>{t('welcome.eyebrow')}</span>
            </div>
            <div className="space-y-3">
              <h1 className="max-w-2xl text-3xl font-semibold leading-tight text-foreground md:text-4xl">
                {t('welcome.title')}
              </h1>
              <p className="max-w-xl text-sm leading-7 text-slate-600 dark:text-muted-foreground">
                {t('welcome.subtitle')}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end">
            <div className="flex w-full max-w-[260px] items-center gap-3 rounded-lg border border-sky-100/80 bg-white/72 p-4 shadow-sm shadow-sky-950/5 backdrop-blur dark:border-white/10 dark:bg-card/50">
              <img
                src={workmateMascot}
                alt={t('welcome.mascotAlt')}
                data-testid="workmate-mascot"
                className="h-24 w-24 shrink-0 rounded-lg object-cover object-left-top"
              />
              <div className="min-w-0 space-y-2">
                {['parks', 'services', 'governance'].map((key) => (
                  <div key={key} className="flex items-baseline gap-2">
                  <div className="text-sm font-semibold text-foreground">
                    {t(`welcome.metrics.${key}.value`)}
                  </div>
                  <div className="truncate text-2xs text-muted-foreground">
                    {t(`welcome.metrics.${key}.label`)}
                  </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        data-testid="workmate-operation-demo"
        className="rounded-lg border border-sky-100 bg-white/86 p-4 text-left shadow-sm shadow-sky-950/5 dark:border-white/10 dark:bg-card/80"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-2.5 py-1 text-2xs font-medium text-sky-700 dark:bg-sky-400/10 dark:text-sky-200">
              <Sparkles className="h-3.5 w-3.5" />
              领导演示闭环
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">园区运营智能问答 + 工单分析 + 安全执行确认</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
                一次点击演示 AI 如何读取知识库、查询园区工单、识别 SLA 风险，并把派单写回动作拦在人工确认前。
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRunDemo}
              disabled={demoLoading}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-sky-600 px-3 text-xs font-semibold text-white shadow-sm shadow-sky-950/10 transition-colors hover:bg-sky-700 disabled:cursor-wait disabled:opacity-70"
            >
              {demoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
              运行演示
            </button>
            <button
              type="button"
              onClick={() => onSend(demoResult?.suggestedPrompt || createLocalOperationDemoResult().suggestedPrompt)}
              disabled={disabled}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-sky-100 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200"
            >
              <SendHorizontal className="h-4 w-4" />
              用模型提问
            </button>
          </div>
        </div>

        {demoError && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
            后端暂不可达，当前展示本地演示数据：{demoError}
          </div>
        )}

        {demoResult && <OperationDemoResultPanel result={demoResult} />}
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5" aria-label={t('welcome.quickActionsTitle')}>
        {quickActions.map(({ key, icon, accentClassName }) => {
          const prompt = t(`welcome.actions.${key}.prompt`);
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              data-testid={`workmate-action-${key}`}
              onClick={() => onSend(prompt)}
              className={cn(
                'group flex min-h-[132px] flex-col justify-between rounded-lg border border-sky-100 bg-white/86 p-4 text-left shadow-sm shadow-sky-950/5 transition-colors dark:border-white/10 dark:bg-card/80',
                'hover:border-sky-300 hover:bg-sky-50/70 dark:hover:bg-card',
                'disabled:cursor-not-allowed disabled:opacity-55',
              )}
            >
              <span className={cn('flex h-10 w-10 items-center justify-center rounded-lg', accentClassName)}>
                {icon}
              </span>
              <span>
                <span className="block text-sm font-semibold text-foreground">
                  {t(`welcome.actions.${key}.title`)}
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground line-clamp-2">
                  {t(`welcome.actions.${key}.description`)}
                </span>
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
                {t('welcome.actions.run')}
                <SendHorizontal className="h-3.5 w-3.5" />
              </span>
            </button>
          );
        })}
      </section>

      <section className="grid gap-3 md:grid-cols-3" aria-label={t('welcome.platformTitle')}>
        <CapabilityStripItem icon={<MapPinned className="h-4 w-4" />} title={t('welcome.platform.identity.title')} body={t('welcome.platform.identity.body')} />
        <CapabilityStripItem icon={<Sparkles className="h-4 w-4" />} title={t('welcome.platform.skills.title')} body={t('welcome.platform.skills.body')} />
        <CapabilityStripItem icon={<ShieldCheck className="h-4 w-4" />} title={t('welcome.platform.audit.title')} body={t('welcome.platform.audit.body')} />
      </section>

      <section className="text-left" aria-label={t('welcome.roadmap.title')}>
        <div className="mb-3 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-sky-600 dark:text-sky-300" />
          <h2 className="text-sm font-semibold text-foreground">{t('welcome.roadmap.title')}</h2>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {platformPlans.map(({ key, icon }) => (
            <CapabilityStripItem
              key={key}
              icon={icon}
              title={t(`welcome.roadmap.items.${key}.title`)}
              body={t(`welcome.roadmap.items.${key}.body`)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function OperationDemoResultPanel({ result }: { result: OperationDemoResult }) {
  const ticketRecords = result.ticketSearch.result?.records ?? [];
  const dispatchStatus = result.dispatchPreview.status;
  return (
    <div className="mt-4 grid gap-3 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="space-y-3">
        <div className="rounded-lg border border-sky-100 bg-sky-50/50 p-3 dark:border-white/10 dark:bg-sky-400/10">
          <div className="flex items-center gap-2 text-xs font-semibold text-sky-800 dark:text-sky-100">
            <BarChart3 className="h-4 w-4" />
            AI 分析摘要
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">{result.executiveSummary}</p>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <DemoMetric label="重点工单" value={`${ticketRecords.length} 条`} />
          <DemoMetric label="执行门控" value={dispatchStatus === 'confirmation_required' ? '等待确认' : dispatchStatus} />
        </div>

        <div className="rounded-lg border border-sky-100 bg-white p-3 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
            <FileCheck2 className="h-4 w-4 text-sky-600 dark:text-sky-300" />
            知识库引用
          </div>
          <div className="space-y-2">
            {result.knowledge.citations.map((citation) => (
              <div key={citation.documentId} className="rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 dark:bg-white/[0.04]">
                <div className="font-semibold text-foreground">{citation.title}</div>
                <div className="text-muted-foreground">{citation.summary || citation.category}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-lg border border-sky-100 bg-white p-3 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
            <Workflow className="h-4 w-4 text-sky-600 dark:text-sky-300" />
            执行链路
          </div>
          <div className="space-y-2">
            {result.flow.map((step) => (
              <div key={step.name} className="flex gap-2 rounded-md bg-slate-50 px-3 py-2 dark:bg-white/[0.04]">
                {step.status === 'pending_confirmation'
                  ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />}
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-foreground">{step.name}</div>
                  <div className="mt-0.5 text-2xs leading-4 text-muted-foreground">{step.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-sky-100 bg-white p-3 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
            <Wrench className="h-4 w-4 text-sky-600 dark:text-sky-300" />
            工单系统结果
          </div>
          <div className="space-y-2">
            {ticketRecords.map((record, index) => (
              <div key={String(record.ticketId ?? index)} className="rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 dark:bg-white/[0.04]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">{String(record.ticketId ?? `工单 ${index + 1}`)}</span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-2xs font-medium text-amber-700 dark:bg-amber-400/15 dark:text-amber-100">
                    {String(record.slaRisk ?? '待评估')}
                  </span>
                </div>
                <div className="mt-1 text-muted-foreground">
                  {String(record.enterprise ?? '入驻企业')} · {String(record.issue ?? '服务事项')} · {String(record.status ?? '处理中')}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DemoMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-sky-100 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="text-2xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function createLocalOperationDemoResult(): OperationDemoResult {
  const generatedAt = new Date().toISOString();
  return {
    scenarioTitle: '企业园区运营智能演示',
    businessGoal: '本周园区超时工单分析与督办建议',
    parkName: '示例产业园',
    modelMode: '本地演示数据',
    executiveSummary: '示例产业园当前识别到 2 条重点工单，其中 2 条存在 SLA 超时或高风险信号。建议优先处理影响企业办公的空调、网络问题，派单写回和督办通知需经人工确认后执行。',
    knowledge: {
      query: '示例产业园 工单 SLA 升级 回访 SOP',
      answerDraft: '演示数据',
      citations: [
        {
          documentId: 'local-sop',
          title: '园区报修处理 SOP',
          category: '运营制度',
          summary: '覆盖报修受理、派单、SLA 升级、回访和满意度闭环。',
        },
      ],
    },
    ticketSearch: {
      status: 'executed',
      toolName: 'workmate_park_ticketing_search_ticket',
      result: {
        mode: 'mock',
        adapter: 'ticketing',
        targetSystem: '企业工单平台',
        connectorKey: 'park-ticketing',
        capabilityName: 'search-ticket',
        summary: '已完成模拟工单查询，返回超时风险和处理建议。',
        businessGoal: '本周园区超时工单分析与督办建议',
        filters: {},
        payload: {},
        records: [
          { ticketId: 'TK-202605-3308', enterprise: '企业入驻企业 A', issue: '空调报修', status: '处理中', slaRisk: '2 小时后超时' },
          { ticketId: 'TK-202605-3310', enterprise: '企业入驻企业 B', issue: '网络故障', status: '待派单', slaRisk: '高' },
        ],
        nextActions: ['优先处理高 SLA 风险工单', '对低满意度工单触发二次回访'],
        generatedAt,
      },
      governance: {
        connectorId: 'local',
        connectorKey: 'park-ticketing',
        connectorType: 'ticketing',
        capabilityName: 'search-ticket',
        actionKind: 'read',
        riskLevel: 'low',
        requiredScopes: ['ticket:read'],
        dataDomains: ['工单', '园区', 'SLA', '企业服务'],
        humanConfirmationRequired: false,
        auditLevel: 'standard',
      },
    },
    dispatchPreview: {
      status: 'confirmation_required',
      toolName: 'workmate_park_ticketing_dispatch_ticket',
      requiresConfirmation: true,
      confirmation: {
        requestId: 'local-demo-confirmation',
        reason: '写入工单系统属于中风险动作，需要人工确认。',
        riskLevel: 'medium',
        actionKind: 'write',
        expiresAt: generatedAt,
      },
      governance: {
        connectorId: 'local',
        connectorKey: 'park-ticketing',
        connectorType: 'ticketing',
        capabilityName: 'dispatch-ticket',
        actionKind: 'write',
        riskLevel: 'medium',
        requiredScopes: ['ticket:write'],
        dataDomains: ['工单', '园区', 'SLA', '企业服务'],
        humanConfirmationRequired: true,
        auditLevel: 'standard',
      },
    },
    suggestedPrompt: '帮我汇总示例产业园本周超时工单，按园区和问题类型排序，分析主要原因，并生成督办建议。涉及通知或写回工单系统的动作请先让我确认。',
    flow: [
      { name: '识别目标', status: 'done', description: '理解用户要汇总超时工单、分析原因并生成督办建议。' },
      { name: '检索知识库', status: 'done', description: '读取园区报修 SOP、SLA 升级和满意度回访规则。' },
      { name: '查询工单系统', status: 'done', description: '通过 park-ticketing 只读 Tool 获取高风险工单。' },
      { name: '派单写回门控', status: 'pending_confirmation', description: '写入工单系统属于中风险动作，已生成确认请求，等待负责人确认。' },
      { name: '审计留痕', status: 'done', description: '记录调用人、目标系统、Tool、风险等级、输入和执行状态。' },
    ],
    valuePoints: [
      '一线员工只描述目标，平台自动完成知识库检索、工单系统查询和执行门控。',
      '只读查询自动执行，派单写回被识别为中风险动作并进入人工确认。',
      '每一步都有工具、权限、数据域和审计记录。',
    ],
    generatedAt,
  };
}

function CapabilityStripItem({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-sky-100 bg-white/72 px-4 py-3 text-left shadow-sm shadow-sky-950/5 dark:border-white/10 dark:bg-white/[0.03]">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-300">
        {icon}
      </span>
      <div>
        <div className="text-xs font-semibold text-foreground">{title}</div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

// ── Typing Indicator ────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full mt-1 bg-black/5 dark:bg-white/5 text-foreground">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="bg-black/5 dark:bg-white/5 text-foreground rounded-2xl px-4 py-3">
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

// ── Activity Indicator (shown between tool cycles) ─────────────

function ActivityIndicator({ phase }: { phase: 'tool_processing' }) {
  void phase;
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full mt-1 bg-black/5 dark:bg-white/5 text-foreground">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="bg-black/5 dark:bg-white/5 text-foreground rounded-2xl px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <span>Processing tool results…</span>
        </div>
      </div>
    </div>
  );
}

export default Chat;
