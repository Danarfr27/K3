/**
 * Repairs accidental token/word duplication produced by some streaming
 * providers, e.g. `importimport`, `elifelif`, `returnreturn`.
 *
 * Important: this function is intended to run on the COMPLETE accumulated
 * response (or on a complete UI snapshot), not independently on each
 * streaming chunk. Repairing individual chunks can corrupt tokens that are
 * split across chunk boundaries.
 */
export function repairRepeatedTokens(value: string): string {
  if (!value) return value;

  // Some providers emit Markdown-escaped code (`kalkulator\_sampah`) or
  // encoded indentation (`&#x20;`). Normalize those first so a repeated
  // identifier is still one contiguous token for the repair below.
  let repaired = value
    .replace(/&#(?:x0*20|0*32);/gi, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\\([*_])/g, "$1");

  // Collapse directly duplicated identifier-like words:
  // importimport -> import, returnreturn -> return, etc.
  // Requiring an identifier boundary on both sides avoids changing normal
  // words such as "committee" or "success".
  repaired = repaired.replace(
    /\b([A-Za-z_$][A-Za-z0-9_$]{1,}?)\1+\b/g,
    "$1"
  );

  // Same protection for numeric literals accidentally duplicated.
  repaired = repaired.replace(/\b(\d+?(?:\.\d+)?)(?:\1)+\b/g, "$1");

  // A few providers duplicate an entire quoted/code token.
  repaired = repaired.replace(
    /(["'`])([^\r\n]*?)\1\1\2\1/g,
    "$1$2$1"
  );

  // Collapse an accidentally duplicated complete line, but only when the
  // two halves are exactly identical. This is intentionally conservative.
  repaired = repaired.replace(/^([ \t]*)([^\r\n]{16,})$/gm, (line, indent, body) => {
    if (body.length % 2 !== 0) return line;
    const midpoint = body.length / 2;
    return body.slice(0, midpoint) === body.slice(midpoint)
      ? `${indent}${body.slice(0, midpoint)}`
      : line;
  });

  return removeDuplicateImportLines(repaired);
}

/**
 * Remove exact duplicate import/dependency lines from generated code.
 * The check is language-agnostic and intentionally limited to import-like
 * declarations so normal repeated statements remain untouched.
 */
function removeDuplicateImportLines(value: string): string {
  const seen = new Set<string>();

  return value
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!isImportLikeLine(trimmed)) return true;

      const key = trimmed.replace(/\s+/g, " ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("\n");
}

function isImportLikeLine(line: string): boolean {
  if (/^(?:import\b|from\b.+\bimport\b)\s*\($/i.test(line)) return false;

  return /^(?:import\b|from\b.+\bimport\b|#\s*include\b|using\b.+;|use\b.+;|require\s*\(|(?:const|let|var)\s+\S+\s*=\s*require\s*\()/i.test(
    line
  );
}

/**
 * Append provider chunks without duplicating cumulative snapshots.
 */
export function appendStreamText(current: string, chunk: string): string {
  if (!chunk) return current;
  if (!current) return chunk;
  if (chunk.startsWith(current)) return chunk;
  if (current.endsWith(chunk) && chunk.trim().length >= 3) return current;
  return current + chunk;
}
