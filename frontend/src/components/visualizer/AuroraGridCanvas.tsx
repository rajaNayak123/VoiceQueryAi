import { useEffect, useRef } from "react";

export function AuroraGridCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef({
    x: -1000,
    y: -1000,
    targetX: -1000,
    targetY: -1000,
    active: false,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.targetX = e.clientX;
      mouseRef.current.targetY = e.clientY;
      mouseRef.current.active = true;
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);

    // Aurora plasma orbs
    const orbs = [
      { x: width * 0.25, y: height * 0.3, radius: 340, vx: 0.4, vy: 0.25, color: "rgba(99, 102, 241, " }, // Indigo
      { x: width * 0.75, y: height * 0.4, radius: 380, vx: -0.35, vy: 0.3, color: "rgba(168, 85, 247, " }, // Violet
      { x: width * 0.5, y: height * 0.7, radius: 320, vx: 0.3, vy: -0.35, color: "rgba(14, 165, 233, " }, // Cyan
    ];

    // Floating subtle embers
    const emberCount = 35;
    const embers: { x: number; y: number; vx: number; vy: number; radius: number; alpha: number }[] = [];
    for (let i = 0; i < emberCount; i++) {
      embers.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -Math.random() * 0.5 - 0.2,
        radius: Math.random() * 1.5 + 0.8,
        alpha: Math.random() * 0.6 + 0.2,
      });
    }

    const gridSpacing = 40;
    let time = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      time += 0.01;

      // Smooth mouse follow (spring physics)
      const mouse = mouseRef.current;
      if (mouse.active) {
        mouse.x += (mouse.targetX - mouse.x) * 0.08;
        mouse.y += (mouse.targetY - mouse.y) * 0.08;
      }

      // 1. Draw subtle drifting Aurora glow blobs
      orbs.forEach((orb) => {
        orb.x += orb.vx;
        orb.y += orb.vy;

        if (orb.x < -100 || orb.x > width + 100) orb.vx *= -1;
        if (orb.y < -100 || orb.y > height + 100) orb.vy *= -1;

        const pulseR = orb.radius + Math.sin(time + orb.x * 0.01) * 35;
        const grad = ctx.createRadialGradient(orb.x, orb.y, 20, orb.x, orb.y, pulseR);
        grad.addColorStop(0, `${orb.color}0.12)`);
        grad.addColorStop(0.5, `${orb.color}0.05)`);
        grad.addColorStop(1, "transparent");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, pulseR, 0, Math.PI * 2);
        ctx.fill();
      });

      // 2. Interactive Spotlight + Modern Dot Matrix Grid
      const cols = Math.ceil(width / gridSpacing);
      const rows = Math.ceil(height / gridSpacing);
      const spotlightRadius = 240;

      for (let c = 0; c <= cols; c++) {
        for (let r = 0; r <= rows; r++) {
          const x = c * gridSpacing;
          const y = r * gridSpacing;

          let dotAlpha = 0.045; // Default faint ambient visibility
          let dotRadius = 1.0;
          let dotColor = "rgba(255, 255, 255, ";

          // If mouse is active, calculate spotlight proximity
          if (mouse.active) {
            const dx = x - mouse.x;
            const dy = y - mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < spotlightRadius) {
              const intensity = 1 - dist / spotlightRadius;
              dotAlpha = 0.045 + intensity * 0.65;
              dotRadius = 1.0 + intensity * 1.8;
              dotColor = intensity > 0.4 ? "rgba(129, 140, 248, " : "rgba(168, 85, 247, ";
            }
          }

          ctx.beginPath();
          ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
          ctx.fillStyle = `${dotColor}${dotAlpha})`;
          ctx.fill();
        }
      }

      // 3. Floating ambient embers drifting upward
      embers.forEach((ember) => {
        ember.x += ember.vx;
        ember.y += ember.vy;

        if (ember.y < -10) {
          ember.y = height + 10;
          ember.x = Math.random() * width;
        }
        if (ember.x < 0) ember.x = width;
        if (ember.x > width) ember.x = 0;

        ctx.beginPath();
        ctx.arc(ember.x, ember.y, ember.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(165, 180, 252, ${ember.alpha * 0.7})`;
        ctx.fill();
      });

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
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
      }}
    />
  );
}
