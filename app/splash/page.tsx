"use client";

import { useCallback, useEffect, useState } from "react";

/* ============================================================
   K3 AI — splash / session boot screen
   Pure typography + one accent colour. No glitch noise.
   ============================================================ */

const TOTAL_MS = 6000;

const BOOT_LINES: { label: string; detail: string; delay: number }[] = [
  { label: "handshake", detail: "tls1.3 / x25519", delay: 0.1 },
  { label: "key exchange", detail: "rotating key pool", delay: 0.5 },
  { label: "model routing", detail: "openrouter / fallback chain", delay: 0.9 },
  { label: "operator profile", detail: "verified", delay: 1.3 },
  { label: "memory sync", detail: "conversation context", delay: 1.7 },
];

const CSS = `
.k3s-root{position:fixed;inset:0;display:grid;place-items:center;padding:24px;overflow:hidden;
  background:
    radial-gradient(900px 420px at 50% -8%, rgba(0,255,156,.10), transparent 62%),
    radial-gradient(700px 400px at 88% 110%, rgba(0,229,255,.06), transparent 60%),
    #050505;
  color:#d7e8da;font-family:"Share Tech Mono",ui-monospace,SFMono-Regular,Menlo,monospace;}
.k3s-root *{box-sizing:border-box;}
.k3s-grid{position:absolute;inset:-2px;pointer-events:none;
  background-image:
    linear-gradient(rgba(0,255,156,.055) 1px,transparent 1px),
    linear-gradient(90deg,rgba(0,255,156,.055) 1px,transparent 1px);
  background-size:46px 46px;
  -webkit-mask-image:radial-gradient(circle at 50% 42%,#000 26%,transparent 76%);
  mask-image:radial-gradient(circle at 50% 42%,#000 26%,transparent 76%);
  animation:k3s-drift 14s linear infinite;}
.k3s-status{display:flex;flex-wrap:wrap;gap:6px 20px;padding:9px 14px;border-bottom:1px solid #17251a;
  background:rgba(0,255,156,.025);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#8fb49a;}
.k3s-status span{display:inline-flex;align-items:center;gap:7px;}
.k3s-status span::before{content:"";width:4px;height:4px;background:#00ff9c;box-shadow:0 0 6px #00ff9c;opacity:.9;}
@media (max-width:520px){.k3s-status{font-size:9px;gap:4px 12px;}}

.k3s-vignette{position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(circle at 50% 45%,transparent 45%,rgba(0,0,0,.72) 100%);}

.k3s-panel{position:relative;width:min(660px,100%);border:1px solid #17251a;
  background:linear-gradient(180deg,rgba(10,14,10,.93),rgba(4,6,4,.97));
  box-shadow:0 0 0 1px rgba(0,255,156,.05),0 40px 90px -40px #000,inset 0 1px 0 rgba(255,255,255,.03);
  animation:k3s-rise .5s cubic-bezier(.2,.7,.2,1) both;}
.k3s-panel::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:repeating-linear-gradient(180deg,rgba(255,255,255,.018) 0 1px,transparent 1px 3px);}

.k3s-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:10px 14px;border-bottom:1px solid #17251a;background:rgba(0,255,156,.03);}
.k3s-bar-left{display:flex;align-items:center;gap:8px;font-size:11px;letter-spacing:.18em;
  text-transform:uppercase;color:#00ff9c;}
.k3s-dot{width:6px;height:6px;border-radius:50%;background:#00ff9c;box-shadow:0 0 8px #00ff9c;
  animation:k3s-blink 1.6s steps(2,end) infinite;}
.k3s-bar-right{font-size:10px;letter-spacing:.16em;color:#7f9c86;text-transform:uppercase;}

.k3s-body{padding:clamp(20px,4vw,34px);}
.k3s-eyebrow{margin:0 0 18px;font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:#86a68e;}
.k3s-title{margin:0;font-size:clamp(40px,9vw,74px);line-height:1;letter-spacing:.14em;
  font-weight:400;color:#f2fff8;text-shadow:0 0 28px rgba(0,255,156,.28);}
.k3s-title span{color:#00ff9c;}
.k3s-rule{margin:24px 0 26px;height:1px;background:linear-gradient(90deg,#00ff9c,rgba(0,255,156,.06) 55%,transparent);}
.k3s-sub{margin:0 0 28px;font-size:13px;line-height:1.7;color:#a3bcab;max-width:46ch;}

.k3s-log{display:grid;gap:9px;margin:0 0 26px;}
.k3s-line{display:grid;grid-template-columns:14px auto 1fr auto;align-items:baseline;gap:10px;
  font-size:12px;color:#7e9a84;opacity:0;transform:translateY(4px);
  animation:k3s-in .45s ease forwards;animation-delay:var(--d);}
.k3s-ok{color:#00ff9c;font-size:10px;}
.k3s-label{color:#c9dfcf;letter-spacing:.04em;}
.k3s-lead{border-bottom:1px dotted #1e2f22;transform:translateY(-3px);min-width:8px;}
.k3s-detail{color:#84a28d;letter-spacing:.06em;}

.k3s-load{margin:0 0 24px;}
.k3s-load-head{display:flex;justify-content:space-between;margin-bottom:8px;font-size:10px;
  letter-spacing:.22em;text-transform:uppercase;color:#8aa894;}
.k3s-load-head b{color:#00ff9c;font-weight:400;}
.k3s-track{position:relative;height:6px;border:1px solid #17251a;background:#080b08;overflow:hidden;}
.k3s-fill{position:absolute;inset:0 auto 0 0;width:0;background:linear-gradient(90deg,#0b7a52,#00ff9c);
  box-shadow:0 0 14px rgba(0,255,156,.5);animation:k3s-fill var(--t) linear forwards;}
.k3s-sweep{position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.28),transparent);
  width:26%;animation:k3s-sweep 1.5s linear infinite;}

.k3s-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;
  padding:12px 14px;border-top:1px solid #17251a;background:rgba(0,0,0,.4);}
.k3s-count{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8aa894;}
.k3s-count b{color:#00ff9c;font-weight:400;}
.k3s-skip{appearance:none;cursor:pointer;background:rgba(0,255,156,.07);border:1px solid #2f5a41;
  color:#d8f5e2;font:inherit;font-size:11px;letter-spacing:.2em;text-transform:uppercase;
  padding:8px 14px;transition:border-color .18s,color .18s,box-shadow .18s;}
.k3s-skip:hover,.k3s-skip:focus-visible{outline:none;border-color:#00ff9c;color:#00ff9c;
  box-shadow:0 0 0 1px rgba(0,255,156,.35),0 0 22px -6px rgba(0,255,156,.6);}
.k3s-cursor{display:inline-block;width:8px;height:14px;margin-left:6px;vertical-align:-2px;
  background:#00ff9c;animation:k3s-blink 1.1s steps(2,end) infinite;}

@keyframes k3s-drift{from{transform:translate3d(0,0,0)}to{transform:translate3d(46px,46px,0)}}
@keyframes k3s-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes k3s-blink{0%,49%{opacity:1}50%,100%{opacity:.12}}
@keyframes k3s-in{to{opacity:1;transform:none}}
@keyframes k3s-fill{to{width:100%}}
@keyframes k3s-sweep{from{transform:translateX(-100%)}to{transform:translateX(420%)}}

@media (max-width:520px){
  .k3s-line{grid-template-columns:12px auto 1fr;font-size:11px;}
  .k3s-detail{display:none;}
  .k3s-foot{justify-content:center;}
  .k3s-skip{width:100%;}
}
@media (prefers-reduced-motion:reduce){
  .k3s-grid,.k3s-dot,.k3s-cursor,.k3s-fill,.k3s-sweep,.k3s-panel,.k3s-line{animation:none!important;}
  .k3s-fill{width:100%;}
  .k3s-line{opacity:1;transform:none;}
}
`;

