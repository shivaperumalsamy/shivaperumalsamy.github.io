# shivaperumalsamy.github.io

Personal portfolio at **[shivap.me](https://shivap.me)** — a single static page that runs a
small retrieval agent over its own corpus: plan → retrieve (BM25-lite, client-side) → synthesize,
with the retrieved chunks and their scores shown before the answer. It refuses when nothing
clears the relevance gate.

- `index.html` — the whole site. Content lives in the `<script type="application/json" id="corpus">`
  block near the bottom; every section reads from it.
- `worker.js` — optional Cloudflare Worker for live model synthesis. Without it the page answers
  extractively from the corpus.
- `blog/` — long-form posts.
- `DEPLOY.md` — deploy steps, corpus schema, and known gaps.
