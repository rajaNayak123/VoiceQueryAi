import { useEffect, useRef, useState } from "react";

export type CanvasMode = "waves" | "sphere" | "spectrum";

interface HeroCanvasVisualizerProps {
  onInteract?: () => void;
}

export function HeroCanvasVisualizer({ onInteract }: HeroCanvasVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<CanvasMode>("waves");
  const [isSimulating, setIsSimulating] = useState(false);
  const [energyLevel, setEnergyLevel] = useState(0.45);

  const mousePosRef = useRef({ x: 0.5, y: 0.5, isHovering: false });
  const phaseRef = useRef(0);
  const sphereAngleRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener("resize", resize);

    // 3D sphere points for "sphere" mode
    const spherePoints: { x: number; y: number; z: number; origR: number }[] = [];
    const numPoints = 140;
    for (let i = 0; i < numPoints; i++) {
      const phi = Math.acos(-1 + (2 * i) / numPoints);
      const theta = Math.sqrt(numPoints * Math.PI) * phi;
      const r = 58;
      spherePoints.push({
        x: r * Math.cos(theta) * Math.sin(phi),
        y: r * Math.sin(theta) * Math.sin(phi),
        z: r * Math.cos(phi),
        origR: r,
      });
    }

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      ctx.clearRect(0, 0, w, h);

      phaseRef.current += isSimulating ? 0.08 : 0.035;
      sphereAngleRef.current += 0.012;

      const mouse = mousePosRef.current;
      const currentEnergy = isSimulating
        ? 0.75 + 0.25 * Math.sin(phaseRef.current * 3)
        : energyLevel + (mouse.isHovering ? 0.2 : 0);

      // --- MODE 1: LIQUID ACOUSTIC WAVES ---
      if (mode === "waves") {
        const centerY = h / 2;
        const waveLayers = [
          { color: "rgba(99, 102, 241, ", speed: 1.0, freq: 0.018, amp: 26 },
          { color: "rgba(168, 85, 247, ", speed: 1.3, freq: 0.024, amp: 20 },
          { color: "rgba(56, 189, 248, ", speed: 0.8, freq: 0.015, amp: 32 },
          { color: "rgba(236, 72, 153, ", speed: 1.5, freq: 0.03, amp: 16 },
        ];

        waveLayers.forEach((layer, idx) => {
          ctx.beginPath();
          ctx.lineWidth = 2.2;
          ctx.strokeStyle = `${layer.color}0.85)`;

          // Subtle gradient fill under primary wave
          let grad: CanvasGradient | null = null;
          if (idx === 0) {
            grad = ctx.createLinearGradient(0, centerY - 40, 0, centerY + 40);
            grad.addColorStop(0, `${layer.color}0.22)`);
            grad.addColorStop(1, `${layer.color}0.0)`);
          }

          for (let x = 0; x <= w; x += 4) {
            // Mouse proximity distortion
            const normalizedX = x / w;
            const distToMouse = Math.abs(normalizedX - mouse.x);
            const mouseInfluence = Math.max(0, 1 - distToMouse * 3.5);

            // Envelope to taper at ends
            const envelope = Math.sin((x / w) * Math.PI);

            const y =
              centerY +
              Math.sin(x * layer.freq + phaseRef.current * layer.speed) *
                layer.amp *
                currentEnergy *
                envelope +
              Math.cos(x * layer.freq * 0.5 - phaseRef.current * 0.7) *
                (layer.amp * 0.4) *
                envelope +
              (mouse.isHovering ? (mouse.y - 0.5) * 35 * mouseInfluence : 0);

            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }

          ctx.shadowColor = `${layer.color}0.6)`;
          ctx.shadowBlur = 12;
          ctx.stroke();
          ctx.shadowBlur = 0;

          if (grad && idx === 0) {
            ctx.lineTo(w, h);
            ctx.lineTo(0, h);
            ctx.fillStyle = grad;
            ctx.fill();
          }
        });

        // Center Voice Pulse Orb
        const orbRadius = 14 + currentEnergy * 10;
        const orbGrad = ctx.createRadialGradient(
          w / 2,
          h / 2,
          2,
          w / 2,
          h / 2,
          orbRadius * 2
        );
        orbGrad.addColorStop(0, "rgba(255, 255, 255, 0.9)");
        orbGrad.addColorStop(0.3, "rgba(99, 102, 241, 0.8)");
        orbGrad.addColorStop(0.7, "rgba(168, 85, 247, 0.3)");
        orbGrad.addColorStop(1, "transparent");

        ctx.beginPath();
        ctx.arc(w / 2, h / 2, orbRadius * 2, 0, Math.PI * 2);
        ctx.fillStyle = orbGrad;
        ctx.fill();
      }

      // --- MODE 2: 3D VECTOR NEURAL SPHERE ---
      else if (mode === "sphere") {
        const cx = w / 2;
        const cy = h / 2;
        const angleX = sphereAngleRef.current + (mouse.x - 0.5) * 1.5;
        const angleY = sphereAngleRef.current * 0.8 + (mouse.y - 0.5) * 1.5;

        const cosX = Math.cos(angleX);
        const sinX = Math.sin(angleX);
        const cosY = Math.cos(angleY);
        const sinY = Math.sin(angleY);

        const projected: { x: number; y: number; scale: number; alpha: number }[] = [];

        spherePoints.forEach((p, idx) => {
          // Dynamic radius pulsation based on energy
          const pulse = Math.sin(phaseRef.current * 2 + idx * 0.1) * (currentEnergy * 18);
          const r = p.origR + pulse;

          const norm = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z) || 1;
          const px = (p.x / norm) * r;
          const py = (p.y / norm) * r;
          const pz = (p.z / norm) * r;

          // 3D rotation
          let x1 = px * cosX - pz * sinX;
          let z1 = pz * cosX + px * sinX;
          let y1 = py * cosY - z1 * sinY;
          let z2 = z1 * cosY + py * sinY;

          const fov = 200;
          const scale = fov / (fov + z2 + 80);
          const x2d = cx + x1 * scale;
          const y2d = cy + y1 * scale;
          const alpha = Math.max(0.1, Math.min(1, (z2 + 60) / 120));

          projected.push({ x: x2d, y: y2d, scale, alpha });
        });

        // Draw connections between nearby projected points
        for (let i = 0; i < projected.length; i++) {
          for (let j = i + 1; j < projected.length; j++) {
            const p1 = projected[i];
            const p2 = projected[j];
            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 32 * p1.scale) {
              const linkAlpha = (1 - dist / (32 * p1.scale)) * p1.alpha * 0.35;
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.strokeStyle = `rgba(168, 85, 247, ${linkAlpha})`;
              ctx.lineWidth = 0.9;
              ctx.stroke();
            }
          }
        }

        // Draw nodes
        projected.forEach((p) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(1, 2.8 * p.scale), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(129, 140, 248, ${p.alpha * 0.9})`;
          ctx.shadowColor = "rgba(99, 102, 241, 0.8)";
          ctx.shadowBlur = 6 * p.scale;
          ctx.fill();
          ctx.shadowBlur = 0;
        });
      }

      // --- MODE 3: NEON ACOUSTIC SPECTRUM ---
      else if (mode === "spectrum") {
        const barCount = 42;
        const barWidth = Math.max(3, (w - (barCount - 1) * 4) / barCount);
        const maxBarHeight = h * 0.75;
        const baseY = h * 0.85;

        for (let i = 0; i < barCount; i++) {
          const normI = i / (barCount - 1);
          // Bell curve shaping
          const bell = Math.sin(normI * Math.PI);

          // Simulated dynamic frequencies
          const freqWave =
            Math.sin(phaseRef.current * 2.5 + i * 0.32) * 0.35 +
            Math.cos(phaseRef.current * 1.8 - i * 0.2) * 0.25 +
            0.5;

          const mouseDist = Math.abs(normI - mouse.x);
          const mouseBoost = mouse.isHovering ? Math.max(0, 1 - mouseDist * 4) * 0.3 : 0;

          const barHeight = Math.max(
            6,
            (freqWave * currentEnergy + mouseBoost) * maxBarHeight * bell
          );
          const x = i * (barWidth + 4);
          const y = baseY - barHeight;

          // Gradient for bar
          const barGrad = ctx.createLinearGradient(0, y, 0, baseY);
          barGrad.addColorStop(0, "#ec4899");
          barGrad.addColorStop(0.5, "#a855f7");
          barGrad.addColorStop(1, "#6366f1");

          ctx.fillStyle = barGrad;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0]);
          ctx.fill();

          // Peak dot
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(x + barWidth / 2, y - 3, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, [mode, isSimulating, energyLevel]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mousePosRef.current = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
      isHovering: true,
    };
  };

  const handleMouseLeave = () => {
    mousePosRef.current.isHovering = false;
  };

  const handleClick = () => {
    setEnergyLevel((prev) => Math.min(1.0, prev + 0.25));
    setTimeout(() => setEnergyLevel(0.45), 800);
    if (onInteract) onInteract();
  };

  return (
    <div className="canvas-visualizer-card">
      <div className="canvas-card-top-bar">
        <div className="canvas-card-title-group">
          <div className="canvas-pulse-dot" />
          <span className="canvas-title-text">Live Voice & Vector Synthesis</span>
        </div>

        {/* Mode Selector Tabs */}
        <div className="canvas-mode-tabs">
          <button
            type="button"
            className={`canvas-mode-btn ${mode === "waves" ? "active" : ""}`}
            onClick={() => setMode("waves")}
            title="Acoustic Voice Waves"
          >
            Waves
          </button>
          <button
            type="button"
            className={`canvas-mode-btn ${mode === "sphere" ? "active" : ""}`}
            onClick={() => setMode("sphere")}
            title="Vector Space Sphere"
          >
            Vectors
          </button>
          <button
            type="button"
            className={`canvas-mode-btn ${mode === "spectrum" ? "active" : ""}`}
            onClick={() => setMode("spectrum")}
            title="Acoustic Spectrum"
          >
            Spectrum
          </button>
        </div>
      </div>

      {/* The Interactive Canvas */}
      <div className="canvas-display-wrapper">
        <canvas
          ref={canvasRef}
          className="hero-interactive-canvas"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          title="Move cursor or click to interact with the acoustic canvas"
        />
        <div className="canvas-watermark-overlay">
          <span>Move mouse to modulate • Click to surge wave</span>
        </div>
      </div>

      {/* Interactive Bottom Toolbar */}
      <div className="canvas-card-bottom-bar">
        <button
          type="button"
          className={`canvas-sim-btn ${isSimulating ? "active" : ""}`}
          onClick={() => setIsSimulating(!isSimulating)}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          {isSimulating ? "Stop Voice Pulse" : "Simulate Live Voice"}
        </button>

        <div className="canvas-metrics-pills">
          <span className="metric-pill">
            <span className="metric-dot live" /> 16kHz STT
          </span>
          <span className="metric-pill">
            <span className="metric-dot live" /> 384-Dim Qdrant
          </span>
          <span className="metric-pill">
            <span className="metric-dot live" /> &lt;200ms E2E
          </span>
        </div>
      </div>
    </div>
  );
}
