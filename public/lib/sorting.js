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

// ---------------------------------------------------------------- Claude
export function buildSortPrompt(lists, items, labels = []) {
  const ctx = lists.map(l => ({ id: l.id, name: l.name, examples: (l.examples || []).slice(-8) }));
  const lab = (labels || []).slice(0, 40).map(l => ({ name: l.name, examples: (l.examples || []).slice(0, 8) }));
  return `You sort short personal notes-to-self (mostly Hebrew) into the user's existing lists.
Lists (id, name, a few items already in it):
${JSON.stringify(ctx)}
${lab.length ? `
The user's labels (name, a few items that already carry it):
${JSON.stringify(lab)}
` : ""}
New items:
${JSON.stringify(items.map((t, i) => ({ i, text: t })))}

For each new item decide which list it clearly belongs to. Use the list name and its examples as the meaning of the list.
Judge by WHAT the item is, not by shared words. Opening verbs such as "לקנות", "לעשות", "להתקשר", "לבדוק" are not evidence for a list just because its name contains the same word. When two lists look alike (for example a groceries list and a list of things to buy in shops), the examples show the difference: food and everyday household supplies go with the groceries-like examples; clothes, toys, furniture, gifts and other one-off purchases go with the shop-like examples.
Items are often dictated by voice, so the user may start an item by naming the destination list, e.g. "קניות חלב", "לקניות חלב", "ברשימת בית לתקן ברז". When an item begins with the name of one of the lists used as a destination like this, put it in that list with confidence 1 and remove that list mention from the text. Do not strip words that are really part of the task.
Reply with ONLY a JSON array, one object per item: {"i": number, "listId": string|null, "confidence": number 0-1, "newList": string|null, "text": string, "labels": string[]}
- listId: the id of the best list, or null if no list clearly fits.
- confidence: how obvious the choice is. Use >= 0.85 when one list is clearly the right home for this kind of item given its name and examples — even if another list has a similar name. Go lower only when the item itself is unclear or two lists genuinely fit it equally; then the user will be asked.
- newList: when nothing fits well, a short Hebrew name (1-2 words) for a new list; otherwise null.
- text: the item text to save — identical to the input, except with a leading destination-list mention removed.
- labels: names from the user's labels above that clearly fit the item, copied exactly; usually none or one. Add a label only when it says what the item is or where it gets done (a shop, a person, a project) and the item obviously belongs with that label's name or examples — e.g. diapers get a pharmacy-shop label if the user has one. Never add labels about priority or timing (urgent, important, this week, waiting…) — those are the user's own call. Never invent a label. When unsure, return [].`;
}

export function parseJsonReply(text) {
  try { return JSON.parse(text); } catch (_) {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch (_) {} }
  const a = text.indexOf("["), b = text.lastIndexOf("]");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch (_) {} }
  return null;
}

export const CLAUDE_SURE = 0.85;

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
