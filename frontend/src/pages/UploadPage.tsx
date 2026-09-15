import { useState } from "react";
import { useUser, UserButton, SignedIn, SignedOut } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { AuthModal } from "../components/auth/AuthModal";
import { AuroraGridCanvas } from "../components/visualizer/AuroraGridCanvas";
import { HeroCanvasVisualizer } from "../components/visualizer/HeroCanvasVisualizer";
import { SecondHomePage } from "../components/home/SecondHomePage";

interface UploadPageProps {
  onNavigateDashboard?: () => void;
  isSignedIn?: boolean;
}

export function UploadPage({ onNavigateDashboard, isSignedIn: propIsSignedIn }: UploadPageProps) {
  const navigate = useNavigate();
  const { user, isSignedIn: clerkIsSignedIn } = useUser();
  const isSignedIn = propIsSignedIn !== undefined ? propIsSignedIn : Boolean(clerkIsSignedIn);

  const goToDashboard = () => {
    if (onNavigateDashboard) {
      onNavigateDashboard();
    } else {
      navigate("/dashboard");
    }
  };

  // Auth modal state
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  function scrollToSecondPage() {
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="home-layout">
      {/* Interactive Spotlight Matrix & Aurora Canvas Background */}
      <AuroraGridCanvas />

      {/* SCREEN 1: Hero & Voice Synthesizer Viewport */}
      <div className="home-screen-one">
        {/* Header */}
        <header className="home-header">
          <div className="home-logo-group">
            <div className="home-logo-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" x2="12" y1="19" y2="22"/>
              </svg>
            </div>
            <div>
              <span className="home-logo-text">VoiceQuery</span>
              <span className="home-logo-accent">AI</span>
            </div>
          </div>

          <div className="header-right-group">
            <SignedIn>
              <div className="user-profile-badge">
                <button
                  type="button"
                  className="btn-header-studio"
                  onClick={goToDashboard}
                >
                  <span>Document Studio</span>
                  <span className="btn-arrow">→</span>
                </button>
                <span className="user-display-name">
                  {user?.firstName ? `Hi, ${user.firstName}` : user?.primaryEmailAddress?.emailAddress}
                </span>
                <UserButton afterSignOutUrl="/" />
              </div>
            </SignedIn>

            <SignedOut>
              <div className="auth-header-actions">
                <button
                  type="button"
                  className="btn-header-login"
                  onClick={() => {
                    setAuthMode("login");
                    setIsAuthOpen(true);
                  }}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  className="btn-header-register"
                  onClick={() => {
                    setAuthMode("register");
                    setIsAuthOpen(true);
                  }}
                >
                  Create Account
                </button>
              </div>
            </SignedOut>
          </div>
        </header>

        {/* Main Content */}
        <main className="home-main-content">
          {/* Centered Hero Narrative Section */}
          <section className="hero-header-section">
            <h1 className="hero-title">
              Next-gen voice for <span className="hero-gradient-text">your documents</span>
            </h1>
          </section>

          {/* Voice Acoustics Synthesizer Visualizer */}
          <section className="horizontal-studio-section">
            <HeroCanvasVisualizer />
          </section>
        </main>

        {/* Floating Scroll Down Indicator */}
        <div className="screen-scroll-indicator-wrap">
          <button
            type="button"
            className="screen-scroll-down-btn"
            onClick={scrollToSecondPage}
            title="See how it works"
          >
            <span>See How It Works</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>
      </div>

      {/* SCREEN 2: Dedicated Second Home Page */}
      <SecondHomePage
        onGetStarted={() => {
          if (isSignedIn) {
            goToDashboard();
          } else {
            setAuthMode("register");
            setIsAuthOpen(true);
          }
        }}
        isSignedIn={isSignedIn}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        initialMode={authMode}
        onLoginSuccess={goToDashboard}
      />
    </div>
  );
}
