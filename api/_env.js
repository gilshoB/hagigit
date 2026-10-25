// Environment for the server functions. Accepts the names the Supabase ↔ Vercel
// integration creates as well as plain ones.
import { createClient } from "@supabase/supabase-js";
import { buildSortPrompt, parseJsonReply, CLAUDE_SURE } from "../public/lib/sorting.js";

export const env = {
  url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  // newer Supabase projects call these "publishable" / "secret" keys; older ones "anon" / "service_role"
  anon: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  service: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  claudeKey: process.env.ANTHROPIC_API_KEY,
  claudeModel: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
  // a stronger model, asked only about the items the quick model wasn't sure of
  claudeStrongModel: process.env.ANTHROPIC_STRONG_MODEL || "claude-sonnet-5",
};

// (globalThis.__gigitTestDb lets the local tests run the handlers against an in-memory database)
export const admin = () => globalThis.__gigitTestDb || createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });

// who is calling, from the app's "Authorization: Bearer <access token>"
export async function userFromRequest(req) {
  const h = req.headers.authorization || "";
  const jwt = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!jwt) return null;
  const sb = createClient(env.url, env.anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getUser(jwt);
  return error ? null : data.user;
}

// ask Claude to place items; returns [{i, listId, confidence, newList, text, labels}] or null.
// The quick model sorts everything; items it isn't sure of get a second look from the stronger model.
// Throws when the quick model can't be reached (no key, no credit…) so the app can say "unavailable".
async function askClaude(model, lists, items, labels, maxTokens) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.claudeKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: buildSortPrompt(lists, items, labels) }] }),
  });
  if (!r.ok) { console.error("claude", model, r.status, await r.text().catch(() => "")); throw new Error("claude " + r.status); }
  const data = await r.json();
  const parsed = parseJsonReply((data.content || []).map(c => c.text || "").join(""));
  return Array.isArray(parsed) ? parsed : null;
}

export async function claudeSort(lists, items, labels = []) {
  if (!env.claudeKey || !items.length || !lists.length) return null;
  const quick = await askClaude(env.claudeModel, lists, items, labels, 800);
  if (!quick) return null;
  // remember the quick model's call on every item, so the sort log can show who decided what
  const first = quick.map(x => ({ ...x, by: "quick", quick: { listId: x?.listId ?? null, confidence: Number(x?.confidence) || 0 } }));
  const unsure = items.map((_, i) => i).filter(i => { const h = first.find(x => Number(x?.i) === i); return !h || !h.listId || Number(h.confidence) < CLAUDE_SURE; });
  if (!unsure.length || !env.claudeStrongModel) return first;
  try {
    const second = await askClaude(env.claudeStrongModel, lists, unsure.map(i => items[i]), labels, 1000);
    if (!second) return first;
    const out = first.filter(x => !unsure.includes(Number(x?.i)));
    unsure.forEach((orig, k) => {
      const q = first.find(x => Number(x?.i) === orig);
      const h = second.find(x => Number(x?.i) === k);
      if (h) out.push({ ...h, i: orig, by: "strong", quick: q?.quick || null, strong: { listId: h.listId ?? null, confidence: Number(h.confidence) || 0 } });
      else if (q) out.push(q);
    });
    return out;
  } catch (_) { return first; }   // the second look is a bonus; keep the quick answer if it fails
}

export async function readBody(req) {
  if (req.body !== undefined && req.body !== null && req.body !== "") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  try { return JSON.parse(raw); } catch (_) { return raw; }
}
