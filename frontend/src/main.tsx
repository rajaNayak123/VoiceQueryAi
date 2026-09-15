import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import { dark } from "@clerk/themes";
import App from "./App";
import "./index.css";
import "./styles/home.css";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function Root() {
  if (!PUBLISHABLE_KEY) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0b0f17",
          color: "#f8fafc",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          fontFamily: "Inter, sans-serif",
          textAlign: "center",
        }}
      >
        <div
          style={{
            maxWidth: 520,
            background: "rgba(17, 24, 39, 0.85)",
            border: "1px solid rgba(99, 102, 241, 0.35)",
            borderRadius: 16,
            padding: "2.5rem 2rem",
            boxShadow: "0 15px 40px rgba(0,0,0,0.6)",
          }}
        >
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: "50%",
              background: "rgba(239, 68, 68, 0.15)",
              color: "#f87171",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.25rem",
              fontSize: "1.5rem",
            }}
          >
            !
          </div>
          <h2 style={{ fontSize: "1.4rem", marginBottom: "0.75rem", color: "#f8fafc" }}>
            Clerk Publishable Key Required
          </h2>
          <p style={{ color: "#94a3b8", lineHeight: 1.6, fontSize: "0.92rem", marginBottom: "1.5rem" }}>
            To enable user registration and login, please provide your Clerk publishable key in <code>frontend/.env</code>.
          </p>
          <div
            style={{
              background: "rgba(0, 0, 0, 0.45)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              padding: "0.85rem 1rem",
              borderRadius: 8,
              fontSize: "0.85rem",
              color: "#c7d2fe",
              fontFamily: "monospace",
              textAlign: "left",
              wordBreak: "break-all",
            }}
          >
            VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
          </div>
        </div>
      </div>
    );
  }

  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: "#6366f1",
          colorBackground: "#111827",
          colorText: "#f8fafc",
          colorInputBackground: "rgba(255, 255, 255, 0.05)",
        },
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ClerkProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
