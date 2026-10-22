"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const phrases = [
  "Establishing secure handshake...",
  "Shenzhen uplink active...",
  "Neural encryption verified...",
  "Awaiting operator credentials...",
  "System integrity: 100%",
];

function randomBinary(length: number, seed: number) {
  return Array.from({ length }, (_, index) =>
    (seed + index * 7) % 3 === 0 ? "1" : "0",
  ).join("");
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [typedText, setTypedText] = useState("");

  const particles = useMemo(
    () =>
      Array.from({ length: 30 }, (_, index) => ({
        id: index,
        left: `${(index * 37) % 100}%`,
        duration: `${5 + (index % 10)}s`,
        delay: `${(index * 3) % 5}s`,
        opacity: 0.2 + (index % 5) * 0.1,
      })),
    [],
  );
  const binaryColumns = useMemo(
    () =>
      Array.from({ length: 8 }, (_, index) => ({
        id: index,
        left: `${index * 12 + 5}px`,
        duration: `${6 + (index % 8)}s`,
        delay: `${(index * 2) % 5}s`,
        value: randomBinary(40, index + 181),
      })),
    [],
  );

  useEffect(() => {
    let phraseIndex = 0;
    let characterIndex = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;

    const typeEffect = () => {
      const phrase = phrases[phraseIndex];
      characterIndex += deleting ? -1 : 1;
      setTypedText(phrase.substring(0, characterIndex));

      let speed = deleting ? 30 : 60;
      if (!deleting && characterIndex === phrase.length) {
        deleting = true;
        speed = 2000;
      } else if (deleting && characterIndex === 0) {
        deleting = false;
        phraseIndex = (phraseIndex + 1) % phrases.length;
        speed = 500;
      }
      timer = setTimeout(typeEffect, speed);
    };

    timer = setTimeout(typeEffect, 60);
    return () => clearTimeout(timer);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        setError("Kredensial tidak valid. Periksa kembali ID dan password.");
        return;
      }

      const result = (await response.json()) as { redirectTo?: string };
      window.location.assign(result.redirectTo || "/splash.html");
    } catch {
      setError("Koneksi autentikasi gagal. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="cyber-login-container">
      <div className="top-bar" />
      <div className="cyber-bg" />
      <div className="login-scanlines" />
      <div className="grid-overlay" />
      <div className="particles" aria-hidden="true">
        {particles.map((particle) => (
          <span
            className="particle"
            key={particle.id}
            style={{
              left: particle.left,
              animationDuration: particle.duration,
              animationDelay: particle.delay,
              opacity: particle.opacity,
            }}
          />
        ))}
      </div>
      <div className="binary-rain left" aria-hidden="true">
        {binaryColumns.map((column) => (
          <span
            className="binary-column"
            key={column.id}
            style={{
              left: column.left,
              animationDuration: column.duration,
              animationDelay: column.delay,
            }}
          >
            {column.value}
          </span>
        ))}
      </div>
      <div className="binary-rain right" aria-hidden="true">
        {binaryColumns.map((column) => (
          <span
            className="binary-column"
            key={column.id}
            style={{
              left: column.left,
              animationDuration: column.duration,
              animationDelay: column.delay,
            }}
          >
            {column.value}
          </span>
        ))}
      </div>

      <section className="cyber-login-card" aria-labelledby="login-title">
        <span className="corner corner-tl" />
        <span className="corner corner-tr" />
        <span className="corner corner-bl" />
        <span className="corner corner-br" />

        <header className="cyber-login-header">
          <h1 id="login-title" className="glitch" data-text="K3 F34RD0WN">
            K3 F34RD0WN
          </h1>
          <p className="cyber-subtitle">Cyber Intelligence</p>
        </header>

        <form onSubmit={submit}>
          <div className="input-group">
            <label htmlFor="username">Operator ID</label>
            <input
              id="username"
              name="username"
              type="text"
              placeholder="ENTER_CREDENTIALS"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
            <span className="input-line" />
          </div>

          <div className="input-group">
            <label htmlFor="password">Access Key</label>
            <div className="password-wrapper">
              <input
                id="password"
                name="password"
                type={passwordVisible ? "text" : "password"}
                placeholder="••••••••••••"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                type="button"
                className="toggle-password"
                aria-label={passwordVisible ? "Hide password" : "Show password"}
                onClick={() => setPasswordVisible((visible) => !visible)}
              >
                {passwordVisible ? "🙈" : "👁"}
              </button>
            </div>
            <span className="input-line" />
          </div>

          {error && <p className="cyber-login-error" role="alert">{error}</p>}

          <button className="cyber-login-btn" type="submit" disabled={loading}>
            {loading ? "ACCESSING..." : "INITIALIZE"}
          </button>
        </form>

        <div className="cyber-status-bar">
          <span>SYS: ONLINE</span>
          <span>SUKABUMI BLACK HAT ACCESS</span>
          <span className="cyber-status-dot" />
        </div>
        <div className="terminal-text" aria-live="polite">
          <span>{typedText}</span><span className="terminal-cursor" />
        </div>
      </section>

      <p className="bottom-info">SECURE CONNECTION // ENCRYPTED // v2.0.7</p>
    </main>
  );
}
