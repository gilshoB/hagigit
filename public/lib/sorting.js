// Shared by the app (browser) and the server (Vercel functions).
// Sorting order for a new line of text:
//   1. an explicit list name at the start ("קניות: חלב", "לקניות, חלב")
//   2. a free local guess from words in tasks already in each list
//   3. Claude — only when 1 and 2 are not sure (and a key is configured)
//   4. otherwise the person is asked (in the app) or it waits in the inbox (from the Shortcut)

// ---------------------------------------------------------------- labels
// labels are matched by name; "#דחוף", the emoji, or the bare word all apply it
export function extractLabels(text, labels) {
  const found = new Set();
  let out = text;
  for (const l of labels) {
    const name = l.name;
    const tagRe = new RegExp("#" + escapeRe(name) + "(?=$|[\\s,.!?])", "g");
    if (tagRe.test(out)) { found.add(name); out = out.replace(tagRe, " "); }
    if (l.emoji && out.includes(l.emoji)) { found.add(name); out = out.split(l.emoji).join(" "); }
    if (out.split(/[\s,.!?:;־-]+/).includes(name)) found.add(name);
  }
  out = out.replace(/\s{2,}/g, " ").trim();
  return { text: out || text.trim(), labels: [...found] };
}

// ---------------------------------------------------------------- explicit list name
export const DIRECT_RE = /^([^:：,،–\-]{1,30}?)\s*[:：,،–\-]\s*(.+)$/;

export function findListByName(name, lists) {
  const k = name.trim().toLowerCase();
  const variants = [k, k.replace(/^(ל|ב)?(רשימת|רשימה)\s+/, ""), k.replace(/^(ל|ב)/, "")];
  return lists.find(l => variants.includes(l.name.trim().toLowerCase()));
}

// "קניות: חלב" → { list, text: "חלב" }
export function directMatch(line, lists) {
  const m = line.match(DIRECT_RE);
  if (!m) return null;
  const list = findListByName(m[1], lists);
  return list ? { list, text: m[2].trim() } : null;
}

// ---------------------------------------------------------------- free local guess
const STOP = new Set(["את", "של", "על", "עם", "לא", "כן", "גם", "זה", "זו", "אני", "צריך", "צריכה", "עוד", "כל", "או", "אם", "יש", "אין", "the", "a", "to", "and"]);
const PREFIX = /^(ו|ה|ב|ל|מ|ש|כ|וה|וב|ול|ומ|וש|שה|שב|של|לה|מה|בה)/;

