import { Spinner } from "../common/Spinner";
import type { DocumentStatus } from "../../types";

const STATUS_LABEL: Record<DocumentStatus, string> = {
  uploading: "Uploading...",
  processing: "Parsing and indexing your PDF...",
  ready: "Ready!",
  failed: "Processing failed.",
};

export function ProcessingStatus({
  status,
  failureReason,
}: {
  status: DocumentStatus;
  failureReason?: string | null;
}) {
  if (status === "failed") {
    return (
      <div style={{ color: "#dc2626" }}>
        <p>{STATUS_LABEL.failed}</p>
        {failureReason && <p style={{ fontSize: 14 }}>{failureReason}</p>}
      </div>
    );
  }

  if (status === "ready") {
    return <p style={{ color: "#16a34a", fontWeight: 600 }}>{STATUS_LABEL.ready}</p>;
  }

  return <Spinner label={STATUS_LABEL[status]} />;
}
