import "server-only";

/**
 * INSEE Sirene auth handler.
 *
 * Two schemes are supported, picked by which env vars are present:
 *
 * 1. API key (current, portal.insee.fr — since 2024)
 *    - Set INSEE_API_KEY
 *    - Sent as header `X-INSEE-Api-Key-Integration`
 *
 * 2. OAuth2 client credentials (legacy api.insee.fr/token)
 *    - Set INSEE_OAUTH_CONSUMER_KEY and INSEE_OAUTH_CONSUMER_SECRET
 *    - We exchange them for a bearer token and cache it in memory.
 */

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

let cached: CachedToken | null = null;

const TOKEN_URL =
  process.env.INSEE_OAUTH_TOKEN_URL ?? "https://api.insee.fr/token";

const SAFETY_MARGIN_MS = 60_000; // refresh 1 min before expiry

export interface InseeAuthHeader {
  name: string;
  value: string;
}

export async function getInseeAuthHeader(): Promise<InseeAuthHeader> {
  const apiKey = process.env.INSEE_API_KEY?.trim();
  if (apiKey) {
    return { name: "X-INSEE-Api-Key-Integration", value: apiKey };
  }

  const token = await getOAuthToken();
  return { name: "Authorization", value: `Bearer ${token}` };
}

async function getOAuthToken(): Promise<string> {
  const consumerKey = process.env.INSEE_OAUTH_CONSUMER_KEY?.trim();
  const consumerSecret = process.env.INSEE_OAUTH_CONSUMER_SECRET?.trim();

  if (!consumerKey || !consumerSecret) {
    throw new InseeAuthError(
      "INSEE credentials missing: set INSEE_API_KEY, or INSEE_OAUTH_CONSUMER_KEY + INSEE_OAUTH_CONSUMER_SECRET",
    );
  }

  const now = Date.now();
  if (cached && cached.expiresAt - SAFETY_MARGIN_MS > now) {
    return cached.token;
  }

  const basic = Buffer.from(`${consumerKey}:${consumerSecret}`).toString(
    "base64",
  );

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new InseeAuthError(
      `INSEE OAuth token request failed (${res.status}): ${text || res.statusText}`,
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    token_type: string;
  };

  if (!data.access_token) {
    throw new InseeAuthError("INSEE OAuth response missing access_token");
  }

  cached = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return cached.token;
}

export class InseeAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InseeAuthError";
  }
}

/** Test-only helper. */
export function _resetInseeAuthCache() {
  cached = null;
}
