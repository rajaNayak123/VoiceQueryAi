import { useEffect, useState, useCallback } from "react";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import type { Citation, CitationPacket, TelemetryMetrics } from "../types";

export function useCitations() {
  const room = useRoomContext();
  const [citations, setCitations] = useState<Citation[]>([]);
  const [allCitations, setAllCitations] = useState<Citation[]>([]);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [agentSpeaking, setAgentSpeaking] = useState<boolean>(false);
  const [latestTelemetry, setLatestTelemetry] = useState<TelemetryMetrics | null>(null);
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryMetrics[]>([]);

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

        if (data.type === "query_telemetry" && data.metrics) {
          setLatestTelemetry(data.metrics);
          setTelemetryHistory((prev) => [...prev, data.metrics!]);
        } else if (data.type === "citations_retrieved" || data.type === "citation_highlight") {
          const newCitations = data.citations || [];
          setCitations(newCitations);

          if (newCitations.length > 0) {
            setSelectedCitation(newCitations[0]);
            // Accumulate in historical citations list, avoiding duplicates
            setAllCitations((prev) => {
              const existingIds = new Set(prev.map((c) => c.id));
              const additions = newCitations.filter((c) => !existingIds.has(c.id));
              return [...prev, ...additions];
            });
          }

          if (data.type === "citation_highlight") {
            setAgentSpeaking(data.agentSpeaking ?? true);
          }
        } else if (data.type === "interruption") {
          setAgentSpeaking(false);
        } else if (data.type === "agent_state") {
          setAgentSpeaking(data.agentSpeaking ?? false);
          if (data.citations && data.citations.length > 0) {
            setCitations(data.citations);
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
  }, []);

  const stopAgentSpeaking = useCallback(() => {
    setAgentSpeaking(false);
  }, []);

  return {
    citations,
    allCitations,
    selectedCitation,
    agentSpeaking,
    latestTelemetry,
    telemetryHistory,
    selectCitation,
    stopAgentSpeaking,
  };
}

