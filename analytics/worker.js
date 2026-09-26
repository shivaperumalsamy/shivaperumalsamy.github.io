/**
 * Cloudflare Worker — view log for every page on shivap.me.
 *
 * Runs on the route shivap.me/* in front of the static site. Every request
 * passes straight through to the origin; successful HTML page loads are
 * recorded in KV as "view". Nothing runs in the visitor's browser for this, so
 * ad blockers don't hide views. Images, CSS and other assets are not logged.
 *
 * Pages can also POST a named event to /_event (see wispr/index.html), logged
 * against the page in the Referer:
 *   play  — visitor clicked into the embedded video player
 *   drive — visitor opened the video in Google Drive
 *
 * Read the log (newest first, crawlers hidden):
 *   https://shivap.me/_views?key=VIEWS_KEY
 *   &path=/wispr/   — only that page
 *   &bots=1         — include crawlers
 *   &format=json    — JSON instead of a table
 *
 * Bindings:
 *   VIEWS     — KV namespace
 *   VIEWS_KEY — secret (wrangler secret put VIEWS_KEY)
 */

const RETENTION_DAYS = 90;
const MAX_TS = 9999999999999;
const VIEWS_PATH = "/_views";
const EVENT_PATH = "/_event";
const EVENTS = ["play", "drive"];
const SITE_ORIGIN = "https://shivap.me";
const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|curl|wget|python|httpclient|headless|lighthouse|monitor/i;

function clean(value, max) {
  return String(value || "").replace(/[^\w .,:;@()\/+-]/g, "").slice(0, max);
}

async function record(request, env, event, path) {
  const cf = request.cf || {};
  const agent = request.headers.get("User-Agent") || "";
  const now = Date.now();
  const view = {
    at: new Date(now).toISOString(),
    event,
    path: clean(path, 120),
    city: clean(cf.city, 60),
    region: clean(cf.region, 60),
    country: clean(cf.country, 4),
    network: clean(cf.asOrganization, 80),
    ip: request.headers.get("CF-Connecting-IP") || "",
    referer: event === "view" ? clean(request.headers.get("Referer"), 120) : "",
    bot: BOT_UA.test(agent),
    agent: clean(agent, 200)
  };
  // Inverted timestamp so KV's ascending key order lists newest first.
  const key = `v:${String(MAX_TS - now).padStart(13, "0")}:${crypto.randomUUID().slice(0, 8)}`;
  // The record lives in metadata (max 1 KB) so one list() call returns everything.
  await env.VIEWS.put(key, "", { metadata: view, expirationTtl: RETENTION_DAYS * 86400 });
}

async function listViews(env) {
  const views = [];
  let cursor;
  do {
    const page = await env.VIEWS.list({ prefix: "v:", cursor });
    for (const k of page.keys) if (k.metadata) views.push({ event: "view", ...k.metadata });
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor && views.length < 5000);
  return views;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function summarize(views) {
  const count = e => views.filter(v => v.event === e).length;
  const places = [...new Set(views.map(v => [v.city, v.country].filter(Boolean).join(", ")).filter(Boolean))];
  return `${count("view")} views · ${count("play")} plays · ${count("drive")} opened in Drive` +
    (places.length ? ` · from ${places.slice(0, 12).join("; ")}${places.length > 12 ? "; …" : ""}` : "");
}

function renderViews(views, filter) {
  const cols = ["at", "event", "path", "city", "region", "country", "network", "ip", "referer", "agent"];
  const rows = views.map(v => `<tr class="${v.event}">${cols.map(c => `<td>${escapeHtml(v[c] || "")}</td>`).join("")}</tr>`).join("");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>Site Views</title><style>
body{margin:0;padding:24px 16px;background:#090C0E;color:#E9F1F2;font:13px/1.5 ui-monospace,Menlo,monospace}
h1{font-size:15px;font-weight:500;margin:0 0 6px}p{color:#8CA3AB;margin:0 0 18px}.wrap{overflow-x:auto}
table{border-collapse:collapse;white-space:nowrap}th,td{padding:6px 12px;border-bottom:1px solid #1D2B30;text-align:left}
th{color:#8CA3AB;font-weight:500}td:last-child{white-space:normal;min-width:320px;color:#8CA3AB}
tr.play td:nth-child(2),tr.drive td:nth-child(2){color:#3EF0D4}
</style></head><body><h1>${escapeHtml(summarize(views))}</h1><p>${escapeHtml(filter)}</p><div class="wrap"><table>
<tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr>${rows}</table></div></body></html>`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.replace(/\/$/, "") === VIEWS_PATH) {
      if (!env.VIEWS_KEY || url.searchParams.get("key") !== env.VIEWS_KEY) {
        return new Response("Not found", { status: 404 });
      }
      const path = url.searchParams.get("path");
      const bots = url.searchParams.get("bots") === "1";
      const views = (await listViews(env))
        .filter(v => bots || !v.bot)
        .filter(v => !path || v.path === path);
      if (url.searchParams.get("format") === "json") {
        return Response.json(views, { headers: { "Cache-Control": "no-store" } });
      }
      const filter = [path || "all pages", bots ? "incl. crawlers" : "crawlers hidden"].join(" · ");
      return new Response(renderViews(views, filter), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
      });
    }

    if (url.pathname === EVENT_PATH) {
      let from;
      try { from = new URL(request.headers.get("Referer") || ""); } catch { from = null; }
      const event = request.method === "POST" ? (await request.text()).trim().slice(0, 20) : "";
      if (from && from.origin === SITE_ORIGIN && EVENTS.includes(event)) {
        ctx.waitUntil(record(request, env, event, from.pathname).catch(error => console.error("event log failed", error)));
      }
      return new Response(null, { status: 204 });
    }

    const response = await fetch(request);
    const isPageLoad = request.method === "GET" && response.status === 200 &&
      (response.headers.get("Content-Type") || "").includes("text/html");
    if (isPageLoad) {
      ctx.waitUntil(record(request, env, "view", url.pathname).catch(error => console.error("view log failed", error)));
    }
    return response;
  }
};
