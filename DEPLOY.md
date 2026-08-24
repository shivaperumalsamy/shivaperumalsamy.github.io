# Portfolio site — deploy notes

Two-stage. Stage 1 gets you live on GitHub Pages today with zero backend. Stage 2 upgrades the agent from extractive to generative without touching the site's hosting.

---

## Stage 1 — GitHub Pages (works right now)

1. Push `index.html` to the repo root of `YOURHANDLE.github.io` (or any repo, then Settings → Pages → deploy from `main` / root).
2. Fix the placeholders in `index.html`:
   - Contact section: `you@example.com`, `linkedin.com/in/YOURHANDLE`, `github.com/YOURHANDLE`, `resume.pdf`
   - Drop `resume.pdf` next to `index.html`
3. Done. `CONFIG.workerUrl` is empty, so the page runs local retrieval and the status dot reads **local retrieval** in amber.

**What it does in this mode:** parses the question, expands terms, BM25-scores all corpus chunks, shows real scores and timings, and answers by extracting sentences from the top chunks. No model. It refuses when nothing clears the threshold — which is the honest behavior and worth leaving in.

---

## Stage 2 — Cloudflare Worker (live model)

Free tier, no credit card, ~10 minutes.

```bash
npm install -g wrangler
wrangler login
wrangler init shiva-agent   # choose "Hello World" Worker
# replace src/index.js with worker.js
wrangler secret put ANTHROPIC_API_KEY
wrangler deploy
```

Required rate-limit KV:

```bash
wrangler kv namespace create RATE_LIMIT
# add the returned binding to wrangler.toml:
# [[kv_namespaces]]
# binding = "RATE_LIMIT"
# id = "..."
```

Then:

1. In `worker.js`, set `ALLOWED_ORIGINS` to your real Pages origin.
2. In `index.html`, set `CONFIG.workerUrl` to the deployed URL.

Status dot flips to teal **live model**. If the Worker errors, rate-limits, or is down, the page silently falls back to local extractive mode — a visitor never sees a broken demo.

---

## Editing the corpus

The retrieval corpus lives in the `<script type="application/json" id="corpus">` block near the bottom of `index.html`. Add a chunk and it becomes queryable. The architecture map itself uses a separately curated set of proof points, so navigation and supporting chunks do not appear as map cards.

```json
{
  "id": "short-slug",
  "node": "agents | orchestration | rag | governance | voice | evaluation",
  "title": "Short human title",
  "tags": ["searchable","keywords","product names"],
  "text": "Two to four sentences. Write it the way you'd say it out loud."
}
```

Two things that matter for retrieval quality:

- **Tags carry most of the weight.** Put the exact nouns a hiring manager would type — product names, protocols, vendors.
- **Lead with the fact, not the setup.** In local mode the first two sentences *are* the answer.

If a common question retrieves nothing, add the trigger word to `EXPAND` in the script (e.g. `"finops":['cost','spend','optimization']`).

---

## Known gaps

- **Read the corpus before it goes live.** Anything overstated is on the page under your name.
- **`resume.pdf` doesn't exist yet.** Nothing links to one — decide which version to publish,
  and strip the phone number before a PDF goes into a public repo.
- **Favicon.** Social and canonical metadata now use `img/og-card.png`; add a favicon when one is available.
  `robots.txt` and `sitemap.xml` are in place and point at `https://shivap.me/`.
- **Custom domain.** There's no `CNAME` file in the repo. If `shivap.me` is pointed at Pages
  through Settings → Pages, GitHub writes that file itself; if it's fronted by Cloudflare
  instead, leave it alone. Worth confirming which, so the domain can't silently drop.
- **Worker is not wired up.** `CONFIG.workerUrl` is empty, so the page runs local extractive
  retrieval and the headline "live model" mode never turns on. `worker.js` now carries the real
  allowed origins; it still needs deploying, and `MODEL` there is `claude-sonnet-4-6` —
  `claude-opus-5` is the better-answer / higher-cost swap.
