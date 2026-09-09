import { useEffect, useRef, useState, useCallback } from "react";
import { createAudioAnalyser, RemoteAudioTrack, LocalAudioTrack } from "livekit-client";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-react";

export type VisualizerMode = "wave" | "equalizer" | "radial";

interface AudioWaveformVisualizerProps {
  trackRef?: TrackReferenceOrPlaceholder;
  state?: "idle" | "listening" | "thinking" | "speaking" | string;
  height?: number;
}

export function AudioWaveformVisualizer({
  trackRef,
  state = "idle",
  height = 110,
}: AudioWaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<VisualizerMode>("wave");
  const [volumeDb, setVolumeDb] = useState<number>(-100);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const phaseRef = useRef<number>(0);
  const peakHoldRef = useRef<number[]>([]);

  // Setup LiveKit Audio Analyser when track changes
  useEffect(() => {
    // Cleanup previous analyser
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
      analyserRef.current = null;
    }

    const track = trackRef?.publication?.track;
    if (
      (track instanceof RemoteAudioTrack || track instanceof LocalAudioTrack) &&
      track.mediaStreamTrack
    ) {
      try {
        const { analyser, cleanup } = createAudioAnalyser(track, {
          fftSize: 256,
          smoothingTimeConstant: 0.8,
          minDecibels: -90,
          maxDecibels: -10,
        });
        analyserRef.current = analyser;
        cleanupRef.current = cleanup;
      } catch (e) {
        console.debug("Failed to initialize audio analyser:", e);
      }
    }

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
        analyserRef.current = null;
      }
    };
  }, [trackRef]);

  // Main 60fps render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let isRunning = true;
    const bufferLength = analyserRef.current?.frequencyBinCount || 64;
    const freqData = new Uint8Array(bufferLength);

    const render = () => {
      if (!isRunning) return;

      const width = canvas.width;
      const h = canvas.height;
      phaseRef.current += 0.04;

      let energy = 0;
      if (analyserRef.current && state === "speaking") {
        analyserRef.current.getByteFrequencyData(freqData);

        let sum = 0;
        for (let i = 0; i < freqData.length; i++) {
          sum += freqData[i];
        }
        energy = sum / (freqData.length * 255); // 0 to 1
        const db = Math.round(-90 + energy * 80);
        setVolumeDb(db);
      } else {
        // Ambient synthetic breathing energy
        if (state === "listening") {
          energy = 0.12 + 0.06 * Math.sin(phaseRef.current * 1.5);
          setVolumeDb(-65);
        } else if (state === "thinking") {
          energy = 0.25 + 0.15 * Math.sin(phaseRef.current * 3);
          setVolumeDb(-45);
        } else {
          energy = 0.04 + 0.02 * Math.sin(phaseRef.current * 0.8);
          setVolumeDb(-90);
        }
      }

      ctx.clearRect(0, 0, width, h);

      if (mode === "wave") {
        drawFluidWave(ctx, width, h, energy, phaseRef.current, state);
      } else if (mode === "equalizer") {
        drawEqualizer(ctx, width, h, freqData, energy, peakHoldRef.current, state);
      } else if (mode === "radial") {
        drawRadialOrb(ctx, width, h, energy, phaseRef.current, state);
      }

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      isRunning = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [mode, state]);

  // Handle high-DPI canvas resizing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const toggleMode = useCallback(() => {
    setMode((prev) => {
      if (prev === "wave") return "equalizer";
      if (prev === "equalizer") return "radial";
      return "wave";
    });
  }, []);

  return (
    <div className="audio-visualizer-container" style={{ height }}>
      <div className="visualizer-header-row">
        <div className="visualizer-state-badge">
          <span className={`status-indicator-dot ${state}`} />
          <span className="state-label">
            {state === "speaking"
              ? "Agent Speaking"
              : state === "listening"
              ? "Listening to You"
              : state === "thinking"
              ? "Synthesizing Answer..."
              : "Ready"}
          </span>
        </div>

        <div className="visualizer-actions">
          {state === "speaking" && (
            <span className="db-meter">{volumeDb > -90 ? `${volumeDb} dB` : "Active"}</span>
          )}
          <button
            type="button"
            className="visualizer-mode-toggle"
            onClick={toggleMode}
            title={`Current mode: ${mode}. Click to change.`}
          >
            {mode === "wave" ? "🌊 Wave" : mode === "equalizer" ? "📊 Bars" : "⚡ Orb"}
          </button>
        </div>
      </div>

      <div className="canvas-wrapper">
        <canvas
          ref={canvasRef}
          className="waveform-canvas"
          style={{ width: "100%", height: height - 34 }}
          onClick={toggleMode}
          title="Click to switch visualizer style"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visualizer Renderers
// ---------------------------------------------------------------------------

function drawFluidWave(
  ctx: CanvasRenderingContext2D,
  width: number,
  h: number,
  energy: number,
  phase: number,
  state: string
) {
  const centerY = h / 2;
  const layers = [
    {
      color: "rgba(99, 102, 241, 0.25)",
      stroke: "#6366f1",
      freq: 0.015,
      speed: 1.0,
      ampMult: 1.0,
    },
    {
      color: "rgba(6, 182, 212, 0.20)",
      stroke: "#06b6d4",
      freq: 0.022,
      speed: -0.8,
      ampMult: 0.75,
    },
    {
      color: "rgba(236, 72, 153, 0.18)",
      stroke: "#ec4899",
      freq: 0.018,
      speed: 1.4,
      ampMult: 0.55,
    },
  ];

  layers.forEach((layer) => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, centerY);

    const baseAmp = (h * 0.35) * Math.max(0.12, energy * 1.5);

    for (let x = 0; x <= width; x += 4) {
      const envelope = Math.sin((x / width) * Math.PI); // Pin ends to zero
      const y =
        centerY +
        Math.sin(x * layer.freq + phase * layer.speed) *
          baseAmp *
          layer.ampMult *
          envelope;
      ctx.lineTo(x, y);
    }

    ctx.lineTo(width, h);
    ctx.lineTo(0, h);
    ctx.closePath();

    ctx.fillStyle = layer.color;
    ctx.fill();

    // Glowing stroke
    ctx.lineWidth = state === "speaking" ? 2.5 : 1.5;
    ctx.strokeStyle = layer.stroke;
    ctx.shadowColor = layer.stroke;
    ctx.shadowBlur = state === "speaking" ? 14 : 6;
    ctx.stroke();

    ctx.restore();
  });
}

