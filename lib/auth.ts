import { createHmac, timingSafeEqual } from "node:crypto";

export const AUTH_COOKIE = "k3_auth";
export const MAX_ACCOUNTS = 100;
const SESSION_VALUE = "authenticated";

function secret(): string {
  return process.env.AUTH_SECRET || "development-only-change-me";
}

function signature(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

export function createSessionValue(): string {
  return `${SESSION_VALUE}.${signature(SESSION_VALUE)}`;
}

export function isValidSession(value: string | undefined): boolean {
  if (!value) return false;

  const [session, providedSignature] = value.split(".");
  if (session !== SESSION_VALUE || !providedSignature) return false;

  const expected = Buffer.from(signature(session), "utf8");
  const actual = Buffer.from(providedSignature, "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function getCredentialMap(): Map<string, string> {
  const credentials = new Map<string, string>();

  for (let i = 1; i <= MAX_ACCOUNTS; i += 1) {
    const username =
      process.env[`USER${i}_USER`] ||
      process.env[`USER${i}_USERNAME`];
    const password =
      process.env[`USER${i}_PASS`] ||
      process.env[`USER${i}_PASSWORD`];

    if (username && password) {
      credentials.set(username.trim(), password);
    }
  }

  return credentials;
}

export function hasConfiguredCredentials(): boolean {
  return getCredentialMap().size > 0;
}

export function areValidCredentials(username: string, password: string): boolean {
  const trimmedUsername = username.trim();
  const expectedPassword = getCredentialMap().get(trimmedUsername);

  return Boolean(expectedPassword && expectedPassword === password);
}