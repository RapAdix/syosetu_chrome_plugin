import "../../prompts.js";

declare function explainWordPrompt(sentence: string, marked: string, index?: number): string;
declare function explainSentencePrompt(sentence: string): string;
declare const MAX_SENTENCE_LENGTH: number;
declare const MAX_MARKED_LENGTH: number;

export interface Env {
  DB: D1Database;
  GEMINI_API_KEY: string;
  JWT_SECRET: string;
  GEMINI_MODEL?: string;
}

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  is_active: number;
  daily_limit: number;
  requests_today: number;
  last_request_date: string;
}

interface JwtPayload {
  sub: number;
  username: string;
  exp: number;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

function toHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function base64UrlEncode(input: string | ArrayBuffer | Uint8Array): string {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
      ? input
      : new Uint8Array(input);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecodeToBytes(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hashPassword(password: string, iterations = 100000): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return `pbkdf2$${iterations}$${toHex(salt)}$${toHex(derivedBits)}`;
}

async function verifyPassword(
  password: string,
  storedHash: string
): Promise<{ valid: boolean; upgradedHash?: string }> {
  if (storedHash.startsWith("plain:")) {
    const expected = storedHash.slice("plain:".length);
    const valid = timingSafeEqual(password, expected);
    if (!valid) return { valid: false };
    const upgradedHash = await hashPassword(password);
    return { valid: true, upgradedHash };
  }

  const parts = storedHash.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") {
    return { valid: false };
  }
  const iterations = parseInt(parts[1], 10);
  const salt = fromHex(parts[2]);
  const expectedHex = parts[3];

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return { valid: timingSafeEqual(toHex(derivedBits), expectedHex) };
}

async function signJwt(payload: JwtPayload, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSig] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const sigBytes = base64UrlDecodeToBytes(encodedSig);
  const isValid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    new TextEncoder().encode(signingInput)
  );
  if (!isValid) return null;

  try {
    const payloadJson = new TextDecoder().decode(base64UrlDecodeToBytes(encodedPayload));
    const payload = JSON.parse(payloadJson) as JwtPayload;
    if (!payload.exp || Date.now() / 1000 > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function getBearerToken(request: Request): string | null {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length).trim();
}

async function getServerModel(env: Env): Promise<string> {
  try {
    const row = await env.DB.prepare(
      "SELECT value FROM server_config WHERE key = 'gemini_model'"
    ).first<{ value: string }>();
    if (row?.value && row.value.trim()) {
      return row.value.trim();
    }
  } catch {
    // Fallback if server_config table is not queried
  }
  return env.GEMINI_MODEL || "gemini-2.5-flash";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/login" && request.method === "POST") {
        if (!env.JWT_SECRET) {
          return jsonResponse({ ok: false, error: "Server JWT_SECRET is not configured." }, 500);
        }

        const body = (await request.json().catch(() => ({}))) as {
          username?: string;
          password?: string;
        };
        const username = (body.username || "").trim();
        const password = body.password || "";

        if (!username || !password) {
          return jsonResponse({ ok: false, error: "Username and password are required." }, 400);
        }

        const user = await env.DB.prepare(
          "SELECT id, username, password_hash, is_active, daily_limit, requests_today, last_request_date FROM users WHERE username = ?"
        )
          .bind(username)
          .first<UserRow>();

        if (!user) {
          return jsonResponse({ ok: false, error: "Invalid username or password." }, 401);
        }

        if (user.is_active !== 1) {
          return jsonResponse({ ok: false, error: "Account is disabled." }, 403);
        }

        const { valid, upgradedHash } = await verifyPassword(password, user.password_hash);
        if (!valid) {
          return jsonResponse({ ok: false, error: "Invalid username or password." }, 401);
        }

        if (upgradedHash) {
          await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
            .bind(upgradedHash, user.id)
            .run();
        }

        const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30; // 30 days
        const token = await signJwt(
          { sub: user.id, username: user.username, exp },
          env.JWT_SECRET
        );

        return jsonResponse({
          ok: true,
          token,
          username: user.username,
          dailyLimit: user.daily_limit,
        });
      }

      if (url.pathname === "/api/me" && request.method === "GET") {
        const token = getBearerToken(request);
        if (!token || !env.JWT_SECRET) {
          return jsonResponse({ ok: false, error: "Unauthorized." }, 401);
        }
        const payload = await verifyJwt(token, env.JWT_SECRET);
        if (!payload) {
          return jsonResponse({ ok: false, error: "Invalid or expired session token." }, 401);
        }

        const user = await env.DB.prepare(
          "SELECT id, username, is_active, daily_limit, requests_today, last_request_date FROM users WHERE id = ?"
        )
          .bind(payload.sub)
          .first<UserRow>();

        if (!user || user.is_active !== 1) {
          return jsonResponse({ ok: false, error: "Account not found or disabled." }, 403);
        }

        const model = await getServerModel(env);
        return jsonResponse({
          ok: true,
          username: user.username,
          dailyLimit: user.daily_limit,
          requestsToday: user.requests_today,
          model,
        });
      }

      if (url.pathname === "/api/grammar" && request.method === "POST") {
        const token = getBearerToken(request);
        if (!token || !env.JWT_SECRET) {
          return jsonResponse({ ok: false, error: "Unauthorized. Please log in." }, 401);
        }

        const payload = await verifyJwt(token, env.JWT_SECRET);
        if (!payload) {
          return jsonResponse({ ok: false, error: "Session expired. Please log in again." }, 401);
        }

        if (!env.GEMINI_API_KEY) {
          return jsonResponse({ ok: false, error: "Server GEMINI_API_KEY is not configured." }, 500);
        }

        const user = await env.DB.prepare(
          "SELECT id, username, is_active, daily_limit, requests_today, last_request_date FROM users WHERE id = ?"
        )
          .bind(payload.sub)
          .first<UserRow>();

        if (!user || user.is_active !== 1) {
          return jsonResponse({ ok: false, error: "Account is disabled or does not exist." }, 403);
        }

        const today = new Date().toISOString().slice(0, 10);
        const requestsToday = user.last_request_date === today ? user.requests_today : 0;

        if (requestsToday >= user.daily_limit) {
          return jsonResponse(
            {
              ok: false,
              error: `Daily quota exceeded (${user.daily_limit} requests/day).`,
            },
            429
          );
        }

        const body = (await request.json().catch(() => ({}))) as {
          sentence?: unknown;
          marked?: unknown;
          index?: unknown;
        };

        const sentence = typeof body.sentence === "string" ? body.sentence.trim() : "";
        const marked = typeof body.marked === "string" ? body.marked.trim() : "";
        const index = typeof body.index === "number" && Number.isFinite(body.index) ? Math.floor(body.index) : 0;

        if (!sentence) {
          return jsonResponse({ ok: false, error: "Missing sentence." }, 400);
        }

        if (sentence.length > MAX_SENTENCE_LENGTH) {
          return jsonResponse(
            { ok: false, error: `Sentence is too long (${sentence.length} chars, max ${MAX_SENTENCE_LENGTH}).` },
            400
          );
        }

        if (marked.length > MAX_MARKED_LENGTH) {
          return jsonResponse(
            { ok: false, error: `Marked word is too long (${marked.length} chars, max ${MAX_MARKED_LENGTH}).` },
            400
          );
        }

        const finalPrompt = marked
          ? explainWordPrompt(sentence, marked, index)
          : explainSentencePrompt(sentence);

        const model = (await getServerModel(env)).replace(/^models\//, "");

        await env.DB.prepare(
          "UPDATE users SET requests_today = ?, last_request_date = ? WHERE id = ?"
        )
          .bind(requestsToday + 1, today, user.id)
          .run();

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model
        )}:generateContent`;

        const geminiRes = await fetch(geminiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY.trim(),
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: finalPrompt }],
              },
            ],
          }),
        });

        const geminiData = (await geminiRes.json().catch(() => ({}))) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          error?: { message?: string };
        };

        if (!geminiRes.ok) {
          return jsonResponse(
            {
              ok: false,
              error:
                geminiData?.error?.message ||
                `Gemini API returned status ${geminiRes.status}`,
            },
            geminiRes.status
          );
        }

        const reply =
          geminiData?.candidates?.[0]?.content?.parts
            ?.map((p) => p.text || "")
            .join("") || "";

        if (!reply) {
          return jsonResponse({ ok: false, error: "Empty response from Gemini API." }, 502);
        }

        return jsonResponse({
          ok: true,
          reply,
          model,
          remainingQuota: Math.max(0, user.daily_limit - (requestsToday + 1)),
        });
      }

      return jsonResponse({ ok: false, error: "Not found" }, 404);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error";
      return jsonResponse({ ok: false, error: msg }, 500);
    }
  },
};
