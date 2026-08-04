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

Optional rate-limit KV:

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

Everything on the page reads from the `<script type="application/json" id="corpus">` block near the bottom of `index.html`. Add a chunk and it automatically appears in the retrieval index, the node counts, the architecture map detail, and the work list.

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

- **Corpus is my draft, not your words.** I wrote it from what I know of your background. Read it before it goes live — anything overstated is on the page under your name.
- **Contact links are placeholders.** The site will publish with `you@example.com` if you don't change it.
- **`resume.pdf` doesn't exist yet.**
- **Not indexed for search.** Add `<meta property="og:*">` tags before you start sharing the link.
