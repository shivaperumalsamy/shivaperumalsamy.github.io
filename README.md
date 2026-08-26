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

## WebMCP

When a browser exposes the experimental WebMCP API, the page registers two native tools without a
polyfill: `search_shiva_portfolio` for relevance-gated corpus search and
`open_shiva_portfolio_section` for opening a capability section. Browsers without WebMCP continue
to run the site normally.
