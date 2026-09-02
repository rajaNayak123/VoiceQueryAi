import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { Button } from "../common/Button";

interface UploadDropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export function UploadDropzone({ onFileSelected, disabled }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  function validateAndEmit(file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf") {
      alert("Only PDF files are accepted.");
      return;
    }
    onFileSelected(file);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    if (disabled) return;
    validateAndEmit(e.dataTransfer.files?.[0]);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
      style={{
        border: `2px dashed ${dragActive ? "#4f46e5" : "#cbd5e1"}`,
        borderRadius: 12,
        padding: 40,
        textAlign: "center",
        background: dragActive ? "#eef2ff" : "#f8fafc",
      }}
    >
      <p style={{ marginBottom: 16, color: "#475569" }}>
        Drag and drop a PDF here, or
      </p>
      <Button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        Choose PDF
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => validateAndEmit(e.target.files?.[0])}
      />
    </div>
  );
}
