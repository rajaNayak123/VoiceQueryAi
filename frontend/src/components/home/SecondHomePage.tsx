interface SecondHomePageProps {
  onGetStarted: () => void;
  isSignedIn?: boolean;
}

export function SecondHomePage({ onGetStarted, isSignedIn }: SecondHomePageProps) {
  return (
    <section className="second-home-section" id="how-it-works">
      <div className="second-home-container">
        {/* User-Perspective Header */}
        <div className="second-header-block">
          <div className="second-badge">
            <span className="second-pulse-dot" />
            Designed for Effortless Reading
          </div>
          <h2 className="second-title">
            Talk to Any Document Like a <span className="hero-gradient-text">Human Assistant</span>
          </h2>
          <p className="second-subtitle">
            No more scrolling through hundreds of pages. Simply speak, listen, and get instant answers with the exact page highlighted.
          </p>
        </div>

        {/* 3 Simple Steps (User Perspective) */}
        <div className="user-steps-grid">
          {/* Step 1 */}
          <div className="user-step-card">
            <div className="user-step-badge-row">
              <span className="user-step-number">Step 1</span>
              <span className="user-step-pill">Instant</span>
            </div>
            <div className="user-step-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <line x1="9" y1="15" x2="15" y2="15"/>
              </svg>
            </div>
            <h3 className="user-step-title">Upload Any PDF</h3>
            <p className="user-step-desc">
              Drop in contracts, study notes, balance sheets, or instruction manuals. Your file is ready in seconds.
            </p>
            <div className="user-step-tags">
              <span className="step-tag">Research Papers</span>
              <span className="step-tag">Agreements</span>
              <span className="step-tag">Reports</span>
            </div>
          </div>

          {/* Step 2 */}
          <div className="user-step-card highlighted">
            <div className="user-step-badge-row">
              <span className="user-step-number">Step 2</span>
              <span className="user-step-pill active">Voice</span>
            </div>
            <div className="user-step-icon active">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
              </svg>
            </div>
            <h3 className="user-step-title">Ask Out Loud</h3>
            <p className="user-step-desc">
              Speak naturally like you’re talking to a colleague. Ask questions in English, Hindi, or mixed conversational style.
            </p>
            <div className="user-step-tags">
              <span className="step-tag active">Hands-Free</span>
              <span className="step-tag active">Interrupt Anytime</span>
              <span className="step-tag active">Bilingual</span>
            </div>
          </div>

          {/* Step 3 */}
          <div className="user-step-card">
            <div className="user-step-badge-row">
              <span className="user-step-number">Step 3</span>
              <span className="user-step-pill">Verified</span>
            </div>
            <div className="user-step-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                <polyline points="9 11 11 13 15 9"/>
              </svg>
            </div>
            <h3 className="user-step-title">Listen & Verify</h3>
            <p className="user-step-desc">
              Listen to the answer while the viewer automatically scrolls to the exact paragraph. You always see the real source.
            </p>
            <div className="user-step-tags">
              <span className="step-tag">Automatic Page Jump</span>
              <span className="step-tag">Zero Fake Answers</span>
            </div>
          </div>
        </div>

        {/* Live Conversation Simulation Card */}
        <div className="chat-demo-card">
          <div className="chat-demo-header">
            <div className="chat-demo-title-group">
              <div className="demo-live-dot" />
              <span className="demo-header-label">How a Conversation Sounds</span>
            </div>
            <span className="demo-doc-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", marginRight: 5, verticalAlign: -1 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Employment_Agreement.pdf
            </span>
          </div>

          <div className="chat-demo-messages">
            {/* User Question */}
            <div className="chat-demo-msg user">
              <div className="msg-avatar user">You</div>
              <div className="msg-bubble user">
                <div className="msg-audio-wave">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <p>“What is the notice period required if I decide to resign?”</p>
              </div>
            </div>

            {/* AI Spoken Answer */}
            <div className="chat-demo-msg agent">
              <div className="msg-avatar agent">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="22"/>
                </svg>
              </div>
              <div className="msg-bubble agent">
                <p>
                  According to <strong>Section 9.2 on page 6</strong>, the notice period is <strong>30 days</strong> in writing. You also have the option of pay in lieu of notice if approved by management.
                </p>
                <div className="msg-citation-pill">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <span>Auto-jumped to Page 6 • Clause 9.2 highlighted</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom CTA Action Banner */}
        <div className="second-bottom-banner">
          <div className="bottom-cta-text-group">
            <h3 className="bottom-cta-title">Ready to stop reading line-by-line?</h3>
            <p className="bottom-cta-desc">Upload your first document for free and ask your first spoken question in seconds.</p>
          </div>

          <button
            type="button"
            className="btn-second-launch"
            onClick={onGetStarted}
          >
            <span>{isSignedIn ? "Open Document Studio" : "Try It With Your PDF"}</span>
            <span className="cta-arrow">↗</span>
          </button>
        </div>
      </div>
    </section>
  );
}
