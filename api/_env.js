// Environment for the server functions. Accepts the names the Supabase ↔ Vercel
// integration creates as well as plain ones.
import { createClient } from "@supabase/supabase-js";
import { buildSortPrompt, parseJsonReply } from "../public/lib/sorting.js";

export const env = {
  url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  // newer Supabase projects call these "publishable" / "secret" keys; older ones "anon" / "service_role"
  anon: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  service: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  claudeKey: process.env.ANTHROPIC_API_KEY,
  claudeModel: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
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

// ask Claude to place items; returns [{i, listId, confidence, newList, text}] or null
export async function claudeSort(lists, items, labels = []) {
  if (!env.claudeKey || !items.length || !lists.length) return null;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.claudeKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: env.claudeModel,
      max_tokens: 800,
      messages: [{ role: "user", content: buildSortPrompt(lists, items, labels) }],
    }),
  });
  if (!r.ok) { console.error("claude", r.status, await r.text().catch(() => "")); return null; }
  const data = await r.json();
  const text = (data.content || []).map(c => c.text || "").join("");
  const parsed = parseJsonReply(text);
  return Array.isArray(parsed) ? parsed : null;
}

export async function readBody(req) {
  if (req.body !== undefined && req.body !== null && req.body !== "") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  try { return JSON.parse(raw); } catch (_) { return raw; }
}
