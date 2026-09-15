import { useEffect, useRef } from "react";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  baseRadius: number;
}

interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
}

const COLORS = [
  "rgba(99, 102, 241, ", // Indigo
  "rgba(168, 85, 247, ", // Violet
  "rgba(56, 189, 248, ", // Sky
  "rgba(236, 72, 153, ", // Pink
];

export function AmbientBackgroundCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({
    x: -1000,
    y: -1000,
    active: false,
  });
  const ripplesRef = useRef<Ripple[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Responsive resize
    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    // Mouse events
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
      mouseRef.current.active = true;
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
    };

    const handleClick = (e: MouseEvent) => {
      ripplesRef.current.push({
        x: e.clientX,
        y: e.clientY,
        radius: 5,
        maxRadius: 180,
        alpha: 0.8,
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("click", handleClick);

    // Initialize Vector Nodes
    const count = Math.min(50, Math.floor((width * height) / 25000));
    const nodes: Node[] = [];
    for (let i = 0; i < count; i++) {
      const colorBase = COLORS[Math.floor(Math.random() * COLORS.length)];
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        radius: Math.random() * 2.5 + 1.5,
        baseRadius: Math.random() * 2.5 + 1.5,
        color: colorBase,
        alpha: Math.random() * 0.5 + 0.3,
      });
    }

    let wavePhase = 0;

    // Render loop
    const render = () => {
      ctx.clearRect(0, 0, width, height);
      wavePhase += 0.015;

      const mouse = mouseRef.current;

      // 1. Draw smooth fluid acoustic wave bands across the background
      ctx.lineWidth = 1.2;
      for (let w = 0; w < 3; w++) {
        ctx.beginPath();
        const baseOffset = height * (0.35 + w * 0.15);
        const freq = 0.0025 + w * 0.001;
        const amp = 30 + w * 18;
        const speed = wavePhase * (1 + w * 0.3);

        ctx.strokeStyle = w === 0
          ? "rgba(99, 102, 241, 0.09)"
          : w === 1
          ? "rgba(168, 85, 247, 0.07)"
          : "rgba(56, 189, 248, 0.06)";

        for (let x = 0; x <= width; x += 8) {
          // Add gentle mouse wave distortion
          let distToMouse = 0;
          if (mouse.active) {
            const dx = x - mouse.x;
            const dy = baseOffset - mouse.y;
            distToMouse = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 300);
          }

          const y =
            baseOffset +
            Math.sin(x * freq + speed) * (amp + distToMouse * 45) +
            Math.cos(x * freq * 0.5 - speed * 0.7) * (amp * 0.5);

          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // 2. Draw & update expanding acoustic ripples
      for (let i = ripplesRef.current.length - 1; i >= 0; i--) {
        const ripple = ripplesRef.current[i];
        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(168, 85, 247, ${ripple.alpha * 0.5})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        ripple.radius += 2.5;
        ripple.alpha -= 0.014;
        if (ripple.alpha <= 0 || ripple.radius >= ripple.maxRadius) {
          ripplesRef.current.splice(i, 1);
        }
      }

      // 3. Update & render vector nodes
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        node.x += node.vx;
        node.y += node.vy;

        // Bounce off edges
        if (node.x < 0 || node.x > width) node.vx *= -1;
        if (node.y < 0 || node.y > height) node.vy *= -1;

        // Mouse attraction/repulsion
        if (mouse.active) {
          const dx = mouse.x - node.x;
          const dy = mouse.y - node.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 180 && dist > 1) {
            const force = (1 - dist / 180) * 0.7;
            node.x += (dx / dist) * force;
            node.y += (dy / dist) * force;
            node.radius = node.baseRadius + (1 - dist / 180) * 3;
          } else {
            node.radius = node.baseRadius;
          }
        }

        // Draw node
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = `${node.color}${node.alpha})`;
        ctx.shadowColor = `${node.color}0.8)`;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Draw connections between nearby nodes (Vector space graph)
        for (let j = i + 1; j < nodes.length; j++) {
          const other = nodes[j];
          const dx = node.x - other.x;
          const dy = node.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 140) {
            const linkAlpha = (1 - dist / 140) * 0.18;
            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(other.x, other.y);
            ctx.strokeStyle = `rgba(99, 102, 241, ${linkAlpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("click", handleClick);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
        opacity: 0.85,
      }}
    />
  );
}
