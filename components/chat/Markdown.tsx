"use client";

import { useMemo, useState, ReactNode } from "react";
import { repairRepeatedTokens } from "@/lib/chat/text";

/* ------------------------------------------------------------
 * Lightweight Markdown renderer — zero dependencies.
 * Supports: code fences (+copy, light syntax tint), headings,
 * bold/italic/inline code/links, lists, blockquotes, tables, hr.
 * ---------------------------------------------------------- */

function tintCode(code: string): ReactNode[] {
  const patterns: { re: RegExp; cls: string }[] = [
    { re: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)/g, cls: "tok-com" },
    { re: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, cls: "tok-str" },
    { re: /\b(const|let|var|function|return|if|else|for|while|import|export|from|class|new|await|async|try|catch|throw|switch|case|break|continue|interface|type|extends|implements|public|private|static|void|null|undefined|true|false|def|elif|print|None|True|False|fn|pub|struct|impl|match|use|mod)\b/g, cls: "tok-kw" },
    { re: /\b(\d+(?:\.\d+)?)\b/g, cls: "tok-num" },
    { re: /\b([a-zA-Z_$][\w$]*)(?=\s*\()/g, cls: "tok-fn" },
  ];

  const out: ReactNode[] = [];
  let key = 0;
  const union = new RegExp(patterns.map((p) => `(?:${p.re.source})`).join("|"), "g");
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = union.exec(code)) !== null) {
    if (match.index > last) {
      out.push(<span key={key++}>{code.slice(last, match.index)}</span>);
    }

    const part = match[0];
    const cls =
      patterns.find((p) => new RegExp(`^(?:${p.re.source})$`).test(part))?.cls ??
      null;
    out.push(
      cls ? (
        <span key={key++} className={cls}>{part}</span>
      ) : (
        <span key={key++}>{part}</span>
      )
    );
    last = match.index + part.length;
  }

  if (last < code.length) out.push(<span key={key++}>{code.slice(last)}</span>);
  return out;
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="k3-code my-2 overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
          {lang || "code"}
        </span>
        <button
          onClick={copy}
          className="font-mono text-[10px] uppercase tracking-wider text-dim hover:text-terminal transition-colors"
        >
          {copied ? "[ copied ]" : "[ copy ]"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3">
        <code>{tintCode(code)}</code>
      </pre>
    </div>
  );
}

function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let key = 0;
  // inline code | bold | italic | link
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(<span key={key++}>{text.slice(last, m.index)}</span>);
    const tok = m[0];
    if (tok.startsWith("`")) {
      out.push(
        <code key={key++} className="k3-inline-code">
          {tok.slice(1, -1)}
        </code>
      );
    } else if (tok.startsWith("**")) {
      out.push(<strong key={key++}>{renderInline(tok.slice(2, -2))}</strong>);
    } else if (tok.startsWith("*")) {
      out.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    } else {
      const link = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        const href = link[2];
        const safe = /^https?:\/\//i.test(href) ? href : "#";
        out.push(
          <a key={key++} href={safe} target="_blank" rel="noopener noreferrer">
            {link[1]}
          </a>
        );
      }
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(<span key={key++}>{text.slice(last)}</span>);
  return out;
}

export default function Markdown({ text }: { text: string }) {
  const blocks = useMemo(
    () =>
      parseBlocks(
        repairRepeatedTokens(text).replace(/\b(import){2,}\b/g, "import")
      ),
    [text]
  );
  return <div className="md text-[0.88rem] leading-relaxed">{blocks}</div>;
}

function parseBlocks(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let key = 0;
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // closing fence
      out.push(<CodeBlock key={key++} lang={fence[1]} code={buf.join("\n")} />);
      continue;
    }

    // headings
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const Tag = (`h${level}`) as "h1" | "h2" | "h3" | "h4";
      out.push(<Tag key={key++}>{renderInline(h[2])}</Tag>);
      i++;
      continue;
    }

    // hr
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      out.push(<hr key={key++} />);
      i++;
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(<blockquote key={key++}>{renderInline(buf.join(" "))}</blockquote>);
      continue;
    }

    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      out.push(
        <ul key={key++}>
          {items.map((it, j) => (
            <li key={j}>{renderInline(it)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      out.push(
        <ol key={key++}>
          {items.map((it, j) => (
            <li key={j}>{renderInline(it)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // table (pipe syntax with header separator)
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitRow(lines[i]));
        i++;
      }
      out.push(
        <div key={key++} className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                {header.map((c, j) => (
                  <th key={j}>{renderInline(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci}>{renderInline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // blank
    if (line.trim() === "") {
      i++;
      continue;
    }

    // paragraph (merge consecutive plain lines)
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(```|#{1,4}\s|>\s?|\s*[-*]\s|\s*\d+\.\s|\s*(-{3,}|\*{3,})\s*$)/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    out.push(<p key={key++}>{renderInline(buf.join(" "))}</p>);
  }

  return out;
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}
