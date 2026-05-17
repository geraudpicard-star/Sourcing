import "server-only";

/**
 * INPI RNE auth handler.
 *
 * Login endpoint:  POST {INPI_BASE_URL}/sso/login  body {username, password}
 * Returns:         { token: "<JWT>" }
 * Token lifetime:  ~24h (we refresh every 12h to be safe).
 */

const BASE_URL =
  process.env.INPI_BASE_URL ?? "https://registre-national-entreprises.inpi.fr/api";

const REFRESH_MS = 12 * 60 * 60 * 1000; // 12h

interface CachedToken {
  token: string;
  fetchedAt: number;
}

let cached: CachedToken | null = null;

export class InpiAuthError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "InpiAuthError";
  }
}

export async function getInpiToken(): Promise<string> {
  const now = Date.now();
  if (cached && now - cached.fetchedAt < REFRESH_MS) {
    return cached.token;
  }

  const username = process.env.INPI_USERNAME?.trim();
  const password = process.env.INPI_PASSWORD;
  if (!username || !password) {
    throw new InpiAuthError(
      "INPI credentials missing: set INPI_USERNAME and INPI_PASSWORD",
    );
  }

  const res = await fetch(`${BASE_URL}/sso/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username, password }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new InpiAuthError(
      `INPI login failed (${res.status}): ${body || res.statusText}`,
      res.status,
    );
  }

  const data = (await res.json()) as { token?: string };
  if (!data.token) {
    throw new InpiAuthError("INPI login response missing token");
  }

  cached = { token: data.token, fetchedAt: now };
  return data.token;
}

/** Test-only helper. */
export function _resetInpiAuthCache() {
  cached = null;
}
