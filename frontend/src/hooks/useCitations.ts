import { useEffect, useState, useCallback } from "react";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import type { Citation, CitationPacket, SpotlightPayload, TelemetryMetrics } from "../types";

export function useCitations() {
  const room = useRoomContext();
  const [citations, setCitations] = useState<Citation[]>([]);
  const [allCitations, setAllCitations] = useState<Citation[]>([]);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [activeSpotlight, setActiveSpotlight] = useState<SpotlightPayload | null>(null);
  const [agentSpeaking, setAgentSpeaking] = useState<boolean>(false);
  const [latestTelemetry, setLatestTelemetry] = useState<TelemetryMetrics | null>(null);
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryMetrics[]>([]);
  const [activePhase, setActivePhase] = useState<"idle" | "stt" | "retrieval" | "llm" | "tts" | "completed">("idle");
  const [activeQuery, setActiveQuery] = useState<string>("");

  useEffect(() => {
    if (!room) return;

    const handleDataReceived = (
      payload: Uint8Array,
      _participant?: unknown,
      _kind?: unknown,
      topic?: string
    ) => {
      // Filter out unrelated topics if specified
      if (topic && topic !== "citations" && topic !== "telemetry" && topic !== "") return;

      try {
        const text = new TextDecoder().decode(payload);
        const data = JSON.parse(text) as CitationPacket;

        if (data.type === "query_phase") {
          if (data.phase) {
            setActivePhase(data.phase as any);
          }
          if (data.query) {
            setActiveQuery(data.query);
          }
        } else if (data.type === "query_telemetry" && data.metrics) {
          setLatestTelemetry(data.metrics);
          setTelemetryHistory((prev) => [...prev, data.metrics!]);
          setActivePhase("completed");
          if (data.metrics.query) {
            setActiveQuery(data.metrics.query);
          }
        } else if (data.type === "pdf_spotlight") {
          const spot = data.spotlight || {
            page_number: data.page_number || 1,
            pageIndex: (data.page_number ? data.page_number - 1 : 0),
            coordinates: data.coordinates,
            agentSpeaking: data.agentSpeaking ?? true,
          };
          setActiveSpotlight({
            ...spot,
            agentSpeaking: data.agentSpeaking ?? true,
            timestamp: Date.now(),
          });
          if (data.agentSpeaking !== false) {
            setAgentSpeaking(true);
            setActivePhase("tts");
          }
        } else if (data.type === "citations_retrieved" || data.type === "citation_highlight") {
          const newCitations = data.citations || [];
          setCitations(newCitations);

          if (newCitations.length > 0) {
            const primaryCitation = newCitations[0];
            setSelectedCitation(primaryCitation);
            // Accumulate in historical citations list, avoiding duplicates
            setAllCitations((prev) => {
              const existingIds = new Set(prev.map((c) => c.id));
              const additions = newCitations.filter((c) => !existingIds.has(c.id));
              return [...prev, ...additions];
            });

            // Set spotlight follow-along target
            const coords =
              data.coordinates ||
              data.spotlight?.coordinates ||
              primaryCitation.coordinates ||
              primaryCitation.bbox ||
              primaryCitation.boxes?.[0];

            const pageNum =
              data.page_number ||
              data.spotlight?.page_number ||
              primaryCitation.page_number ||
              primaryCitation.page;

            const pageIdx =
              data.spotlight?.pageIndex ??
              primaryCitation.pageIndex ??
              Math.max(0, pageNum - 1);

            setActiveSpotlight({
              page_number: pageNum,
              pageIndex: pageIdx,
              coordinates: coords,
              section: data.spotlight?.section || primaryCitation.section,
              snippet: data.spotlight?.snippet || primaryCitation.snippet,
              citationId: data.spotlight?.citationId || primaryCitation.id,
              agentSpeaking: data.type === "citation_highlight" ? (data.agentSpeaking ?? true) : false,
              timestamp: Date.now(),
            });
          }

          if (data.type === "citation_highlight") {
            setAgentSpeaking(data.agentSpeaking ?? true);
            setActivePhase("tts");
          }
        } else if (data.type === "interruption") {
          setAgentSpeaking(false);
          setActivePhase("idle");
          setActiveSpotlight((prev) => (prev ? { ...prev, agentSpeaking: false } : null));
        } else if (data.type === "agent_state") {
          setAgentSpeaking(data.agentSpeaking ?? false);
          if (data.citations && data.citations.length > 0) {
            setCitations(data.citations);
          }
          if (data.state === "listening" || data.state === "idle") {
            setActivePhase("idle");
            setActiveSpotlight((prev) => (prev ? { ...prev, agentSpeaking: false } : null));
          }
        }
      } catch {
        // Ignored if non-JSON data packet
      }
    };

    room.on(RoomEvent.DataReceived, handleDataReceived);

    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
    };
  }, [room]);

  const selectCitation = useCallback((citation: Citation | null) => {
    setSelectedCitation(citation);
    if (citation) {
      setActiveSpotlight({
        page_number: citation.page_number || citation.page,
        pageIndex: citation.pageIndex,
        coordinates: citation.coordinates || citation.bbox || citation.boxes?.[0],
        section: citation.section,
        snippet: citation.snippet,
        citationId: citation.id,
        agentSpeaking: false,
        timestamp: Date.now(),
      });
    }
  }, []);

  const triggerSpotlight = useCallback((spotlight: SpotlightPayload) => {
    setActiveSpotlight({
      ...spotlight,
      timestamp: Date.now(),
    });
  }, []);

  const stopAgentSpeaking = useCallback(() => {
    setAgentSpeaking(false);
    setActiveSpotlight((prev) => (prev ? { ...prev, agentSpeaking: false } : null));
  }, []);

  return {
    citations,
    allCitations,
    selectedCitation,
    activeSpotlight,
    agentSpeaking,
    latestTelemetry,
    telemetryHistory,
    activePhase,
    activeQuery,
    selectCitation,
    triggerSpotlight,
    stopAgentSpeaking,
  };
}