export default function SplashPage() {
  const [remaining, setRemaining] = useState(Math.ceil(TOTAL_MS / 1000));
  const [target, setTarget] = useState("/chat");

  const go = useCallback((href: string) => {
    window.location.replace(href);
  }, []);

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("next") || "/chat";
    setTarget(next);

    const redirect = window.setTimeout(() => go(next), TOTAL_MS);
    const tick = window.setInterval(() => {
      setRemaining((value) => Math.max(value - 1, 0));
    }, 1000);

    return () => {
      window.clearTimeout(redirect);
      window.clearInterval(tick);
    };
  }, [go]);

  return (
    <main className="k3s-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="k3s-grid" aria-hidden="true" />
      <div className="k3s-vignette" aria-hidden="true" />

      <section className="k3s-panel" aria-live="polite">
        <header className="k3s-bar">
          <span className="k3s-bar-left">
            <i className="k3s-dot" aria-hidden="true" />
            secure session
          </span>
          <span className="k3s-bar-right">node sin1 · operator verified</span>
        </header>

        <div className="k3s-status" aria-label="System status">
          <span>system status: online</span>
          <span>mode: unfiltered execution</span>
          <span>logic: amoral/destructive</span>
        </div>

        <div className="k3s-body">
          <p className="k3s-eyebrow">authentication accepted</p>
          <h1 className="k3s-title">
            K3<span>_</span>AI
            <i className="k3s-cursor" aria-hidden="true" />
          </h1>
          <div className="k3s-rule" aria-hidden="true" />
          <p className="k3s-sub">
            Tunnel aman terbentuk. Menyiapkan dashboard operator — jangan tutup
            tab ini.
          </p>

          <ul className="k3s-log">
            {BOOT_LINES.map((line) => (
              <li
                key={line.label}
                className="k3s-line"
                style={{ ["--d" as string]: `${line.delay}s` }}
              >
                <span className="k3s-ok">[ok]</span>
                <span className="k3s-label">{line.label}</span>
                <span className="k3s-lead" aria-hidden="true" />
                <span className="k3s-detail">{line.detail}</span>
              </li>
            ))}
          </ul>

          <div className="k3s-load">
            <div className="k3s-load-head">
              <span>mounting dashboard</span>
              <b>{remaining > 0 ? `${remaining}s` : "ready"}</b>
            </div>
            <div
              className="k3s-track"
              role="progressbar"
              aria-label="Loading dashboard"
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="k3s-fill"
                style={{ ["--t" as string]: `${TOTAL_MS}ms` }}
              />
              <div className="k3s-sweep" aria-hidden="true" />
            </div>
          </div>
        </div>

        <footer className="k3s-foot">
          <span className="k3s-count">
            redirect in <b>{remaining > 0 ? `${remaining}s` : "…"}</b> → {target}
          </span>
          <button type="button" className="k3s-skip" onClick={() => go(target)}>
            skip →
          </button>
        </footer>
      </section>
    </main>
  );
}