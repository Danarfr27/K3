"use client";

import { useEffect, useState, useRef } from "react";

const GLITCH_CHARS = "!@#$%^&*()_+-=[]{}|;:,.<>?/~`";

export default function SplashPage() {
  const [remaining, setRemaining] = useState(7);
  const [glitchTitle, setGlitchTitle] = useState("K3_AI");
  const shellRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const particlesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get("next") || "/chat";

    const redirectTimer = window.setTimeout(() => {
      window.location.replace(target);
    }, 7000);

    const countdownTimer = window.setInterval(() => {
      setRemaining((value) => Math.max(value - 1, 0));
    }, 1000);

    return () => {
      window.clearTimeout(redirectTimer);
      window.clearInterval(countdownTimer);
    };
  }, []);

  // Parallax mouse effect
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const handleMove = (e: MouseEvent) => {
      const rect = shell.getBoundingClientRect();
      const x = (e.clientX - rect.left - rect.width / 2) / rect.width;
      const y = (e.clientY - rect.top - rect.height / 2) / rect.height;

      const layers = shell.querySelectorAll<HTMLElement>(".parallax-layer");
      layers.forEach((layer) => {
        const speed = parseFloat(layer.dataset.speed || "0.03");
        layer.style.transform = `translate(${x * speed * 100}px, ${y * speed * 100}px)`;
      });

      const content = contentRef.current;
      if (content) {
        const tiltX = y * -3;
        const tiltY = x * 3;
        content.style.transform = `perspective(1200px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
      }
    };

    const handleLeave = () => {
      const layers = shell.querySelectorAll<HTMLElement>(".parallax-layer");
      layers.forEach((layer) => { layer.style.transform = "translate(0,0)"; });
      if (contentRef.current) {
        contentRef.current.style.transform = "perspective(1200px) rotateX(0deg) rotateY(0deg)";
      }
    };

    shell.addEventListener("mousemove", handleMove);
    shell.addEventListener("mouseleave", handleLeave);
    return () => {
      shell.removeEventListener("mousemove", handleMove);
      shell.removeEventListener("mouseleave", handleLeave);
    };
  }, []);

  // Glitch effect on K3_AI title
  useEffect(() => {
    const original = "K3_AI";
    const runGlitch = () => {
      if (Math.random() > 0.6) {
        const pos = Math.floor(Math.random() * original.length);
        const glitched =
          original.slice(0, pos) +
          GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)] +
          original.slice(pos + 1);
        setGlitchTitle(glitched);
        setTimeout(() => setGlitchTitle(original), 80);
      }
      setTimeout(runGlitch, Math.random() * 2000 + 600);
    };
    const timer = setTimeout(runGlitch, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Floating particles
  useEffect(() => {
    const container = particlesRef.current;
    if (!container) return;
    const colors = ["#00ff9c", "#bd3e24", "#00e5ff"];
    
    for (let i = 0; i < 18; i++) {
      const p = document.createElement("div");
      p.className = "particle";
      const size = Math.random() * 3 + 1;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const duration = Math.random() * 5 + 4;
      const delay = Math.random() * 3;
      
      p.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        background: ${color};
        left: ${Math.random() * 100}%;
        top: ${Math.random() * 100}%;
        opacity: ${Math.random() * 0.3 + 0.1};
        animation: float ${duration}s ease-in-out ${delay}s infinite,
                   particlePulse ${duration * 0.8}s ease-in-out ${delay}s infinite;
        box-shadow: 0 0 ${Math.random() * 8 + 3}px ${color};
      `;
      container.appendChild(p);
    }
    return () => { container.innerHTML = ""; };
  }, []);

  return (
    <main ref={shellRef} className="splash-shell scanlines" aria-live="polite">
      <div className="login-noise" aria-hidden="true" />
      
      {/* Parallax layers */}
      <div className="parallax-layer" data-speed="0.02" aria-hidden="true">
        <div style={{position:"absolute",top:"5%",left:"10%",width:"2px",height:"100px",background:"linear-gradient(to bottom,transparent,#00ff9c,transparent)",opacity:0.2}} />
        <div style={{position:"absolute",top:"70%",left:"85%",width:"2px",height:"180px",background:"linear-gradient(to bottom,transparent,#bd3e24,transparent)",opacity:0.15}} />
      </div>
      <div className="parallax-layer" data-speed="0.05" aria-hidden="true">
        <div style={{position:"absolute",top:"30%",left:"75%",width:"1px",height:"60px",background:"#00e5ff",opacity:0.1}} />
        <div style={{position:"absolute",top:"80%",left:"20%",width:"1px",height:"90px",background:"#00ff9c",opacity:0.08}} />
      </div>

      {/* Floating particles */}
      <div ref={particlesRef} className="particles-container" aria-hidden="true" />

      {/* Corners */}
      <div className="splash-corner splash-corner-tl" aria-hidden="true" />
      <div className="splash-corner splash-corner-tr" aria-hidden="true" />
      <div className="splash-corner splash-corner-bl" aria-hidden="true" />
      <div className="splash-corner splash-corner-br" aria-hidden="true" />

      {/* Agent */}
      <div className="splash-agent" aria-hidden="true">
        <div className="agent-hat"><span /></div>
        <div className="agent-head"><i /><i /></div>
        <div className="agent-coat" />
      </div>

      {/* Content */}
      <section ref={contentRef} className="splash-content">
        <p className="splash-eyebrow">
          <span className="status-dot" aria-hidden="true" /> AUTHENTICATION ACCEPTED
        </p>
        <h1>
          {glitchTitle.split("").map((char, i) => (
            <span key={i} style={{ display: "inline-block", transition: "transform 0.1s" }}>
              {char === "_" ? <span style={{ color: "#bd3e24" }}>_</span> : char}
            </span>
          ))}
        </h1>
        <p className="splash-message">
          Secure tunnel established. Preparing operator dashboard...
        </p>
        <div className="splash-track" aria-label="Loading dashboard">
          <div className="splash-bar" />
        </div>
        <p className="splash-count">
          {remaining > 0 ? `REDIRECT IN ${remaining}s` : "CONNECTING..."}
        </p>
        <p className="splash-meta">ROUTE: F34RD0WN!</p>
      </section>
    </main>
  );
}
