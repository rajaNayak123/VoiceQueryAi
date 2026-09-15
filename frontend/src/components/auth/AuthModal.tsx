import { useState, FormEvent } from "react";
import { useSignIn, useSignUp } from "@clerk/clerk-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "login" | "register";
  onLoginSuccess?: () => void;
}

export function AuthModal({ isOpen, onClose, initialMode = "login", onLoginSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { signIn, setActive: setActiveSignIn, isLoaded: isSignInLoaded } = useSignIn();
  const { signUp, setActive: setActiveSignUp, isLoaded: isSignUpLoaded } = useSignUp();

  if (!isOpen) return null;

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    if (!isSignInLoaded) return;
    setError(null);
    setLoading(true);

    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password,
      });

      if (result.status === "complete") {
        await setActiveSignIn({ session: result.createdSessionId });
        onClose();
        if (onLoginSuccess) {
          onLoginSuccess();
        }
      } else {
        setError(`Login status: ${result.status}. Please check your credentials.`);
      }
    } catch (err: any) {
      console.error("Clerk login error:", err);
      const message =
        err?.errors?.map((e: any) => e.longMessage || e.message).filter(Boolean).join(" • ") ||
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        "Failed to sign in";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    if (!isSignUpLoaded) return;
    setError(null);
    setLoading(true);

    try {
      const trimmedName = fullName.trim();
      const parts = trimmedName ? trimmedName.split(/\s+/) : [];
      const createPayload: Record<string, any> = {
        emailAddress: email.trim(),
        password,
      };

      if (parts.length > 0 && parts[0]) {
        createPayload.firstName = parts[0];
      }
      if (parts.length > 1) {
        createPayload.lastName = parts.slice(1).join(" ");
      }

      try {
        await signUp.create(createPayload);
      } catch (firstErr: any) {
        console.warn("Clerk signUp.create with name failed, inspecting error:", firstErr);
        const isNameParamError = firstErr?.errors?.some((e: any) =>
          e?.meta?.paramName === "first_name" ||
          e?.meta?.paramName === "last_name" ||
          e?.meta?.paramName === "name" ||
          e?.message?.toLowerCase().includes("first name") ||
          e?.message?.toLowerCase().includes("last name") ||
          e?.code === "form_param_unknown"
        );

        if (isNameParamError) {
          console.info("Retrying signUp.create with email & password only...");
          await signUp.create({
            emailAddress: email.trim(),
            password,
          });
        } else {
          throw firstErr;
        }
      }

      // Send email verification code
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setIsVerifying(true);
    } catch (err: any) {
      console.error("Clerk registration error:", err);
      const message =
        err?.errors?.map((e: any) => e.longMessage || e.message).filter(Boolean).join(" • ") ||
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        "Failed to register";

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyEmail(e: FormEvent) {
    e.preventDefault();
    if (!isSignUpLoaded) return;
    setError(null);
    setLoading(true);

    try {
      const completeSignUp = await signUp.attemptEmailAddressVerification({
        code: verificationCode.trim(),
      });

      if (completeSignUp.status === "complete") {
        await setActiveSignUp({ session: completeSignUp.createdSessionId });
        onClose();
        if (onLoginSuccess) {
          onLoginSuccess();
        }
      } else {
        setError("Verification incomplete. Please check the code and try again.");
      }
    } catch (err: any) {
      const message = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || "Failed to verify code";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function resetState(newMode: "login" | "register") {
    setMode(newMode);
    setError(null);
    setIsVerifying(false);
    setVerificationCode("");
  }

  return (
    <div className="auth-modal-backdrop" onClick={onClose}>
      <div className="auth-modal-dialog" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="auth-modal-close-btn"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>

        <div className="auth-modal-header">
          <h2 className="auth-modal-title">
            {isVerifying
              ? "Verify Email"
              : mode === "login"
              ? "Welcome Back"
              : "Create Account"}
          </h2>
          <p className="auth-modal-subtitle">
            {isVerifying
              ? `Enter the 6-digit verification code sent to ${email}`
              : mode === "login"
              ? "Sign in to query documents and start voice calls"
              : "Register to get started with VoiceQuery AI"}
          </p>
        </div>

        {!isVerifying && (
          <div className="auth-tabs-switcher">
            <button
              type="button"
              className={`auth-tab-btn ${mode === "login" ? "active" : ""}`}
              onClick={() => resetState("login")}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`auth-tab-btn ${mode === "register" ? "active" : ""}`}
              onClick={() => resetState("register")}
            >
              Register
            </button>
          </div>
        )}

        {error && <div className="auth-error-banner">{error}</div>}

        {isVerifying ? (
          <form className="auth-form" onSubmit={handleVerifyEmail}>
            <div className="form-group">
              <label className="form-label">Verification Code</label>
              <input
                type="text"
                className="form-input"
                placeholder="123456"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                required
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading || !verificationCode}
            >
              {loading ? "Verifying..." : "Complete Registration"}
            </button>
          </form>
        ) : mode === "login" ? (
          <form className="auth-form" onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading || !email || !password}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleRegister}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="Raja Nayak"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <span style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "4px", display: "block" }}>
                Minimum 8 characters
              </span>
            </div>

            {/* Clerk Smart / Turnstile Bot Protection CAPTCHA container */}
            <div id="clerk-captcha" data-cl-theme="dark" style={{ minHeight: "65px", margin: "10px 0" }} />

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading || !fullName || !email || !password}
            >
              {loading ? "Creating account..." : "Register"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
