import { PropsWithChildren } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Navigate, useLocation } from "react-router-dom";

export function ProtectedRoute({ children }: PropsWithChildren) {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();

  if (!isLoaded) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#080c14",
          color: "#94a3b8",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            width: "36px",
            height: "36px",
            border: "3px solid rgba(99, 102, 241, 0.2)",
            borderTopColor: "#6366f1",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        <span style={{ fontSize: "0.9rem", letterSpacing: "0.02em" }}>Loading session...</span>
      </div>
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
