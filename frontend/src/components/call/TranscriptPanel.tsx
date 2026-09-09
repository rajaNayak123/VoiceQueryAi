import { LiveTranscript } from "./LiveTranscript";
import type { Citation, TelemetryMetrics } from "../../types";

export interface TranscriptPanelProps {
  citations?: Citation[];
  selectedCitation?: Citation | null;
  onSelectCitation?: (citation: Citation) => void;
  latestTelemetry?: TelemetryMetrics | null;
  telemetryHistory?: TelemetryMetrics[];
}

export function TranscriptPanel({
  citations,
  selectedCitation,
  onSelectCitation,
  latestTelemetry,
  telemetryHistory,
}: TranscriptPanelProps) {
  return (
    <div className="transcript-panel-wrapper">
      <LiveTranscript
        citations={citations}
        selectedCitation={selectedCitation}
        onSelectCitation={onSelectCitation}
        latestTelemetry={latestTelemetry}
        telemetryHistory={telemetryHistory}
      />
    </div>
  );
}

