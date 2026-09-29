// The app asks Claude here only for items the free local guess wasn't sure about.
import { env, userFromRequest, claudeSort, readBody } from "./_env.js";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).end(); return; }
  if (!env.claudeKey) { res.status(200).json({ available: false }); return; }
  const user = await userFromRequest(req);
  if (!user) { res.status(401).json({ error: "not signed in" }); return; }
  const body = await readBody(req);
  const lists = Array.isArray(body?.lists) ? body.lists.slice(0, 60) : [];
  const items = Array.isArray(body?.items) ? body.items.slice(0, 30).map(String) : [];
  try {
    const results = await claudeSort(lists, items);
    res.status(200).json({ available: true, results: results || [] });
  } catch (e) {
    console.error(e);
    res.status(200).json({ available: true, results: [] });
  }
}
