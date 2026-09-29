// Public settings the app needs to start (the anon key is safe to expose; security is in the database rules).
import { env } from "./_env.js";

export default function handler(req, res) {
  if (!env.url || !env.anon) {
    res.status(500).json({ error: "missing SUPABASE_URL / SUPABASE_ANON_KEY in Vercel environment variables" });
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json({ url: env.url, anonKey: env.anon, smartSort: Boolean(env.claudeKey) });
}