export function words(text) {
  return String(text || "").toLowerCase()
    .replace(/[֑-ׇ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP.has(w));
}

// a word and its form without a leading Hebrew prefix letter or two
function forms(w) {
  const out = [w];
  const bare = w.replace(PREFIX, "");
  if (bare !== w && bare.length > 1) out.push(bare);
  return out;
}

// lists: [{ id, name, examples: [task texts] }]
// returns { listId, confidence (0..1), scores } — confidence is high only when one list clearly wins
export function guessList(text, lists) {
  const vocab = new Map();          // form -> Map(listId -> count)
  const add = (form, id, n) => {
    if (!vocab.has(form)) vocab.set(form, new Map());
    const m = vocab.get(form);
    m.set(id, (m.get(id) || 0) + n);
  };
  for (const l of lists) {
    for (const w of words(l.name)) for (const f of forms(w)) add(f, l.id, 3);
    for (const ex of l.examples || []) for (const w of new Set(words(ex))) for (const f of forms(w)) add(f, l.id, 1);
  }
  const scores = new Map(lists.map(l => [l.id, 0]));
  let evidence = 0;
  for (const w of new Set(words(text))) {
    let best = null;
    for (const f of forms(w)) { const m = vocab.get(f); if (m && (!best || sum(m) > sum(best))) best = m; }
    if (!best) continue;
    const total = sum(best);
    for (const [id, c] of best) scores.set(id, scores.get(id) + c / total);
    evidence += Math.min(total, 3);
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [first, second] = ranked;
  if (!first || first[1] === 0) return { listId: null, confidence: 0, scores };
  const margin = first[1] - (second ? second[1] : 0);
  // needs repeated evidence and a clear lead over the runner-up
  const confidence = Math.max(0, Math.min(1, (margin / first[1]) * Math.min(1, evidence / 2)));
  return { listId: first[0], confidence, scores };
}
const sum = m => [...m.values()].reduce((a, b) => a + b, 0);

export const LOCAL_SURE = 0.75;


// ---------------------------------------------------------------- how a list can be named out loud
// The full name, plus any word of the name that no other list's name has and that isn't a
// common opening verb ("לקנות", "להתקשר"…), so "לקנות חלב" never counts as "the list לקנות מחנויות".
const VERBS = /^(ל|ו?ל)?(קנות|קנייה|עשות|התקשר|בדוק|סדר|הזמין|שלם|תקן|הביא|קבוע|שלוח|כתוב|נקות|בשל|הכין)$/;
const bareWord = w => w.replace(/^(ו|ה|ב|ל|מ)/, "");
export function spokenNames(lists) {
  const wordsOf = l => words(l.name).filter(w => w.length > 2);
  const count = new Map();   // counted by the form without a prefix letter, so "קניות"/"לקניות" are one word
  for (const l of lists) for (const b of new Set(wordsOf(l).map(bareWord))) count.set(b, (count.get(b) || 0) + 1);
  const out = {};
  for (const l of lists) {
    const own = [...new Set(wordsOf(l))].filter(w => count.get(bareWord(w)) === 1 && !VERBS.test(w));
    out[l.id] = [l.name.trim(), ...own.filter(w => w !== l.name.trim())];
  }
  return out;
}

// ---------------------------------------------------------------- Claude
export function buildSortPrompt(lists, items, labels = []) {
  const ctx = lists.map(l => ({ id: l.id, name: l.name, items: (l.examples || []).slice(0, 20) }));
  const lab = (labels || []).slice(0, 40).map(l => ({ name: l.name, examples: (l.examples || []).slice(0, 8) }));
  return `You put the user's notes-to-self (mostly Hebrew, often dictated by voice) into their existing lists — where they themselves would put them.
Their lists, each with some of the items already in it (that's how you learn what each list is for):
${JSON.stringify(ctx)}
${lab.length ? `
Their labels, with a few items that carry each:
${JSON.stringify(lab)}
` : ""}
New items:
${JSON.stringify(items.map((t, i) => ({ i, text: t })))}

Two things the user says on purpose:
1. A list's name anywhere in the item — at the start, in the middle or at the end, also with ל/ב/"לרשימת" in front — means "put it in that list". Remove that mention from the text.
2. A time word (היום, מחר, השבוע…) when one of their lists is clearly about that time (e.g. "מה עושים היום?" for היום) means "put it in that list". Remove the time word from the text. If no list is about that time, the time word stays in the text and doesn't decide the list.
Otherwise, decide by what the item is.

Reply with ONLY a JSON array, one object per item: {"i": number, "listId": string|null, "confidence": number 0-1, "newList": string|null, "text": string, "labels": string[]}
- listId: the list, or null only if you really can't tell.
- newList: when none of their lists fits at all, a short Hebrew name for a new one; otherwise null.
- text: the item as the user said it, minus a list mention or time word removed by the rules above.
- labels: names from their labels that clearly fit (usually none or one), copied exactly; never priority/timing labels, never invented ones.`;
}

export function parseJsonReply(text) {
  try { return JSON.parse(text); } catch (_) {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch (_) {} }
  const a = text.indexOf("["), b = text.lastIndexOf("]");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch (_) {} }
  return null;
}

export const CLAUDE_SURE = 0.6;   // below this the model itself is unsure, and the app asks

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