function drawEqualizer(
  ctx: CanvasRenderingContext2D,
  width: number,
  h: number,
  freqData: Uint8Array,
  energy: number,
  peakHold: number[],
  state: string
) {
  const numBars = 32;
  const barWidth = Math.max(3, (width - (numBars - 1) * 3) / numBars);
  const gap = 3;
  const centerY = h / 2;

  while (peakHold.length < numBars) peakHold.push(0);

  for (let i = 0; i < numBars; i++) {
    const x = i * (barWidth + gap);
    // Sample frequency band with non-linear logarithmic distribution
    const dataIndex = Math.min(
      freqData.length - 1,
      Math.floor(Math.pow(i / numBars, 1.3) * (freqData.length - 1))
    );

    let val = freqData[dataIndex] / 255; // 0 to 1
    if (state !== "speaking") {
      val = (Math.sin(i * 0.3 + energy * 10) * 0.5 + 0.5) * energy;
    }

    const barHeight = Math.max(4, val * (h * 0.8));

    // Update peak hold
    if (barHeight > peakHold[i]) {
      peakHold[i] = barHeight;
    } else {
      peakHold[i] = Math.max(4, peakHold[i] - 1.2);
    }

    // Bar gradient
    const grad = ctx.createLinearGradient(0, centerY - barHeight / 2, 0, centerY + barHeight / 2);
    grad.addColorStop(0, "#06b6d4");
    grad.addColorStop(0.5, "#6366f1");
    grad.addColorStop(1, "#ec4899");

    ctx.save();
    ctx.fillStyle = grad;
    ctx.shadowColor = "#6366f1";
    ctx.shadowBlur = state === "speaking" ? 8 : 3;

    // Mirrored bar from center
    const yTop = centerY - barHeight / 2;
    roundRect(ctx, x, yTop, barWidth, barHeight, barWidth / 2);
    ctx.fill();

    // Floating peak cap
    const peakY = centerY - peakHold[i] / 2 - 3;
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(x, Math.max(2, peakY), barWidth, 2);

    ctx.restore();
  }
}

function drawRadialOrb(
  ctx: CanvasRenderingContext2D,
  width: number,
  h: number,
  energy: number,
  phase: number,
  state: string
) {
  const centerX = width / 2;
  const centerY = h / 2;
  const baseRadius = Math.min(width, h) * 0.24;
  const radius = baseRadius + energy * 25;

  ctx.save();

  // Radial pulsing aura
  const auraGrad = ctx.createRadialGradient(
    centerX,
    centerY,
    radius * 0.2,
    centerX,
    centerY,
    radius * 2.2
  );
  auraGrad.addColorStop(0, "rgba(99, 102, 241, 0.45)");
  auraGrad.addColorStop(0.5, "rgba(6, 182, 212, 0.20)");
  auraGrad.addColorStop(1, "rgba(11, 15, 23, 0)");

  ctx.fillStyle = auraGrad;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Multi-frequency spiked ring
  ctx.beginPath();
  const numSpikes = 48;
  for (let i = 0; i <= numSpikes; i++) {
    const angle = (i / numSpikes) * Math.PI * 2;
    const spikeDist =
      radius +
      Math.sin(angle * 6 + phase * 2) * (energy * 14) +
      Math.cos(angle * 12 - phase * 3) * (energy * 8);

    const x = centerX + Math.cos(angle) * spikeDist;
    const y = centerY + Math.sin(angle) * spikeDist;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();

  ctx.strokeStyle = state === "speaking" ? "#38bdf8" : "#818cf8";
  ctx.lineWidth = 2.5;
  ctx.shadowColor = "#6366f1";
  ctx.shadowBlur = 16;
  ctx.stroke();

  // Core orb
  const coreGrad = ctx.createRadialGradient(
    centerX,
    centerY,
    0,
    centerX,
    centerY,
    radius * 0.8
  );
  coreGrad.addColorStop(0, "#ffffff");
  coreGrad.addColorStop(0.3, "#818cf8");
  coreGrad.addColorStop(1, "#4338ca");

  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
