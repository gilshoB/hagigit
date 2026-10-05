// The iPhone Shortcut posts dictated text here with the person's private token.
// Tasks are sorted on the server and the reply is a short Hebrew sentence the
// Shortcut shows as a notification.
//
//   POST /api/capture?t=<token>     body: {"text": "..."}  (JSON, form, or plain text)
//   GET  /api/capture?t=<token>&text=...                    (handy for testing in a browser)
import { admin, claudeSort, readBody, env } from "./_env.js";
import { extractLabels, directMatch, guessList, LOCAL_SURE, CLAUDE_SURE } from "../public/lib/sorting.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  const say = (code, msg) => res.status(code).send(msg);
  if (!env.url || !env.service) return say(500, "השרת לא מוגדר עדיין (חסר SUPABASE_SECRET_KEY).");

  const body = req.method === "POST" ? await readBody(req) : {};
  const token = String(req.query.t || body?.token || "").trim();
  let text = typeof body === "string" ? body : (body?.text ?? req.query.text ?? "");
  text = String(text).trim();
  if (!token) return say(401, "חסר הטוקן האישי בקיצור.");
  if (!text) return say(400, "לא נשמע טקסט. נסי להקליט שוב.");

  const db = admin();
  const { data: tok } = await db.from("capture_tokens").select("user_id").eq("token", token).maybeSingle();
  if (!tok) return say(401, "הטוקן בקיצור לא מוכר. העתיקי אותו מחדש מההגדרות באפליקציה.");
  const uid = tok.user_id;

  // the person's lists (their own and shared with them), with recent tasks as examples
  const { data: mem } = await db.from("list_members").select("list_id, lists!inner(id, name, kind)").eq("user_id", uid);
  const all = (mem || []).map(m => m.lists);
  const lists = all.filter(l => l.kind === "list");
  const ids = lists.map(l => l.id);
  const { data: recent } = ids.length
    ? await db.from("tasks").select("list_id, text, done, labels").in("list_id", ids).is("deleted_at", null)
        .order("created_at", { ascending: false }).limit(600)
    : { data: [] };
  const ctx = lists.map(l => ({ id: l.id, name: l.name, examples: (recent || []).filter(t => t.list_id === l.id).slice(0, 12).map(t => t.text) }));
  const openTexts = new Set((recent || []).filter(t => !t.done).map(t => t.text));
  const { data: labels } = await db.from("labels").select("name, emoji").eq("owner_id", uid);

  const placed = [], waiting = [], dup = [];
  for (const raw of text.split(/\n+/).map(s => s.trim()).filter(Boolean)) {
    const d = directMatch(raw, lists);
    const x = extractLabels(d ? d.text : raw, labels || []);
    if (openTexts.has(x.text)) { dup.push(x.text); continue; }
    if (d) { placed.push({ ...x, listId: d.list.id }); continue; }
    // with the smart sort on, Claude decides (it understands what the item is); the free word guess is the fallback
    const g = guessList(x.text, ctx);
    waiting.push({ ...x, localId: g.listId && g.confidence >= LOCAL_SURE ? g.listId : null });
  }

  // Claude: the list for what the free guess wasn't sure about, and fitting labels (from the person's own) for everything new
  const labelNames = new Set((labels || []).map(l => l.name));
  const labelCtx = (labels || []).map(l => ({ name: l.name, examples: (recent || []).filter(t => (t.labels || []).includes(l.name)).slice(0, 8).map(t => t.text) }));
  const withLabels = (item, r) => { const add = (Array.isArray(r?.labels) ? r.labels : []).filter(n => labelNames.has(n) && !(item.labels || []).includes(n)).slice(0, 2);
    return add.length ? { ...item, labels: [...(item.labels || []), ...add] } : item; };
  if (waiting.length || (placed.length && labelCtx.length)) {
    const asked = [...waiting, ...placed];   // waiting first, so their index stays the same
    const results = await claudeSort(ctx, asked.map(w => w.text), labelCtx).catch(() => null);
    const nW = waiting.length;
    for (let j = 0; j < placed.length; j++) placed[j] = withLabels(placed[j], results?.find(x => Number(x?.i) === nW + j));
    for (let i = 0; i < nW; i++) waiting[i] = withLabels(waiting[i], results?.find(x => Number(x?.i) === i));
    for (let i = nW - 1; i >= 0; i--) {
      const r = results?.find(x => Number(x?.i) === i);
      if (r && ids.includes(r.listId) && Number(r.confidence) >= CLAUDE_SURE) {
        const clean = typeof r.text === "string" ? r.text.trim() : "";
        const w = waiting[i];
        placed.push({ ...w, text: clean && clean.length < w.text.length && w.text.includes(clean) ? clean : w.text, listId: r.listId });
        waiting.splice(i, 1);
      }
    }
  }
  // Claude unavailable or unsure: fall back to the free guess where it was sure
  for (let i = waiting.length - 1; i >= 0; i--) if (waiting[i].localId) { placed.push({ ...waiting[i], listId: waiting[i].localId }); waiting.splice(i, 1); }

  // anything still unsure waits in the person's inbox; the app asks where it goes
  let inboxId = null;
  if (waiting.length) {
    inboxId = all.find(l => l.kind === "inbox")?.id;
    if (!inboxId) {
      const { data: created, error } = await db.from("lists").insert({ owner_id: uid, name: "נכנסים", kind: "inbox" }).select("id").single();
      if (error) return say(500, "לא הצלחתי לשמור. נסי שוב.");
      inboxId = created.id;
    }
  }

  const rows = [
    ...placed.map(p => ({ list_id: p.listId, text: p.text, labels: p.labels, created_by: uid })),
    ...waiting.map(w => ({ list_id: inboxId, text: w.text, labels: w.labels, created_by: uid })),
  ];
  if (rows.length) {
    const { error } = await db.from("tasks").insert(rows);
    if (error) return say(500, "לא הצלחתי לשמור. נסי שוב.");
  }

  const nameOf = id => lists.find(l => l.id === id)?.name || "";
  const lines = [];
  for (const p of placed) lines.push(`✓ ${p.text} ← ${nameOf(p.listId)}`);
  for (const w of waiting) lines.push(`? ${w.text} — מחכה לבחירת רשימה באפליקציה`);
  for (const t of dup) lines.push(`= ${t} — כבר ברשימה`);
  return say(200, lines.join("\n") || "לא נוסף כלום.");
}
