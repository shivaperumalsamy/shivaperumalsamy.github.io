/**
 * Cloudflare Worker — grounded synthesis for the portfolio agent.
 *
 * The static site (GitHub Pages) does planning + retrieval client-side and
 * posts { question, context } here. This is the only place the API key lives.
 *
 * Set these before deploying:
 *   ALLOWED_ORIGINS  — your Pages origins, comma-separated
 *   ANTHROPIC_API_KEY — set as a SECRET (wrangler secret put), never in wrangler.toml
 *   RATE_LIMIT (optional KV namespace) — enables per-IP throttling
 */

const ALLOWED_ORIGINS = [
  "https://YOURHANDLE.github.io",
  "https://yourdomain.com",
  "http://localhost:8000"
];

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 400;
const LIMIT_PER_HOUR = 12;

const SYSTEM = `You answer questions about Shiva Perumalsamy for visitors to his portfolio site — typically hiring managers and senior engineers.

Rules, in priority order:
1. Answer ONLY from the CONTEXT provided. If the context does not support a claim, do not make it.
2. If the context does not answer the question, say plainly that it isn't covered and name what is. Never speculate about his experience.
3. Never inflate. If the context marks something as PoC-level or learning-level, say so in those words.
4. Cite the chunk ids you used inline in square brackets, e.g. [vitalforce].
5. Two short paragraphs maximum. Plain, confident, specific. No bullet lists, no marketing adjectives, no "leveraging" or "passionate".
6. Write in third person about Shiva. Do not roleplay as him.`;

function cors(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

async function throttled(env, ip) {
  if (!env.RATE_LIMIT) return false;              // KV not bound → skip
  const key = `rl:${ip}:${new Date().getUTCHours()}`;
  const n = parseInt((await env.RATE_LIMIT.get(key)) || "0", 10);
  if (n >= LIMIT_PER_HOUR) return true;
  await env.RATE_LIMIT.put(key, String(n + 1), { expirationTtl: 3700 });
  return false;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = { ...cors(origin), "Content-Type": "application/json" };

    if (request.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers });

    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return new Response(JSON.stringify({ error: "origin not allowed" }), { status: 403, headers });
    }

    const ip = request.headers.get("CF-Connecting-IP") || "anon";
    if (await throttled(env, ip)) {
      return new Response(JSON.stringify({ error: "rate limited" }), { status: 429, headers });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers });
    }

    const question = String(body.question || "").slice(0, 400);
    const context = String(body.context || "").slice(0, 12000);
    if (!question || !context) {
      return new Response(JSON.stringify({ error: "question and context required" }), { status: 400, headers });
    }

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM,
        messages: [
          { role: "user", content: `CONTEXT:\n${context}\n\nQUESTION: ${question}` }
        ]
      })
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error("anthropic error", upstream.status, detail);
      return new Response(JSON.stringify({ error: "upstream" }), { status: 502, headers });
    }

    const data = await upstream.json();
    const answer = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n")
      .trim();

    return new Response(JSON.stringify({ answer }), { headers });
  }
};
