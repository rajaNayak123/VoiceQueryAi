import { useRef, useEffect, useState } from "react";

interface UploadDropzoneProps {
  onFileSelected?: (file: File) => void;
  onFilesSelected?: (files: File[]) => void;
  disabled?: boolean;
}

export function UploadDropzone({
  onFileSelected,
  onFilesSelected,
  disabled,
}: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Micro Canvas Particle Ring Centerpiece
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const dpr = window.devicePixelRatio || 1;
    const size = 110;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const particles: { angle: number; speed: number; radius: number; size: number; color: string }[] = [];
    const colors = ["#818cf8", "#a855f7", "#38bdf8", "#ec4899"];

    for (let i = 0; i < 32; i++) {
      particles.push({
        angle: (i / 32) * Math.PI * 2,
        speed: (Math.random() * 0.012 + 0.008) * (i % 2 === 0 ? 1 : -1),
        radius: 38 + (Math.random() - 0.5) * 8,
        size: Math.random() * 2 + 1.5,
        color: colors[i % colors.length],
      });
    }

    let pulse = 0;

    const render = () => {
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;

      pulse += 0.035;
      const currentRadiusScale = 1 + 0.05 * Math.sin(pulse);

      // Center glowing core
      const coreGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 32 * currentRadiusScale);
      coreGrad.addColorStop(0, "rgba(99, 102, 241, 0.35)");
      coreGrad.addColorStop(1, "transparent");
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 32 * currentRadiusScale, 0, Math.PI * 2);
      ctx.fill();

      // Orbiting particles
      particles.forEach((p) => {
        p.angle += p.speed;
        const r = p.radius * currentRadiusScale;
        const x = cx + r * Math.cos(p.angle);
        const y = cy + r * Math.sin(p.angle);

        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => cancelAnimationFrame(animId);
  }, []);

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const pdfs: File[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
        pdfs.push(f);
      }
    }

    if (pdfs.length === 0) {
      alert("Please upload valid PDF documents (.pdf).");
      return;
    }

    if (pdfs.length > 1 && onFilesSelected) {
      onFilesSelected(pdfs);
    } else if (onFilesSelected) {
      onFilesSelected(pdfs);
    } else if (onFileSelected) {
      onFileSelected(pdfs[0]);
    }
  }

  return (
    <div className="upload-card-wrapper">
      <div
        className={`dropzone-container ${disabled ? "disabled" : ""} ${isDragOver ? "drag-over" : ""}`}
        onClick={() => {
          if (!disabled) inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          if (!disabled) handleFiles(e.dataTransfer.files);
        }}
      >
        {/* Canvas Particle Ring Centerpiece */}
        <div className="dropzone-canvas-ring-box">
          <canvas ref={canvasRef} className="dropzone-ring-canvas" />
          <div className="dropzone-center-icon">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
        </div>

        <h3 className="dropzone-prompt-title">Select or Drop PDF Documents</h3>
        <p className="dropzone-prompt-subtitle">
          Select 1 document or upload 2+ PDFs at once for <strong>Multi-Document Comparison Mode</strong>
        </p>

        <button
          type="button"
          className="dropzone-browse-btn"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Browse & Upload PDFs
        </button>

        <div className="dropzone-footer-tags">
          <span className="tag-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            Single or Multi-PDF
          </span>
          <span className="tag-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            Doc A vs Doc B Comparison
          </span>
          <span className="tag-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            Qdrant Multi-Tenancy
          </span>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    </div>
  );
}
