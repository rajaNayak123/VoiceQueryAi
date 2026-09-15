import { useNavigate } from "react-router-dom";
import { AuroraGridCanvas } from "../components/visualizer/AuroraGridCanvas";

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="home-layout" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
      <AuroraGridCanvas />
      
      <div
        style={{
          position: "relative",
          zIndex: 10,
          textAlign: "center",
          maxWidth: "520px",
          padding: "3rem 2rem",
          background: "rgba(15, 23, 42, 0.75)",
          border: "1px solid rgba(99, 102, 241, 0.25)",
          borderRadius: "20px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
          backdropFilter: "blur(16px)",
          margin: "1rem",
        }}
      >
        <div
          style={{
            fontSize: "5rem",
            fontWeight: 800,
            lineHeight: 1,
            background: "linear-gradient(135deg, #818cf8, #c084fc, #38bdf8)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: "1rem",
            fontFamily: "Inter, sans-serif",
          }}
        >
          404
        </div>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#f8fafc", marginBottom: "0.75rem" }}>
          Page Not Found
        </h2>
        <p style={{ color: "#94a3b8", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "2rem" }}>
          The link you followed doesn't exist or has been moved. Explore your documents in the studio or head back home.
        </p>

        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-header-studio"
            onClick={() => navigate("/dashboard")}
            style={{ padding: "0.75rem 1.4rem", fontSize: "0.9rem" }}
          >
            <span>Document Studio</span>
            <span className="btn-arrow">→</span>
          </button>
          <button
            type="button"
            className="btn-header-login"
            onClick={() => navigate("/")}
            style={{ padding: "0.75rem 1.4rem", fontSize: "0.9rem" }}
          >
            Return Home
          </button>
        </div>
      </div>
    </div>
  );
}
