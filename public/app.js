// הגיגית — the app. Same look and behaviour as the Claude artifact version,
// now on its own database (Supabase) with real accounts and per-list sharing.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";
import { extractLabels as extractLabelsWith, directMatch, findListByName as findListByNameIn, guessList, LOCAL_SURE, CLAUDE_SURE } from "/lib/sorting.js";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
const ms = v => v ? new Date(v).getTime() : null;
const iso = v => v ? new Date(v).toISOString() : null;
const I = {
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  trash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/></svg>',
  move: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13M13 4l4 4-4 4M20 16H7M11 12l-4 4 4 4"/></svg>',
  edit: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 5.5l3 3M4 20l1-4L16 5a2.1 2.1 0 013 3L8 19z"/></svg>',
  tag: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12V4a1 1 0 011-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.4"/></svg>',
  back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  note: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h10l4 4v12H5z"/><path d="M9 12h6M9 16h4"/></svg>',
  image: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M20 16l-5-5-8 8"/></svg>',
  cal: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
  bin: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/></svg>',
  chev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  people: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.2c2.4.2 4 1.8 4.5 4.3"/></svg>',
  pin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

$("#date").textContent = new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });

/* =====================================================================
   connection + accounts
   ===================================================================== */
let sb = null, cfg = null, me = null, myProfile = null, captureToken = null;
const state = { lists: {}, tasks: {}, labels: {}, people: {} };

function show(view){
  $("#boot").hidden = view !== "boot";
  $("#loginView").hidden = view !== "login";
  $("#appView").hidden = view !== "app";
}

// the installed app can stay open for days: refresh settings (e.g. smart sorting turned on) when it comes back to the screen
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !cfg) return;
  try{ const r = await fetch("/api/config", { cache: "no-store" }); if (r.ok){ const c = await r.json(); cfg.smartSort = !!c.smartSort; } }catch(_){}
});

async function boot(){
  try{
    const r = await fetch("/api/config", { cache: "no-store" }); cfg = await r.json();
    if (!r.ok) throw new Error(cfg.error || "config");
  }catch(e){
    $("#boot").textContent = "האפליקציה עוד לא מחוברת למסד הנתונים. צריך להגדיר את משתני הסביבה ב-Vercel (ראו README).";
    return;
  }
  const recovery = /type=recovery/.test(location.hash);   // arrived from a "reset password" email
  sb = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  rememberInvite();
  const { data } = await sb.auth.getSession();
  if (data.session && recovery){ show("login"); setLoginMode("reset"); }
  else if (data.session) await enter(data.session.user); else show("login");
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === "PASSWORD_RECOVERY"){ me = null; show("login"); setLoginMode("reset"); return; }
    if (ev === "SIGNED_OUT"){ me = null; show("login"); }
    else if (ev === "SIGNED_IN" && session && (!me || me.id !== session.user.id)) enter(session.user);
  });
}

/* ---------- sign-in: email + password ---------- */
let loginMode = "in";   // "in" | "up" | "reset"
function setLoginMode(m){
  loginMode = m; $("#loginErr").textContent = ""; $("#loginErr").classList.remove("info");
  const up = m === "up", reset = m === "reset";
  $("#loginText").textContent = up ? "חשבון חדש: שם, מייל וסיסמה (לפחות 6 תווים). אחרי ההרשמה יגיע מייל אישור." : reset ? "בחרי סיסמה חדשה." : "כניסה עם המייל והסיסמה שלך.";
  $("#loginEmail").hidden = reset; $("#loginName").hidden = !up;
  // "email" makes the phone offer the person's own address when signing up; "username" lets it offer the saved login
  $("#loginEmail").autocomplete = up ? "email" : "username";
  $("#loginPass").autocomplete = up || reset ? "new-password" : "current-password";
  $("#loginPass").placeholder = reset ? "סיסמה חדשה" : "סיסמה";
  $("#loginBtn").textContent = up ? "הרשמה" : reset ? "שמירת הסיסמה" : "כניסה";
  $("#loginMode").hidden = reset; $("#loginForgot").hidden = up || reset;
  $("#loginMode").textContent = up ? "יש לך כבר חשבון? לכניסה לוחצים כאן" : "אין לך חשבון? להרשמה לוחצים כאן";
}
$("#loginMode").addEventListener("click", () => setLoginMode(loginMode === "up" ? "in" : "up"));
// install instructions on the sign-in screen, for people who opened the link in a browser
$("#loginInstall").hidden = isInstalled();
$("#loginInstall").addEventListener("click", () => {
  const box = $("#loginInstallBox"), open = box.hidden;
  if (open && !box.innerHTML) box.innerHTML = installSec(true);
  box.hidden = !open; $("#loginInstall").setAttribute("aria-expanded", String(open));
  if (open) box.scrollIntoView({ block: "nearest", behavior: "smooth" });
});
$("#loginForgot").addEventListener("click", async () => {
  const email = $("#loginEmail").value.trim(), err = $("#loginErr");
  if (!/^\S+@\S+\.\S+$/.test(email)){ err.textContent = "כתבי קודם את המייל, ואז לחצי שוב על \"שכחתי סיסמה\"."; return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/" });
  err.classList.toggle("info", !error);
  err.textContent = error ? "לא הצלחתי לשלוח. נסי שוב בעוד כמה דקות." : "שלחתי מייל עם לינק לאיפוס. פתחי אותו, ובחרי סיסמה חדשה בדף שייפתח.";
});
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("#loginEmail").value.trim(), password = $("#loginPass").value, btn = $("#loginBtn"), err = $("#loginErr");
  err.textContent = ""; err.classList.remove("info");
  const name = $("#loginName").value.trim();
  if (loginMode === "up" && !name){ err.textContent = "כתבי שם או כינוי."; $("#loginName").focus(); return; }
  if (loginMode !== "reset" && !/^\S+@\S+\.\S+$/.test(email)){ err.textContent = "המייל לא נראה תקין."; return; }
  if (password.length < 6){ err.textContent = "הסיסמה צריכה להיות לפחות 6 תווים."; return; }
  const label = btn.textContent; btn.disabled = true; btn.textContent = "רגע…";
  try{
    if (loginMode === "reset"){
      const { error } = await sb.auth.updateUser({ password });
      if (error){ err.textContent = "לא הצלחתי לשמור. בקשי לינק איפוס חדש."; return; }
      const { data } = await sb.auth.getUser(); setLoginMode("in"); await enter(data.user); toast("הסיסמה עודכנה");
    } else if (loginMode === "up"){
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + "/", data: { name } } });
      if (error){ err.textContent = /registered|exists/i.test(error.message) ? "למייל הזה כבר יש חשבון. עברי לכניסה." : "ההרשמה לא הצליחה. נסי שוב."; return; }
      if (data.session) await enter(data.user);
      else { setLoginMode("in"); err.classList.add("info"); err.textContent = "עוד שלב קטן: שלחתי מייל אישור. לוחצים על הלינק שבו, ואז חוזרים לכאן ונכנסים."; }
    } else {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error){ err.textContent = /confirm/i.test(error.message) ? "צריך קודם לאשר את המייל (הלינק שנשלח בהרשמה)." : "המייל או הסיסמה לא נכונים."; return; }
      await enter(data.user);
    }
  } finally { btn.disabled = false; if (btn.textContent === "רגע…") btn.textContent = label; }
});

/* ---------- invite links: /join/<token> ---------- */
function rememberInvite(){
  const m = location.pathname.match(/^\/join\/([a-f0-9]{8,64})$/i);
  if (m){ try{ sessionStorage.setItem("gigit-invite", m[1]); localStorage.setItem("gigit-invite", m[1]); }catch(_){} history.replaceState(null, "", "/"); }
}
async function acceptPendingInvite(){
  let t = null; try{ t = sessionStorage.getItem("gigit-invite") || localStorage.getItem("gigit-invite"); }catch(_){}
  if (!t) return;
  try{ sessionStorage.removeItem("gigit-invite"); localStorage.removeItem("gigit-invite"); }catch(_){}
  const { data: listId, error } = await sb.rpc("accept_invite", { t });
  if (error){ toast("לינק ההזמנה לא תקף יותר. בקשי לינק חדש."); return; }
  await loadAll();
  const l = state.lists[listId];
  if (l){ flashId = l.id; toast(`הצטרפת לרשימה ${l.name}`); render(); }
}

async function enter(user){
  me = user; show("app");
  await loadAll();
  subscribe();
  await acceptPendingInvite();
  purgeOld();
  if (new URLSearchParams(location.search).has("rec")){ history.replaceState(null, "", "/"); setTimeout(startRec, 300); }
  // the name chosen at sign-up travels with the account; apply it the first time they get in
  const chosen = String(user.user_metadata?.name || "").trim().slice(0, 30), auto = (user.email || "").split("@")[0];
  if (chosen && (!myProfile?.name || myProfile.name === auto) && chosen !== auto){
    const { error } = await sb.from("profiles").update({ name: chosen }).eq("id", me.id);
    if (!error){ myProfile = { ...myProfile, name: chosen }; state.people[me.id] = myProfile; render(); }
  }
  if (!myProfile?.name || (myProfile.name === auto && !chosen)) setTimeout(() => { if (!$("#layer").innerHTML) openSettings(true); }, 400);
}

/* =====================================================================
   data: load, live updates, writes
   ===================================================================== */
const rowToTask = r => ({ id: r.id, listId: r.list_id, text: r.text, note: r.note || "", noteAt: ms(r.note_at), done: !!r.done, doneAt: ms(r.done_at),
  pinned: !!r.pinned, labels: r.labels || [], images: r.images || [], by: r.created_by, created: ms(r.created_at), deletedAt: ms(r.deleted_at) });
const taskToRow = t => ({ id: t.id, list_id: t.listId, text: t.text, note: t.note || "", note_at: iso(t.noteAt), done: !!t.done, done_at: iso(t.doneAt),
  pinned: !!t.pinned, labels: t.labels || [], images: t.images || [], created_at: iso(t.created || Date.now()), deleted_at: iso(t.deletedAt) });
const rowToLabel = r => ({ id: r.id, name: r.name, emoji: r.emoji || "", h: r.h, s: r.s, order: r.ord, pin: !!r.pin, created: ms(r.created_at) });

async function fetchAll(q){
  const out = []; let from = 0;
  for (;;){
    const { data, error } = await q().range(from, from + 999);
    if (error) throw error;
    out.push(...data); if (data.length < 1000) return out; from += 1000;
  }
}

let loading = null;
async function loadAll(){
  if (loading) return loading;
  loading = (async () => {
    try{
      const [lists, members, tasks, labels, profiles, token] = await Promise.all([
        fetchAll(() => sb.from("lists").select("*")),
        fetchAll(() => sb.from("list_members").select("list_id, user_id, role, position, pinned")),
        fetchAll(() => sb.from("tasks").select("*")),
        fetchAll(() => sb.from("labels").select("*")),
        fetchAll(() => sb.from("profiles").select("id, name, email")),
        sb.from("capture_tokens").select("token").maybeSingle(),
      ]);
      const L = {};
      for (const r of lists){
        const mine = members.find(m => m.list_id === r.id && m.user_id === me.id) || {};
        L[r.id] = { id: r.id, name: r.name, color: r.color, kind: r.kind, ownerId: r.owner_id, created: ms(r.created_at),
          pinned: !!mine.pinned, order: mine.position ?? undefined, members: members.filter(m => m.list_id === r.id).map(m => m.user_id) };
      }
      state.lists = L;
      state.tasks = Object.fromEntries(tasks.map(r => [r.id, rowToTask(r)]));
      state.labels = Object.fromEntries(labels.map(r => [r.id, rowToLabel(r)]));
      state.people = Object.fromEntries(profiles.map(p => [p.id, p]));
      myProfile = state.people[me.id] || { id: me.id, email: me.email, name: "" };
      captureToken = token.data?.token || null;
      render();
    }catch(e){ console.error(e); setStatus("אין חיבור כרגע. השינויים יחזרו כשהחיבור יחזור.", 6000); }
    finally{ loading = null; }
  })();
  return loading;
}

let channel = null, reloadTimer = null;
const reloadSoon = () => { clearTimeout(reloadTimer); reloadTimer = setTimeout(loadAll, 250); };
function subscribe(){
  if (channel) sb.removeChannel(channel);
  channel = sb.channel("gigit")
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, p => {
      if (p.eventType === "DELETE"){ delete state.tasks[p.old.id]; }
      else { const t = rowToTask(p.new); if (!state.lists[t.listId]) { reloadSoon(); return; } state.tasks[t.id] = t; }
      renderSoon();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "lists" }, reloadSoon)
    .on("postgres_changes", { event: "*", schema: "public", table: "list_members" }, reloadSoon)
    .on("postgres_changes", { event: "*", schema: "public", table: "labels" }, reloadSoon)
    .subscribe();
}
// coming back to the app after a while: catch up on anything missed
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && me) loadAll(); });
let rs = null; const renderSoon = () => { if (rs) return; rs = requestAnimationFrame(() => { rs = null; render(); }); };

function fail(e){
  console.error(e);
  const msg = String(e?.message || "");
  if (/row-level security|permission/i.test(msg)) setStatus("אין לך הרשאה לשנות את זה.", 5000);
  else setStatus("השמירה לא הצליחה. בודקת חיבור ומנסה לרענן…", 5000);
  reloadSoon();
}

const store = {
  async putList(l){
    const prev = state.lists[l.id]; state.lists[l.id] = l; render();
    if (!prev){
      const { error } = await sb.from("lists").insert({ id: l.id, name: l.name, color: l.color, owner_id: me.id });
      if (error) return fail(error);
      l.members = [me.id]; l.ownerId = me.id;
    } else if (prev.name !== l.name || prev.color !== l.color){
      const { error } = await sb.from("lists").update({ name: l.name, color: l.color }).eq("id", l.id);
      if (error) return fail(error);
    }
    if (!prev || prev.pinned !== l.pinned || prev.order !== l.order){
      if (!prev && !l.pinned && l.order === undefined) return;
      const { error } = await sb.from("list_members").update({ pinned: !!l.pinned, position: l.order ?? null }).eq("list_id", l.id).eq("user_id", me.id);
      if (error) fail(error);
    }
  },
  async putTask(t){
    state.tasks[t.id] = t; render();
    const { error } = await sb.from("tasks").upsert(taskToRow(t));
    if (error) fail(error);
  },
  async putTasks(ts){
    ts.forEach(t => state.tasks[t.id] = t); render();
    for (let i = 0; i < ts.length; i += 200){
      const { error } = await sb.from("tasks").upsert(ts.slice(i, i + 200).map(taskToRow));
      if (error) return fail(error);
    }
  },
  async delTask(id){
    const t = state.tasks[id]; delete state.tasks[id]; render();
    const { error } = await sb.from("tasks").delete().eq("id", id);
    if (error) return fail(error);
    if (t?.images?.length) sb.storage.from("images").remove(t.images.flatMap(p => [p, thumbPath(p)]));
  },
  async delList(id){
    const l = state.lists[id]; if (!l) return;
    const ids = Object.values(state.tasks).filter(t => t.listId === id).map(t => t.id);
    delete state.lists[id]; ids.forEach(t => delete state.tasks[t]); render();
    if (l.ownerId === me.id){
      const { error } = await sb.from("lists").delete().eq("id", id);
      if (error) fail(error);
    } else {
      const { error } = await sb.rpc("remove_member", { l: id, u: me.id });
      if (error) fail(error);
    }
  },
  async putLabel(l){
    const prev = state.labels[l.id]; state.labels[l.id] = l; render();
    const row = { id: l.id, name: l.name, emoji: l.emoji || "", h: l.h, s: l.s, ord: l.order ?? 0, pin: !!l.pin, owner_id: me.id };
    const { error } = prev ? await sb.from("labels").update(row).eq("id", l.id) : await sb.from("labels").insert(row);
    if (error) fail(error);
  },
  async delLabel(id){
    delete state.labels[id]; render();
    const { error } = await sb.from("labels").delete().eq("id", id);
    if (error) fail(error);
  },
};

/* =====================================================================
   colours, lists, labels
   ===================================================================== */
// hue, saturation — soft and distinct, in the order new lists receive them
const PALETTE = [[152,40],[208,48],[28,62],[268,36],[345,48],[46,64],[182,40],[12,52],[232,40],[92,36],[322,34],[196,30]];
const colorIdx = l => Number.isInteger(l?.color) ? l.color % PALETTE.length : 0;
const hueStyle = l => { const [h, sat] = PALETTE[colorIdx(l)]; return `--h:${h};--s:${sat}%`; };
function nextColor(){
  const used = listsSorted().map(colorIdx);
  for (let i = 0; i < PALETTE.length; i++) if (!used.includes(i)) return i;
  return used.length % PALETTE.length;
}
const newList = name => ({ id: newId(), name, created: Date.now(), color: nextColor(), kind: "list", ownerId: me.id, members: [me.id], pinned: false });

const isShared = l => (l?.members?.length || 1) > 1;
const visibleList = l => l && l.kind !== "inbox";
const inboxLists = () => Object.values(state.lists).filter(l => l.kind === "inbox");
const initial = p => (p?.name || p?.email || "?").trim().slice(0, 1);
const personName = id => { const p = state.people[id]; return p?.name || (p?.email || "").split("@")[0] || "מישהו"; };

const labelsSorted = () => Object.values(state.labels).sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || (a.created || 0) - (b.created || 0));
const labelByName = n => labelsSorted().find(l => l.name === n);
const labelStyle = l => `--h:${l.h ?? 200};--s:${l.s ?? 30}%`;
// tasks keep label names, so a label someone else added still shows (in a neutral colour if you don't have it)
const taskLabels = t => (t.labels || []).map(n => labelByName(n) || { name: n, emoji: "", h: 210, s: 8, order: 99 }).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
const isPinnedLabel = t => taskLabels(t).some(l => l.pin);
const pills = t => taskLabels(t).map(l => `<span class="lpill hued" style="${labelStyle(l)}">${esc(l.emoji || "")} ${esc(l.name)}</span>`).join("");
let filterLabel = null;
const extractLabels = text => extractLabelsWith(text, labelsSorted());

const listsSorted = () => Object.values(state.lists).filter(visibleList).sort((a, b) => ((a.order ?? 1e6) - (b.order ?? 1e6)) || ((a.created || 0) - (b.created || 0)));
const alive = () => Object.values(state.tasks).filter(t => !t.deletedAt);
const binned = () => Object.values(state.tasks).filter(t => t.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt);
const tasksOf = id => alive().filter(t => t.listId === id);
const KEEP_DAYS = 30;
function purgeOld(){
  const cutoff = Date.now() - KEEP_DAYS * 864e5;
  binned().filter(t => t.deletedAt < cutoff).forEach(t => store.delTask(t.id));
}
const openOf = id => tasksOf(id).filter(t => !t.done).sort((a, b) => (!!b.pinned - !!a.pinned) || (isPinnedLabel(b) - isPinnedLabel(a)) || (b.created || 0) - (a.created || 0));
const doneOf = id => tasksOf(id).filter(t => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
let statusTimer;
function setStatus(msg, t){ $("#status").textContent = msg || ""; clearTimeout(statusTimer); if (t) statusTimer = setTimeout(() => $("#status").textContent = "", t); }

/* =====================================================================
   main grid
   ===================================================================== */
let openListId = null, flashId = null;
let gridDrag = null, renderWaiting = false;
function render(){
  if (!me) return;
  if (gridDrag){ renderWaiting = true; return; }   // don't rebuild the grid under a finger
  const lists = listsSorted();
  const g = $("#grid");
  const openTotal = alive().filter(t => !t.done && visibleList(state.lists[t.listId])).length;
  $("#stat").textContent = lists.length ? `${openTotal} פתוחות · ${lists.length} רשימות` : "";
  renderInbox();
  if (!lists.length){
    g.innerHTML = `<div class="emptystate" style="grid-column:1/-1">עוד אין רשימות. כתבי משהו למעלה, והוא ימצא לעצמו מקום.</div><button class="cube new" data-newlist>+ רשימה חדשה</button>`;
  } else {
    const cube = l => {
      const allOpen = openOf(l.id), total = tasksOf(l.id).length, done = total - allOpen.length;
      const open = filterLabel ? allOpen.filter(t => (t.labels || []).includes(filterLabel)) : allOpen;
      if (filterLabel && !open.length) return "";
      const pct = total ? Math.round(done / total * 100) : 0;
      const prev = open.slice(0, 4).map(t => `<li>${t.pinned ? `<span class="pinmark">${I.pin}</span>` : ""}${taskLabels(t).length ? `<span class="em">${esc(taskLabels(t).map(x => x.emoji).join(""))}</span>` : `<i class="dot"></i>`}<span>${esc(t.text)}</span></li>`).join("");
      const more = open.length > 4 ? `<li class="more">ועוד ${open.length - 4}</li>` : "";
      const body = open.length ? prev + more : `<li class="empty">${total ? "הכול סגור" : "ריקה"}</li>`;
      return `<button class="cube hued${flashId === l.id ? " flash" : ""}" style="${hueStyle(l)}" data-open="${l.id}" data-sec="${l.pinned ? "pinned" : isShared(l) ? "shared" : "mine"}">
        <div class="cube-h"><span class="cube-name">${esc(l.name)}${isShared(l) ? `<span class="shared-ic" title="משותפת">${I.people}</span>` : ""}</span><span class="cube-count">${done}/${total}</span></div>
        <ul>${body}</ul>
        <div class="bar"><i style="width:${pct}%"></i></div>
      </button>`;
    };
    const newBtn = filterLabel ? "" : `<button class="cube new" data-newlist>+ רשימה חדשה</button>`;
    const sec = (title, ls, extra) => { const c = ls.map(cube).join(""); return (c || extra) ? `<div class="sec-h">${title}<span class="rule"></span></div>` + c + (extra || "") : ""; };
    const pinned = lists.filter(l => l.pinned);
    const shared = lists.filter(l => isShared(l) && !l.pinned);
    const mine = lists.filter(l => !isShared(l) && !l.pinned);
    g.innerHTML = sec(`${I.pin} מוצמדות`, pinned, "") + sec(`${I.people} משותפות`, shared, "") + sec(`שלי`, mine, newBtn);
    if (filterLabel && !g.querySelector(".cube")) g.innerHTML = `<div class="emptystate" style="grid-column:1/-1">אין משימות פתוחות עם הלייבל הזה.</div>`;
  }
  renderFilters();
  renderWho();
  if (searchOpen) renderSearchResults();
  const nb = binned().length;
  $("#trashBtn").innerHTML = `${I.bin} סל מחזור${nb ? ` · ${nb}` : ""}`;
  if (binOpen) renderBin();
  flashId = null;
  if (shareOpen) renderShare();
  else if (openListId) renderSheet();
}
function renderWho(){
  const name = myProfile?.name || (me?.email || "").split("@")[0];
  $("#whoBtn").innerHTML = `<span class="av">${esc(initial({ name }))}</span>${esc(name)}`;
}

/* ---------- inbox: recordings the server couldn't place ---------- */
function inboxTasks(){ const ids = inboxLists().map(l => l.id); return alive().filter(t => ids.includes(t.listId)); }
function renderInbox(){
  const n = inboxTasks().length;
  $("#inboxSlot").innerHTML = n ? `<button class="inbox" id="inboxBtn"><span class="n">${n}</span>${n === 1 ? "משימה מההקלטה מחכה לבחירת רשימה" : "משימות מההקלטה מחכות לבחירת רשימה"}</button>` : "";
}
$("#inboxSlot").addEventListener("click", e => {
  if (!e.target.closest("#inboxBtn")) return;
  enqueue(inboxTasks().map(t => ({ text: t.text, labels: t.labels, suggestId: null, suggestNew: "", moveId: t.id })));
});

/* =====================================================================
   search
   ===================================================================== */
let searchOpen = false;
const norm = x => String(x || "").toLowerCase().replace(/[֑-ׇ]/g, "");
function hl(text, terms){
  let out = esc(text);
  for (const t of terms){ if (!t) continue;
    const re = new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, m => `<mark>${m}</mark>`); }
  return out;
}
function snippet(note, term){
  const i = norm(note).indexOf(term); if (i < 0) return "";
  const a = Math.max(0, i - 30), b = Math.min(note.length, i + term.length + 50);
  return (a ? "…" : "") + note.slice(a, b).replace(/\s+/g, " ") + (b < note.length ? "…" : "");
}
function resetLayerState(){ openListId = null; noteId = null; binOpen = false; managing = false; searchOpen = false; shareOpen = false; settingsOpen = false; }
function openSearch(){
  resetLayerState(); searchOpen = true;
  $("#layer").innerHTML = `<div class="scrim" data-scrim><div class="sheet" role="dialog" aria-modal="true" aria-label="חיפוש">
    <div class="sh-head"><div class="sh-title">חיפוש</div><button class="x" data-act="close" aria-label="סגור">${I.x}</button></div>
    <label class="searchbox"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>
      <input id="searchQ" type="search" placeholder="חפשי במשימות, בפתקים ובלייבלים" autocomplete="off" aria-label="חיפוש"></label>
    <div class="scount" id="searchCount"></div>
    <div class="ch-body" id="searchRes"></div>
  </div></div>`;
  const q = $("#searchQ"); q.focus();
  q.addEventListener("input", renderSearchResults);
  renderSearchResults();
}
function renderSearchResults(){
  const box = $("#searchRes"), q = $("#searchQ"); if (!box || !q) return;
  const raw = q.value.trim(); const terms = norm(raw).split(/\s+/).filter(Boolean);
  if (!terms.length){ box.innerHTML = `<p class="label" style="padding:14px 4px">אפשר לחפש מילה מתוך משימה, מתוך פתק, שם של רשימה או לייבל.</p>`; $("#searchCount").textContent = ""; return; }
  const hits = alive().filter(t => visibleList(state.lists[t.listId])).map(t => {
    const l = state.lists[t.listId];
    const hay = norm([t.text, t.note, l.name, ...taskLabels(t).map(x => x.name + " " + (x.emoji || ""))].join(" \n "));
    if (!terms.every(w => hay.includes(w))) return null;
    const inText = terms.some(w => norm(t.text).includes(w));
    const noteTerm = terms.find(w => norm(t.note).includes(w));
    return { t, l, score: (t.done ? 0 : 2) + (inText ? 1 : 0), snip: noteTerm ? snippet(t.note, noteTerm) : "" };
  }).filter(Boolean).sort((a, b) => b.score - a.score || (b.t.created || 0) - (a.t.created || 0)).slice(0, 80);
  $("#searchCount").textContent = hits.length ? `${hits.length} תוצאות` : "";
  box.innerHTML = hits.length ? hits.map(({ t, l, snip }) => `<button class="sres${t.done ? " is-done" : ""}" data-goto="${t.id}">
      <span class="tt"><b>${hl(t.text, terms)}</b>${snip ? `<span class="snip">${hl(snip, terms)}</span>` : ""}
      <span class="meta"><span class="lpill hued" style="${hueStyle(l)}">${esc(l.name)}</span>${pills(t)}${t.done ? `<span class="label" style="margin:0">בוצע</span>` : ""}</span></span>
    </button>`).join("") : `<p class="label" style="padding:14px 4px">לא נמצאו משימות עם "${esc(raw)}".</p>`;
}
$("#searchBtn").addEventListener("click", openSearch);
// pulling the main screen down from its top opens search
let pull = null;
addEventListener("touchstart", e => {
  pull = (e.touches.length === 1 && !$("#appView").hidden && !$("#layer").innerHTML && scrollY <= 0 && !e.target.closest("textarea, input"))
    ? { y: e.touches[0].clientY, x: e.touches[0].clientX, ok: false } : null;
}, { passive: true });
addEventListener("touchmove", e => {
  if (!pull) return;
  const dy = e.touches[0].clientY - pull.y, dx = Math.abs(e.touches[0].clientX - pull.x);
  if (scrollY > 0 || dx > 40){ pull = null; return; }
  pull.ok = dy > 90;
}, { passive: true });
addEventListener("touchend", () => { const p = pull; pull = null; if (p?.ok && !$("#layer").innerHTML) openSearch(); }, { passive: true });
$("#layer").addEventListener("click", e => {
  const g = e.target.closest("[data-goto]"); if (!g || !searchOpen) return;
  const t = state.tasks[g.dataset.goto]; if (!t) return;
  searchOpen = false; openListId = t.listId; armedDelete = false; movingId = labelingId = editingId = null;
  if (t.done) showDone[t.listId] = true;
  openNote(t.id);
});

/* =====================================================================
   recycle bin
   ===================================================================== */
let binOpen = false, armedEmpty = false;
function ago(ts){
  const d = Math.floor((Date.now() - ts) / 864e5);
  return d <= 0 ? "היום" : d === 1 ? "אתמול" : `לפני ${d} ימים`;
}
function renderBin(){
  const items = binned();
  const prevScroll = $("#layer .ch-body")?.scrollTop || 0;
  $("#layer").innerHTML = `<div class="scrim" data-scrim><div class="sheet" role="dialog" aria-modal="true" aria-label="סל מחזור">
    <div class="sh-head"><div class="sh-title">סל מחזור</div><button class="x" data-act="close" aria-label="סגור">${I.x}</button></div>
    <div class="sh-sub">משימות שנמחקו נשמרות כאן ${KEEP_DAYS} יום, ואז נמחקות לתמיד.</div>
    <div class="ch-body">${items.length ? items.map(t => {
      const l = state.lists[t.listId];
      return `<div class="trow${t.done ? " was-done" : ""}"><div class="tt"><b>${t.done ? "✓ " : ""}${esc(t.text)}</b>
        <span class="meta">${visibleList(l) ? `<span class="lpill hued" style="${hueStyle(l)}">${esc(l.name)}</span>` : `<span>הרשימה נמחקה</span>`}<span>${ago(t.deletedAt)}</span></span></div>
        <button class="restore" data-restore="${t.id}">שחזר</button></div>`;
    }).join("") : `<p class="label" style="padding:20px 0;text-align:center">הסל ריק.</p>`}</div>
    ${items.length ? `<div class="sh-foot"><span></span><button class="ghost danger${armedEmpty ? " armed" : ""}" data-emptybin>${armedEmpty ? "לחצי שוב למחיקה לתמיד" : "רוקני את הסל"}</button></div>` : ""}
  </div></div>`;
  const cb = $("#layer .ch-body"); if (cb) cb.scrollTop = prevScroll;
}
$("#trashBtn").addEventListener("click", () => { resetLayerState(); binOpen = true; armedEmpty = false; renderBin(); });
$("#layer").addEventListener("click", e => {
  if (!binOpen) return;
  const r = e.target.closest("[data-restore]");
  if (r){ const t = state.tasks[r.dataset.restore]; if (!t) return;
    if (visibleList(state.lists[t.listId])){ store.putTask({ ...t, deletedAt: null }); flashId = t.listId; toast(`שוחזר ל־${state.lists[t.listId].name}`); }
    else { binOpen = false; enqueue([{ text: t.text, suggestId: null, suggestNew: "", moveId: t.id }]); }
    return; }
  if (e.target.closest("[data-emptybin]")){
    if (armedEmpty){ armedEmpty = false; binned().forEach(t => store.delTask(t.id)); }
    else { armedEmpty = true; renderBin(); setTimeout(() => { if (armedEmpty){ armedEmpty = false; binOpen && renderBin(); } }, 3500); }
  }
});

/* =====================================================================
   labels: filter row + manager
   ===================================================================== */
function renderFilters(){
  const f = $("#filters"); const labels = labelsSorted();
  if (filterLabel && !labelByName(filterLabel)) filterLabel = null;
  const openTasks = alive().filter(t => !t.done && visibleList(state.lists[t.listId]));
  f.innerHTML = labels.map(l => {
    const n = openTasks.filter(t => (t.labels || []).includes(l.name)).length;
    return `<button class="lchip hued${filterLabel === l.name ? " on" : ""}" style="${labelStyle(l)}" data-filter="${esc(l.name)}" aria-pressed="${filterLabel === l.name}">${esc(l.emoji || "")} ${esc(l.name)}${n ? ` <span class="n">${n}</span>` : ""}</button>`;
  }).join("") + `<button class="ghost" data-managelabels>${labels.length ? "ניהול לייבלים" : "+ לייבלים"}</button>`;
}
$("#filters").addEventListener("click", e => {
  const b = e.target.closest("[data-filter]");
  if (b){ filterLabel = filterLabel === b.dataset.filter ? null : b.dataset.filter; render(); return; }
  if (e.target.closest("[data-managelabels]")) openLabelManager();
});
let managing = false;
function openLabelManager(){
  resetLayerState(); managing = true;
  const labels = labelsSorted();
  $("#layer").innerHTML = `<div class="scrim" data-scrim><div class="sheet" role="dialog" aria-modal="true" aria-label="לייבלים">
    <div class="sh-head"><div class="sh-title">לייבלים</div><button class="x" data-act="close" aria-label="סגור">${I.x}</button></div>
    <div class="ch-body">
      <div>${labels.map(l => `<div class="lrow"><span class="lpill hued" style="${labelStyle(l)}">${esc(l.emoji || "")} ${esc(l.name)}</span>
        <span class="sp"></span>${l.pin ? `<span class="label" style="margin:0">מוצג ראשון ברשימה</span>` : ""}
        <button class="x" data-dellabel="${l.id}" aria-label="מחק לייבל ${esc(l.name)}">${I.trash}</button></div>`).join("") || `<p class="label">אין עדיין לייבלים.</p>`}</div>
      <p class="label" style="margin-top:16px">לייבל חדש</p>
      <form class="newlabel" id="lmForm"><input class="em" id="lmEmoji" placeholder="🙂" maxlength="4" aria-label="אימוג׳י"><input class="nm" id="lmName" placeholder="שם, למשל: לבדוק" maxlength="20" aria-label="שם הלייבל" autocomplete="off"><button type="submit">הוסף</button></form>
    </div></div></div>`;
}
function createLabel(emoji, name){
  name = name.trim().replace(/^#/, ""); if (!name) return null;
  const ex = labelByName(name); if (ex) return ex;
  const [h, sat] = PALETTE[labelsSorted().length % PALETTE.length];
  const l = { id: newId(), name, emoji: (emoji || "").trim().slice(0, 4), h, s: sat, order: labelsSorted().length, created: Date.now() };
  store.putLabel(l); return l;
}
$("#layer").addEventListener("submit", e => {
  if (e.target.matches("[data-newlabel]")){
    e.preventDefault(); const t = state.tasks[labelingId];
    const l = createLabel(e.target.em.value, e.target.nm.value);
    if (l && t && !(t.labels || []).includes(l.name)) store.putTask({ ...t, labels: [...(t.labels || []), l.name] });
    return;
  }
  if (e.target.id === "lmForm"){ e.preventDefault(); if (createLabel($("#lmEmoji").value, $("#lmName").value)) openLabelManager(); }
});
$("#layer").addEventListener("click", e => {
  const d = e.target.closest("[data-dellabel]");
  if (d && managing){ const l = state.labels[d.dataset.dellabel]; store.delLabel(d.dataset.dellabel); openLabelManager(); if (l) toast(`הלייבל ${l.name} נמחק`); }
});

/* =====================================================================
   reorder lists: long-press a cube, then drag
   ===================================================================== */
let pressTimer = null, dragSuppressClick = false;
$("#grid").addEventListener("pointerdown", e => {
  const c = e.target.closest(".cube[data-open]"); if (!c || e.button > 0 || filterLabel) return;
  const sx = e.clientX, sy = e.clientY, pid = e.pointerId;
  clearTimeout(pressTimer);
  const cancel = ev => { if (ev.pointerId === pid && (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8 || ev.type !== "pointermove")){ clearTimeout(pressTimer); cleanup(); } };
  const cleanup = () => { window.removeEventListener("pointermove", cancel); window.removeEventListener("pointerup", cancel); window.removeEventListener("pointercancel", cancel); };
  window.addEventListener("pointermove", cancel); window.addEventListener("pointerup", cancel); window.addEventListener("pointercancel", cancel);
  pressTimer = setTimeout(() => {
    cleanup();
    const r = c.getBoundingClientRect();
    gridDrag = { el: c, sec: c.dataset.sec, pid, ox: sx - r.left, oy: sy - r.top, x: sx, y: sy };
    c.classList.add("lifting"); $("#grid").classList.add("sorting");
    try{ c.setPointerCapture(pid); }catch(_){}
  }, 380);
});
// iOS: once a drag has started, stop the page from scrolling under it
document.addEventListener("touchmove", e => { if (gridDrag) e.preventDefault(); }, { passive: false });
window.addEventListener("pointermove", e => {
  const d = gridDrag; if (!d || e.pointerId !== d.pid) return;
  d.x = e.clientX; d.y = e.clientY;
  d.el.style.pointerEvents = "none";
  const under = document.elementFromPoint(d.x, d.y)?.closest(`.cube[data-open][data-sec="${d.sec}"]`);
  d.el.style.pointerEvents = "";
  if (under && under !== d.el){
    const sibs = [...$("#grid").querySelectorAll(`.cube[data-open][data-sec="${d.sec}"]`)];
    const from = sibs.indexOf(d.el), to = sibs.indexOf(under);
    under.parentNode.insertBefore(d.el, to > from ? under.nextSibling : under);
  }
  d.el.style.transform = "";
  const r = d.el.getBoundingClientRect();
  d.el.style.transform = `translate(${d.x - d.ox - r.left}px, ${d.y - d.oy - r.top}px)`;
});
function endGridDrag(e){
  const d = gridDrag; if (!d || (e && e.pointerId !== d.pid)) return;
  gridDrag = null; dragSuppressClick = true; setTimeout(() => dragSuppressClick = false, 60);
  d.el.classList.remove("lifting"); d.el.style.transform = ""; $("#grid").classList.remove("sorting");
  const ids = [...$("#grid").querySelectorAll(`.cube[data-open][data-sec="${d.sec}"]`)].map(x => x.dataset.open);
  const changed = ids.map((id, i) => ({ l: state.lists[id], i })).filter(({ l, i }) => l && l.order !== i);
  changed.forEach(({ l, i }) => state.lists[l.id] = { ...l, order: i });
  renderWaiting = false; render();
  (async () => { for (const { l, i } of changed){ const { error } = await sb.from("list_members").update({ position: i }).eq("list_id", l.id).eq("user_id", me.id); if (error) return fail(error); } })();
}
window.addEventListener("pointerup", endGridDrag);
window.addEventListener("pointercancel", endGridDrag);
$("#grid").addEventListener("contextmenu", e => { if (e.target.closest(".cube[data-open]")) e.preventDefault(); });
$("#grid").addEventListener("click", e => { if (dragSuppressClick){ e.stopPropagation(); e.preventDefault(); } }, true);
$("#grid").addEventListener("click", e => {
  const b = e.target.closest("[data-open]"); if (b){ openList(b.dataset.open); return; }
  if (e.target.closest("[data-newlist]")) openNewList();
});

/* =====================================================================
   list sheet
   ===================================================================== */
let showDone = {}; try{ showDone = JSON.parse(localStorage.getItem("gigit-showdone") || "{}") || {}; }catch(_){}
let armedDelete = false, movingId = null, labelingId = null, editingId = null, editJustOpened = false, rerendering = false;
function openList(id){ resetLayerState(); openListId = id; armedDelete = false; movingId = null; labelingId = null; editingId = null; renderSheet(true); }
function commitEdit(){
  const ei = $("#editInput"); const t = state.tasks[editingId];
  const v = ei ? ei.value.trim() : "";
  editingId = null;
  if (t && v && v !== t.text) store.putTask({ ...t, text: v }); else renderSheet();
}
function deleteTask(t, li){
  const run = () => { store.putTask({ ...t, deletedAt: Date.now() }); toast("הועבר לסל המחזור", { undo: { ...t, deletedAt: null } }); };
  if (li && !matchMedia("(prefers-reduced-motion: reduce)").matches){
    li.style.maxHeight = li.offsetHeight + "px"; li.offsetHeight; li.classList.add("gone"); setTimeout(run, 300);
  } else run();
}

/* keep open sheets above the on-screen keyboard (iPhone doesn't resize fixed layers for it) */
function fitViewport(){
  const vv = window.visualViewport; if (!vv) return;
  const r = document.documentElement.style;
  r.setProperty("--vvh", vv.height + "px"); r.setProperty("--vvtop", vv.offsetTop + "px");
  // keyboard up: give the room to the tasks (CSS hides the list's details and footer)
  document.documentElement.classList.toggle("kb", window.innerHeight - vv.height > 150);
}
if (window.visualViewport){ visualViewport.addEventListener("resize", fitViewport); visualViewport.addEventListener("scroll", fitViewport); fitViewport(); }
function revealSoon(el){
  const go = () => { if (el.isConnected) el.scrollIntoView({ block: "center", behavior: "smooth" }); };
  setTimeout(go, 50); setTimeout(go, 400);   // again after the keyboard finished sliding in
}
$("#layer").addEventListener("focusin", e => { if (e.target.matches("#editInput, .movebar input")) revealSoon(e.target); });

/* swipe: left = delete, right = move to another list */
let drag = null, suppressClick = false;
const OPEN_AT = 96;
function closeSwipes(except){ document.querySelectorAll("#layer .row[data-open]").forEach(r => { if (r !== except){ r.style.transform = ""; delete r.dataset.open; const li = r.closest(".task"); setTimeout(() => li.classList.remove("swiping"), 230); } }); }
$("#layer").addEventListener("pointerdown", e => {
  const row = e.target.closest(".row"); if (!row || e.target.closest("input")){ closeSwipes(); return; }
  if (e.button > 0 || editingId) return;
  closeSwipes(row);
  drag = { row, x: e.clientX, y: e.clientY, base: Number(row.dataset.open || 0), dx: 0, active: false, id: e.pointerId };
});
$("#layer").addEventListener("pointermove", e => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.active){
    if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.2){ if (Math.abs(dy) > 10) drag = null; return; }
    drag.active = true; drag.row.classList.add("dragging"); drag.row.closest(".task").classList.add("swiping");
    try{ drag.row.setPointerCapture(e.pointerId); }catch(_){}
  }
  drag.dx = drag.base + dx;
  drag.row.closest(".task").dataset.dir = drag.dx > 0 ? "move" : "del";
  drag.row.style.transform = `translateX(${drag.dx}px)`;
});
function endDrag(e){
  if (!drag || (e && e.pointerId !== drag.id)) return;
  const d = drag; drag = null;
  if (!d.active || !d.row.isConnected) return;
  suppressClick = true; setTimeout(() => suppressClick = false, 50);
  d.row.classList.remove("dragging");
  const w = d.row.offsetWidth, li = d.row.closest(".task"), t = li && state.tasks[li.dataset.id];
  if (Math.abs(d.dx) > w * 0.45 && t && d.dx > 0){
    // swiped right all the way: open "move to list"
    d.row.style.transform = ""; movingId = t.id; labelingId = editingId = null; renderSheet();
  } else if (Math.abs(d.dx) > w * 0.45 && t){
    d.row.style.transform = `translateX(${-w}px)`; deleteTask(t, li);
  } else if (Math.abs(d.dx) > 50){
    const v = Math.sign(d.dx) * OPEN_AT; d.row.style.transform = `translateX(${v}px)`; d.row.dataset.open = v;
  } else { d.row.style.transform = ""; delete d.row.dataset.open; setTimeout(() => li?.classList.remove("swiping"), 230); }
}
$("#layer").addEventListener("pointerup", endDrag);
$("#layer").addEventListener("pointercancel", endDrag);
$("#layer").addEventListener("click", e => { if (suppressClick){ e.stopPropagation(); e.preventDefault(); } }, true);
$("#layer").addEventListener("keydown", e => {
  if (e.key === "Delete" && !e.target.closest("input, textarea") && !noteId){
    const li = e.target.closest(".task"); const t = li && state.tasks[li.dataset.id]; if (t) deleteTask(t, li);
  }
});
function closeLayer(){ flushNote(); resetLayerState(); $("#layer").innerHTML = ""; if (chooser) nextChoice(true); }

function shareRow(l){
  const others = (l.members || []).filter(id => id !== me.id);
  const avs = others.slice(0, 4).map(id => `<span class="av" title="${esc(personName(id))}">${esc(initial(state.people[id]))}</span>`).join("");
  return `<div class="share-row">${others.length ? `<span class="avs">${avs}</span> משותפת עם ${esc(others.map(personName).join(", "))}` : "רק שלך"}
    <button class="sharebtn" data-act="share">${I.people} ${others.length ? "ניהול שיתוף" : "שיתוף"}</button></div>`;
}

function renderSheet(first){
  const l = state.lists[openListId]; if (!l){ closeLayer(); return; }
  if (noteId){ renderNote(); return; }
  const open = openOf(l.id), done = doneOf(l.id);
  const row = t => `<li class="task${t.done ? " done" : ""}" data-id="${t.id}" tabindex="-1">
      <div class="swipe-bg" aria-hidden="true"><span class="sw-del">${I.trash} מחק</span><span class="sw-move">העברה ${I.move}</span>
        <button class="sb-l" data-act="move" tabindex="-1"></button><button class="sb-r" data-act="del" tabindex="-1"></button></div>
      <div class="row">
      <button class="check" data-act="toggle" aria-label="${t.done ? "סמני כפתוחה" : "סמני כבוצעה"}" aria-pressed="${!!t.done}">${I.check}</button>
      ${editingId === t.id
        ? `<input class="tedit" id="editInput" value="${esc(t.text)}" aria-label="עריכת משימה" autocomplete="off">`
        : `<div class="tbody"><span class="ttext" role="button" tabindex="0" title="פתחי פתק">${esc(t.text)}</span>${t.note && t.note.trim() ? `<span class="hasnote" title="יש פתק">${I.note}</span>` : ""}${t.images?.length ? `<span class="hasimg" title="יש תמונות">${I.image}</span>` : ""}${pills(t)}</div>`}
      ${t.done ? "" : `<button class="move pinbtn" data-act="pin" aria-pressed="${!!t.pinned}" aria-label="${t.pinned ? "בטלי הצמדה" : "הצמידי למעלה"}" title="${t.pinned ? "בטלי הצמדה" : "הצמידי"}">${I.pin}</button>`}
      <button class="move" data-act="labels" aria-label="לייבלים" title="לייבל" aria-expanded="${labelingId === t.id}">${I.tag}</button>
      <button class="edit" data-act="edit" aria-label="עריכת הטקסט" title="עריכה">${I.edit}</button>
      </div>
      ${movingId === t.id ? `<div class="movebar"><span class="label">העבר ל־</span>${
        listsSorted().filter(x => x.id !== l.id).map(x => `<button class="chip hued" style="${hueStyle(x)}" data-moveto="${x.id}">${esc(x.name)}</button>`).join("")
      }<button class="chip" data-moveto="__new">+ רשימה חדשה</button></div>` : ""}
      ${labelingId === t.id ? `<div class="movebar">${
        labelsSorted().map(x => `<button class="lchip hued${(t.labels || []).includes(x.name) ? " on" : ""}" style="${labelStyle(x)}" data-labelto="${esc(x.name)}" aria-pressed="${(t.labels || []).includes(x.name)}">${esc(x.emoji || "")} ${esc(x.name)}</button>`).join("")
      }<form class="newlabel" data-newlabel><input class="em" name="em" placeholder="🙂" maxlength="4" aria-label="אימוג׳י"><input class="nm" name="nm" placeholder="לייבל חדש" maxlength="20" aria-label="שם הלייבל" autocomplete="off"><button type="submit">הוסף</button></form></div>` : ""}
    </li>`;
  const prevScroll = $("#layer .tasks")?.scrollTop || 0;
  const focusAdd = document.activeElement?.id === "addTask";
  const liveEdit = $("#editInput"); const editDraft = liveEdit ? { v: liveEdit.value, a: liveEdit.selectionStart, b: liveEdit.selectionEnd } : null;
  const nameDraft = document.activeElement?.id === "listName" ? $("#listName").value : null;
  rerendering = true;
  const owner = l.ownerId === me.id;
  $("#layer").innerHTML = `<div class="scrim" data-scrim>
    <div class="sheet hued" style="${hueStyle(l)}" role="dialog" aria-modal="true" aria-label="${esc(l.name)}">
      <div class="sh-top"><div class="sh-head">
        <input class="sh-title" id="listName" value="${esc(nameDraft ?? l.name)}" aria-label="שם הרשימה">
        <button class="x pinbtn" data-act="pinlist" aria-pressed="${!!l.pinned}" aria-label="${l.pinned ? "בטלי הצמדה" : "הצמידי למעלה"}" title="${l.pinned ? "בטלי הצמדה" : "הצמידי למעלה"}">${I.pin}</button>
        <button class="x" data-act="close" aria-label="סגור">${I.x}</button>
      </div>
      <div class="sh-sub" style="padding-bottom:0">${open.length} פתוחות · ${done.length} בוצעו</div>
      ${shareRow(l)}</div>
      <form class="sh-add" id="addForm"><input id="addTask" placeholder="הוסיפי משימה לרשימה" autocomplete="off"><button type="submit">הוסף</button></form>
      <ul class="tasks">
        ${open.map(row).join("")}
        ${done.length ? `<li><button class="divider toggle" data-act="showdone" aria-expanded="${!!showDone[l.id]}">בוצעו · ${done.length} ${I.chev}</button></li>` + (showDone[l.id] ? done.map(row).join("") : "") : ""}
        ${!open.length && !done.length ? `<li class="divider">הרשימה ריקה</li>` : ""}
      </ul>
      <div class="sh-foot">
        <button class="ghost" data-act="clear" ${done.length ? "" : "hidden"}>העבירי שבוצעו לסל</button>
        <button class="ghost danger${armedDelete ? " armed" : ""}" data-act="dellist">${armedDelete ? "לחצי שוב לאישור" : owner ? "מחיקת רשימה" : "יציאה מהרשימה"}</button>
      </div>
    </div></div>`;
  rerendering = false;
  $("#layer .tasks").scrollTop = prevScroll;
  if (focusAdd) $("#addTask").focus();
  if (nameDraft !== null){ const n = $("#listName"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
  const ei = $("#editInput");
  if (ei){
    if (editDraft){ ei.value = editDraft.v; ei.focus(); try{ ei.setSelectionRange(editDraft.a, editDraft.b); }catch(e){} }
    else if (editJustOpened){ ei.focus(); const n = ei.value.length; ei.setSelectionRange(n, n); revealSoon(ei); }
    editJustOpened = false;
    ei.addEventListener("keydown", e => {
      if (e.key === "Enter"){ e.preventDefault(); commitEdit(); }
      if (e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); editingId = null; renderSheet(); }
    });
    ei.addEventListener("blur", () => { if (!rerendering) commitEdit(); });
  }
  $("#addForm").onsubmit = ev => {
    ev.preventDefault(); const v = $("#addTask").value.trim(); if (!v) return;
    $("#addTask").value = "";
    const x = extractLabels(v);
    store.putTask({ id: newId(), text: x.text, labels: x.labels, listId: l.id, done: false, created: Date.now(), by: me.id });
    setTimeout(() => $("#addTask")?.focus(), 0);
  };
  const nm = $("#listName");
  nm.addEventListener("change", () => { const v = nm.value.trim(); const cur = state.lists[l.id]; if (v && cur && v !== cur.name) store.putList({ ...cur, name: v }); });
  nm.addEventListener("keydown", e => { if (e.key === "Enter") nm.blur(); });
}
$("#layer").addEventListener("click", e => {
  if (e.target.matches("[data-scrim]")){ closeLayer(); return; }
  const lt = e.target.closest("[data-labelto]");
  if (lt && openListId){
    const t = state.tasks[labelingId]; if (!t) return;
    const n = lt.dataset.labelto, cur = t.labels || [];
    store.putTask({ ...t, labels: cur.includes(n) ? cur.filter(x => x !== n) : [...cur, n] });
    return;
  }
  const mv = e.target.closest("[data-moveto]");
  if (mv && openListId){
    const t = state.tasks[movingId]; if (!t) return;
    const dest = mv.dataset.moveto;
    if (dest === "__new"){ movingId = null; enqueue([{ text: t.text, suggestId: null, suggestNew: "", moveId: t.id }]); return; }
    movingId = null; flashId = dest; store.putTask({ ...t, listId: dest });
    toast(`הועבר ל־${state.lists[dest]?.name || ""}`);
    return;
  }
  const a = e.target.closest("[data-act]"); if (!a) return;
  const act = a.dataset.act;
  if (act === "close") return closeLayer();
  if (openListId && !shareOpen){
    const li = a.closest(".task"); const t = li && state.tasks[li.dataset.id];
    if (act === "toggle" && t) store.putTask({ ...t, done: !t.done, doneAt: !t.done ? Date.now() : null });
    if (act === "del" && t) deleteTask(t, li);
    if (act === "edit" && t){ if (editingId === t.id) commitEdit(); else { editingId = t.id; editJustOpened = true; movingId = null; renderSheet(); } }
    if (act === "move" && t){ movingId = movingId === t.id ? null : t.id; labelingId = null; editingId = null; renderSheet(); }
    if (act === "pin" && t) store.putTask({ ...t, pinned: !t.pinned });
    if (act === "pinlist"){ const l = state.lists[openListId]; if (l){ store.putList({ ...l, pinned: !l.pinned }); toast(l.pinned ? "ההצמדה בוטלה" : "הרשימה מוצמדת למעלה"); } }
    if (act === "labels" && t){ labelingId = labelingId === t.id ? null : t.id; movingId = null; editingId = null; renderSheet(); }
    if (act === "share") openShare(openListId);
    if (act === "clear"){ const d = doneOf(openListId); const now = Date.now(); store.putTasks(d.map(x => ({ ...x, deletedAt: now }))); toast(`${d.length} משימות עברו לסל המחזור`); }
    if (act === "showdone"){ showDone[openListId] = !showDone[openListId]; try{ localStorage.setItem("gigit-showdone", JSON.stringify(showDone)); }catch(_){} renderSheet(); }
    if (act === "dellist"){
      if (armedDelete){ const id = openListId; const owner = state.lists[id]?.ownerId === me.id; closeLayer(); store.delList(id); toast(owner ? "הרשימה נמחקה" : "יצאת מהרשימה"); }
      else { armedDelete = true; renderSheet(); setTimeout(() => { if (armedDelete){ armedDelete = false; openListId && !noteId && renderSheet(); } }, 3500); }
    }
  }
});
document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  if ($(".lightbox")){ closeLightbox(); return; }
  if (!$("#layer").innerHTML) return;
  if (noteId) noteBack(); else if (shareOpen) closeShare(); else closeLayer();
});

/* =====================================================================
   sharing a list
   ===================================================================== */
let shareOpen = false, sharePeople = null, shareMsg = "", inviteUrl = "";
async function openShare(listId){
  shareOpen = true; openListId = listId; sharePeople = null; shareMsg = ""; inviteUrl = "";
  renderShare();
  const { data, error } = await sb.rpc("list_people", { l: listId });
  sharePeople = error ? [] : data; renderShare();
}
function closeShare(){ shareOpen = false; renderSheet(); }
function renderShare(){
  const l = state.lists[openListId]; if (!l){ shareOpen = false; closeLayer(); return; }
  const owner = l.ownerId === me.id;
  const draft = $("#shareEmail")?.value || "";
  $("#layer").innerHTML = `<div class="scrim" data-scrim><div class="sheet hued" style="${hueStyle(l)}" role="dialog" aria-modal="true" aria-label="שיתוף ${esc(l.name)}">
    <div class="note-top"><button class="x" data-share="back" aria-label="חזרה לרשימה">${I.back}</button><span class="crumb">שיתוף · ${esc(l.name)}</span><button class="x" data-act="close" aria-label="סגור">${I.x}</button></div>
    <div class="ch-body" style="padding-top:14px">
      <div class="set-sec">
        <h3>מי ברשימה</h3>
        <div>${sharePeople === null ? `<p class="label">טוען…</p>` : sharePeople.map(p => `<div class="prow"><span class="av">${esc(initial(p))}</span>
          <span class="who2">${esc(p.name || p.email)}${p.user_id === me.id ? " (את/ה)" : ""}<small>${esc(p.email || "")}</small></span>
          <span class="role">${p.role === "owner" ? "יצר/ה את הרשימה" : ""}</span>
          ${owner && p.user_id !== me.id ? `<button class="x" data-share="remove" data-uid="${p.user_id}" aria-label="הסרת ${esc(p.name || p.email)}">${I.x}</button>` : ""}</div>`).join("")}</div>
      </div>
      <div class="set-sec">
        <h3>הוספה לפי מייל</h3>
        <p>למי שכבר נכנס להגיגית לפחות פעם אחת.</p>
        <form class="newlist" id="shareForm"><input id="shareEmail" type="email" inputmode="email" placeholder="המייל שלה או שלו" value="${esc(draft)}" autocomplete="off"><button type="submit">הוספה</button></form>
        ${shareMsg ? `<p>${shareMsg}</p>` : ""}
      </div>
      <div class="set-sec">
        <h3>לינק הזמנה</h3>
        <p>שולחים את הלינק בוואטסאפ. מי שפותח אותו נכנס עם המייל שלו ומצטרף לרשימה הזו בלבד.</p>
        ${inviteUrl ? `<div class="codebox"><code>${esc(inviteUrl)}</code><button data-share="copy">העתקה</button></div>` : `<button class="softbtn" data-share="invite">יצירת לינק הזמנה</button>`}
      </div>
    </div></div></div>`;
}
$("#layer").addEventListener("submit", async e => {
  if (e.target.id !== "shareForm") return; e.preventDefault();
  const email = $("#shareEmail").value.trim(); if (!email) return;
  const { data, error } = await sb.rpc("add_member_by_email", { l: openListId, e: email });
  if (error){ shareMsg = "לא הצלחתי להוסיף. נסי שוב."; renderShare(); return; }
  if (data === "added"){ shareMsg = "נוסף/ה לרשימה ✓"; $("#shareEmail").value = ""; await loadAll(); const r = await sb.rpc("list_people", { l: openListId }); sharePeople = r.data || sharePeople; }
  else if (data === "already") shareMsg = "כבר ברשימה.";
  else shareMsg = "למייל הזה עוד אין חשבון בהגיגית. שלחי לינק הזמנה (למטה), או בקשי שייכנס פעם אחת ואז הוסיפי שוב.";
  renderShare();
});
$("#layer").addEventListener("click", async e => {
  const b = e.target.closest("[data-share]"); if (!b || !shareOpen) return;
  const k = b.dataset.share;
  if (k === "back") closeShare();
  if (k === "invite"){
    const token = Array.from(crypto.getRandomValues(new Uint8Array(12)), x => x.toString(16).padStart(2, "0")).join("");
    const { error } = await sb.from("invites").insert({ token, list_id: openListId, created_by: me.id });
    if (error){ shareMsg = "לא הצלחתי ליצור לינק. נסי שוב."; renderShare(); return; }
    inviteUrl = `${location.origin}/join/${token}`; renderShare();
    copyText(inviteUrl, "הלינק הועתק");
  }
  if (k === "copy") copyText(inviteUrl, "הלינק הועתק");
  if (k === "remove"){
    const { error } = await sb.rpc("remove_member", { l: openListId, u: b.dataset.uid });
    if (error){ shareMsg = "לא הצלחתי להסיר."; renderShare(); return; }
    sharePeople = (sharePeople || []).filter(p => p.user_id !== b.dataset.uid); await loadAll(); renderShare(); toast("הוסר/ה מהרשימה");
  }
});
async function copyText(text, done){
  try{ await navigator.clipboard.writeText(text); toast(done); }
  catch(_){ const c = $("#layer code"); if (c){ const r = document.createRange(); r.selectNodeContents(c); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } toast("סמנתי את הטקסט — העתיקי ידנית"); }
}

/* =====================================================================
   task note (text, links, lists, images)
   ===================================================================== */
let noteId = null, noteTimer = null, noteDirty = false;
function openNote(id){ noteId = id; movingId = labelingId = editingId = null; renderNote(true); }
function noteSavedLabel(t){
  if (!t.noteAt) return "הפתק נשמר אוטומטית";
  const d = new Date(t.noteAt), today = new Date().toDateString() === d.toDateString();
  return "נשמר " + (today ? d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("he-IL", { day: "numeric", month: "short" }));
}
function flushNote(){
  clearTimeout(noteTimer);
  if (!noteDirty || !noteId) return;
  const t = state.tasks[noteId]; const area = $("#noteArea"), title = $("#noteTitle");
  noteDirty = false; if (!t || !area) return;
  const text = (title?.value || "").replace(/\s+/g, " ").trim() || t.text;
  const n = { ...t, text, note: area.value, noteAt: Date.now() };
  state.tasks[t.id] = n;
  sb.from("tasks").update({ text: n.text, note: n.note, note_at: iso(n.noteAt) }).eq("id", t.id).then(({ error }) => { if (error) fail(error); });
  const f = $("#noteSaved"); if (f) f.textContent = noteSavedLabel(n);
}
function imagesHtml(t){
  return `${(t.images || []).map(p => `<button class="thumb" data-img="${esc(p)}" aria-label="הגדלת תמונה"><img alt="" data-src="${esc(p)}"></button>`).join("")}
    <button class="thumb add" data-note="addimg" aria-label="הוספת תמונה">${I.plus}<span>תמונה</span></button>`;
}
function renderNote(first){
  const t = state.tasks[noteId], l = state.lists[openListId];
  if (!t || !l){ noteId = null; if (l) renderSheet(); else closeLayer(); return; }
  const live = $("#noteArea");
  if (live && live.dataset.id === t.id){
    // keep the live editor; only refresh what doesn't take typing
    const box = $("#layer .note"); box.classList.toggle("task-done", !!t.done);
    $("#notePills").innerHTML = pills(t);
    const imgs = $("#noteImgs"); if (imgs && imgs.dataset.sig !== (t.images || []).join("|")){ imgs.dataset.sig = (t.images || []).join("|"); imgs.innerHTML = imagesHtml(t); loadThumbs(); }
    if (!noteDirty && document.activeElement !== live && live.value !== (t.note || "")){ live.value = t.note || ""; showNoteView(); }
    return;
  }
  $("#layer").innerHTML = `<div class="scrim" data-scrim>
    <div class="sheet hued note${t.done ? " task-done" : ""}" style="${hueStyle(l)}" role="dialog" aria-modal="true" aria-label="פתק: ${esc(t.text)}">
      <div class="note-top">
        <button class="x" data-note="back" aria-label="חזרה לרשימה">${I.back}</button>
        <span class="crumb">${esc(l.name)}</span>
        <button class="x" data-act="close" aria-label="סגור">${I.x}</button>
      </div>
      <div class="note-body">
        <div class="note-title task${t.done ? " done" : ""}" data-id="${t.id}">
          <button class="check" data-note="toggle" aria-label="${t.done ? "סמני כפתוחה" : "סמני כבוצעה"}" aria-pressed="${!!t.done}" style="margin-top:3px">${I.check}</button>
          <textarea id="noteTitle" rows="1" aria-label="כותרת המשימה">${esc(t.text)}</textarea>
        </div>
        <div class="note-pills" id="notePills">${pills(t)}</div>
        <div class="imgs" id="noteImgs" data-sig="${esc((t.images || []).join("|"))}">${imagesHtml(t)}</div>
        <textarea class="note-area" id="noteArea" data-id="${t.id}" placeholder="הערות, קישורים, מחשבות, מה בדקת ומה עוד פתוח…">${esc(t.note || "")}</textarea>
        <div class="note-view" id="noteView" tabindex="0" role="button" aria-label="לחצי לעריכת הפתק" hidden></div>
      </div>
      <div class="note-foot">
        <span id="noteSaved">${noteSavedLabel(t)}${isShared(l) && t.by && t.by !== me.id ? ` · נוסף ע״י ${esc(personName(t.by))}` : ""}</span>
        <button class="ghost stamp" data-note="stamp" title="הוספת התאריך של היום" aria-label="הוספת התאריך של היום">${I.cal} היום</button>
      </div>
    </div></div>`;
  const area = $("#noteArea"), title = $("#noteTitle");
  const fit = () => { title.style.height = "auto"; title.style.height = title.scrollHeight + "px"; };
  fit();
  const dirty = () => { noteDirty = true; $("#noteSaved").textContent = "שומר…"; clearTimeout(noteTimer); noteTimer = setTimeout(flushNote, 800); };
  area.addEventListener("input", dirty);
  title.addEventListener("input", () => { fit(); dirty(); });
  title.addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); area.focus(); } });
  area.addEventListener("blur", () => { flushNote(); showNoteView(); });
  area.addEventListener("keydown", continueList);
  const view = $("#noteView");
  view.addEventListener("click", e => { if (e.target.closest("a")) return; editNote(); });
  view.addEventListener("keydown", e => { if (e.key === "Enter" && !e.target.closest("a")){ e.preventDefault(); editNote(); } });
  loadThumbs();
  if (first && !(t.note || "").trim() && !(t.images || []).length){
    area.focus({ preventScroll: true });
    const top = () => { const b = $("#layer .note-body"); if (b) b.scrollTop = 0; };
    setTimeout(top, 50); setTimeout(top, 400);
  } else showNoteView();
}
function noteBack(){ flushNote(); noteId = null; renderSheet(); }
// the note reads as text with live links; tapping anywhere else in it switches to editing
function linkify(text){
  return esc(text).replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/g, m => {
    const trail = (m.match(/[.,;:!?)\]]+$/) || [""])[0]; const url = trail ? m.slice(0, -trail.length) : m;
    const href = url.startsWith("www.") ? "https://" + url : url;
    return `<a href="${href.replace(/&amp;/g, "&").replace(/"/g, "%22")}" target="_blank" rel="noopener noreferrer">${url}</a>${trail}`;
  });
}
// the note as it reads: real lists, check marks, date dividers, short link names — typing stays plain text
function shortLink(url){
  try{ const u = new URL(url.startsWith("www.") ? "https://" + url : url); const host = u.hostname.replace(/^www\./, "");
    let tail = ""; try{ tail = decodeURIComponent(u.pathname).split("/").filter(Boolean).pop() || ""; }catch(_){}
    tail = tail.replace(/[-_]+/g, " ").replace(/\.\w{2,5}$/, "").trim();
    return host + (tail && !/^[\d\s]+$/.test(tail) ? " · " + (tail.length > 28 ? tail.slice(0, 28) + "…" : tail) : "");
  }catch(_){ return url; }
}
function inlineNote(text){
  return esc(text).replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/g, m => {
    const trail = (m.match(/[.,;:!?)\]]+$/) || [""])[0]; const url = trail ? m.slice(0, -trail.length) : m;
    const raw = url.replace(/&amp;/g, "&"), href = raw.startsWith("www.") ? "https://" + raw : raw;
    return `<a class="nlink" href="${href.replace(/"/g, "%22")}" target="_blank" rel="noopener noreferrer">${esc(shortLink(raw))}</a>${trail}`;
  }).replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
}
function noteHtml(text){
  return text.split("\n").map(line => {
    let m;
    if (!line.trim()) return `<div class="nl gap"></div>`;
    if ((m = line.match(/^\s*[—–-]{1,3}\s*(.+?)\s*[—–-]{1,3}\s*$/))) return `<div class="nl ndate"><span>${esc(m[1])}</span></div>`;
    if ((m = line.match(/^\s*#{1,3}\s+(.*)$/))) return `<div class="nl nhead">${inlineNote(m[1])}</div>`;
    if ((m = line.match(/^\s*(?:[-•*]\s*)?\[( |x|X|v|V|✓)?\]\s*(.*)$/))) return `<div class="nl nitem ncheck${m[1] && m[1] !== " " ? " on" : ""}"><i></i><span>${inlineNote(m[2])}</span></div>`;
    if ((m = line.match(/^\s*(\d{1,3})[.)]\s+(.*)$/))) return `<div class="nl nitem nnum"><i>${m[1]}</i><span>${inlineNote(m[2])}</span></div>`;
    if ((m = line.match(/^\s*[-•*]\s+(.*)$/))) return `<div class="nl nitem nbul"><i></i><span>${inlineNote(m[1])}</span></div>`;
    return `<div class="nl">${inlineNote(line)}</div>`;
  }).join("");
}
// "1. " + Enter continues with "2. "; "- " or "• " continues the bullet; Enter on an empty item ends the list
function continueList(e){
  if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
  const a = e.target, pos = a.selectionStart; if (pos !== a.selectionEnd) return;
  const lineStart = a.value.lastIndexOf("\n", pos - 1) + 1;
  const line = a.value.slice(lineStart, pos);
  const num = line.match(/^(\s*)(\d{1,3})([.)])\s+(.*)$/), bul = line.match(/^(\s*)([-•*])\s+(.*)$/);
  if (!num && !bul) return;
  e.preventDefault();
  const content = num ? num[4] : bul[3];
  if (!content.trim()) a.setRangeText("", lineStart, pos, "end");
  else a.setRangeText("\n" + (num ? `${num[1]}${Number(num[2]) + 1}${num[3]} ` : `${bul[1]}${bul[2]} `), pos, pos, "end");
  a.dispatchEvent(new Event("input"));
}
function showNoteView(){
  const a = $("#noteArea"), v = $("#noteView"); if (!a || !v) return;
  if (!a.value.trim()){ v.hidden = true; a.hidden = false; return; }
  v.innerHTML = noteHtml(a.value); v.hidden = false; a.hidden = true;
}
function editNote(){
  const a = $("#noteArea"), v = $("#noteView"); if (!a) return;
  if (v) v.hidden = true; a.hidden = false; a.focus(); a.setSelectionRange(a.value.length, a.value.length);
}
$("#layer").addEventListener("click", e => {
  const tx = e.target.closest(".ttext");
  if (tx && openListId && !noteId && !shareOpen){ openNote(tx.closest(".task").dataset.id); return; }
  const im = e.target.closest("[data-img]"); if (im && noteId){ openLightbox(im.dataset.img); return; }
  const b = e.target.closest("[data-note]"); if (!b || !noteId) return;
  const t = state.tasks[noteId];
  if (b.dataset.note === "back") noteBack();
  if (b.dataset.note === "toggle" && t){ flushNote(); const n = state.tasks[noteId]; store.putTask({ ...n, done: !n.done, doneAt: !n.done ? Date.now() : null });
    const c = $("#layer .note-title"); c.classList.toggle("done", !n.done); $("#layer .note").classList.toggle("task-done", !n.done); }
  if (b.dataset.note === "addimg") $("#imgPick").click();
  if (b.dataset.note === "stamp"){
    editNote(); const a = $("#noteArea"); const d = new Date().toLocaleDateString("he-IL", { day: "numeric", month: "numeric", year: "2-digit" });
    const pre = a.value && !a.value.endsWith("\n") ? "\n\n" : (a.value ? "\n" : "");
    a.value += `${pre}— ${d} —\n`; a.focus(); a.setSelectionRange(a.value.length, a.value.length); a.scrollTop = a.scrollHeight;
    a.dispatchEvent(new Event("input"));
  }
});
$("#layer").addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches(".ttext")){ e.preventDefault(); openNote(e.target.closest(".task").dataset.id); }
});

/* ---------- images ---------- */
// Links to private images are kept for days (and remembered on the phone), so the same address is reused
// and the phone shows the picture from its own cache instead of downloading it again.
const URL_TTL = 7 * 24 * 3600, URL_KEEP = 6 * 24 * 3600e3, URL_LS = "gigit-img-urls";
const urlCache = new Map();   // storage path -> { url, until } ; "" url = known missing (old image without a thumbnail)
const localPreview = new Map();   // storage path -> blob: address of a picture just picked on this phone
try{ for (const [k, v] of Object.entries(JSON.parse(localStorage.getItem(URL_LS) || "{}"))) if (v.until > Date.now()) urlCache.set(k, v); }catch(_){}
function saveUrlCache(){ try{ localStorage.setItem(URL_LS, JSON.stringify(Object.fromEntries([...urlCache].filter(([, v]) => v.until > Date.now()).slice(-300)))); }catch(_){} }
const thumbPath = p => p.replace(/\.jpg$/, ".t.jpg");
async function signed(paths){
  const need = paths.filter(p => !localPreview.has(p) && !(urlCache.get(p)?.until > Date.now()));
  if (need.length){
    const { data } = await sb.storage.from("images").createSignedUrls(need, URL_TTL);
    (data || []).forEach((d, i) => { const path = d.path || need[i]; urlCache.set(path, { url: d.signedUrl || "", until: Date.now() + (d.signedUrl ? URL_KEEP : 3600e3) }); });
    saveUrlCache();
  }
  return Object.fromEntries(paths.map(p => [p, localPreview.get(p) || urlCache.get(p)?.url || ""]));
}
// thumbnails first (small files); a picture saved before thumbnails existed falls back to the full image
async function loadThumbs(){
  const imgs = [...document.querySelectorAll("#noteImgs img[data-src]")]; if (!imgs.length) return;
  const show = (i, url) => { if (url && i.getAttribute("src") !== url) i.src = url; };
  // anything already known (just picked, or a remembered link) shows at once, before asking the server
  imgs.forEach(i => { const p = i.dataset.src; show(i, localPreview.get(p) || urlCache.get(thumbPath(p))?.url || ""); });
  const full = imgs.map(i => i.dataset.src);
  const urls = await signed(full.map(thumbPath));
  const missing = full.filter(p => !urls[thumbPath(p)] && !localPreview.has(p));
  const fullUrls = missing.length ? await signed(missing) : {};
  imgs.forEach(i => { const p = i.dataset.src;
    i.onerror = async () => { i.onerror = null; const u = await signed([p]); show(i, u[p]); };
    show(i, localPreview.get(p) || urls[thumbPath(p)] || fullUrls[p]); });
}
// shrink phone photos before upload (JPEG): the full picture and a small thumbnail
async function shrink(file, maxSide = 1280, quality = 0.8){
  const draw = (src, w, h) => { const k = Math.min(1, maxSide / Math.max(w, h));
    const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
    return new Promise(res => c.toBlob(b => res(b), "image/jpeg", quality)); };
  try{
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    return (await draw(bmp, bmp.width, bmp.height)) || file;
  }catch(_){
    // some phones can't decode the photo this way (e.g. HEIC): go through an <img>
    try{
      const url = URL.createObjectURL(file);
      const im = await new Promise((res, rej) => { const x = new Image(); x.onload = () => res(x); x.onerror = rej; x.src = url; });
      const b = await draw(im, im.naturalWidth, im.naturalHeight); URL.revokeObjectURL(url);
      return b || file;
    }catch(__){ return file; }
  }
}
$("#imgPick").addEventListener("change", async e => {
  const file = e.target.files?.[0]; e.target.value = ""; if (!file || !noteId) return;
  const taskId = noteId;
  const add = $("#layer .thumb.add"); add?.classList.add("busy");
  const [blob, small] = await Promise.all([shrink(file), shrink(file, 360, 0.72)]);
  const path = `${taskId}/${newId()}.jpg`;
  // show it right away from the phone, and upload in the background
  localPreview.set(path, URL.createObjectURL(small || blob));
  const before = state.tasks[taskId]; if (!before){ add?.classList.remove("busy"); return; }
  state.tasks[taskId] = { ...before, images: [...(before.images || []), path] };
  add?.classList.remove("busy"); renderNote();
  const pending = () => document.querySelector(`#noteImgs [data-img="${path}"]`);
  pending()?.classList.add("busy");
  const up = (p, b) => sb.storage.from("images").upload(p, b, { contentType: "image/jpeg", upsert: false });
  const [{ error }] = await Promise.all([up(path, blob), small ? up(thumbPath(path), small) : Promise.resolve({})]);
  if (error){
    const t = state.tasks[taskId]; if (t) state.tasks[taskId] = { ...t, images: (t.images || []).filter(x => x !== path) };
    localPreview.delete(path); renderNote(); toast("העלאת התמונה נכשלה. נסי שוב."); console.error(error); return;
  }
  const t = state.tasks[taskId]; if (!t) return;
  const { error: e2 } = await sb.from("tasks").update({ images: t.images }).eq("id", taskId);
  pending()?.classList.remove("busy");
  if (e2) return fail(e2);
});
async function openLightbox(path){
  const urls = await signed([path]);
  const box = document.createElement("div"); box.className = "lightbox"; box.dir = "rtl";
  box.innerHTML = `<img src="${esc(urls[path] || "")}" alt="תמונה מהפתק"><div class="bar2"><button data-lb="close">סגירה</button><button class="danger" data-lb="del">מחיקת התמונה</button></div>`;
  box.addEventListener("click", async e => {
    const k = e.target.closest("[data-lb]")?.dataset.lb;
    if (!k && e.target !== box) return;
    if (k === "del"){
      const t = state.tasks[noteId]; if (!t) return closeLightbox();
      const n = { ...t, images: (t.images || []).filter(p => p !== path) }; state.tasks[t.id] = n;
      await sb.from("tasks").update({ images: n.images }).eq("id", t.id);
      sb.storage.from("images").remove([path, thumbPath(path)]);
      closeLightbox(); renderNote(); toast("התמונה נמחקה");
      return;
    }
    closeLightbox();
  });
  document.body.appendChild(box);
}
function closeLightbox(){ document.querySelectorAll(".lightbox").forEach(b => b.remove()); }

/* =====================================================================
   new list
   ===================================================================== */
function openNewList(){
  resetLayerState();
  $("#layer").innerHTML = `<div class="scrim" data-scrim><div class="sheet" role="dialog" aria-modal="true" aria-label="רשימה חדשה">
    <div class="sh-head"><div class="sh-title">רשימה חדשה</div><button class="x" data-act="close" aria-label="סגור">${I.x}</button></div>
    <div class="ch-body"><form class="newlist" id="nlForm"><input id="nlName" placeholder="שם הרשימה" autocomplete="off"><button type="submit">צור</button></form>
      <p class="label" style="margin-top:12px">אפשר לשתף אותה אחר כך מתוך הרשימה.</p></div>
  </div></div>`;
  $("#nlName").focus();
  $("#nlForm").onsubmit = ev => { ev.preventDefault(); const v = $("#nlName").value.trim(); if (!v) return;
    const l = newList(v); store.putList(l); $("#layer").innerHTML = ""; flashId = l.id; render(); };
}

/* =====================================================================
   composer + sorting
   ===================================================================== */
const input = $("#input"), send = $("#send");
function grow(){ input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 160) + "px"; send.disabled = !input.value.trim(); }
input.addEventListener("input", grow);
input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing){ e.preventDefault(); submit(); } });
send.addEventListener("click", submit);

/* record a task by voice (where the browser can turn speech into text); opening /?rec=1 starts listening right away */
const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
const mic = $("#mic");
let rec = null;
function stopRec(){ try{ rec?.stop(); }catch(_){} }
function startRec(){
  if (!Speech || rec) return;
  const r = new Speech(); rec = r;
  r.lang = "he-IL"; r.interimResults = true; r.continuous = false;
  const before = input.value.trim(); let heard = "", failed = "";
  r.onstart = () => { mic.classList.add("on"); mic.setAttribute("aria-pressed", "true"); setStatus("מקשיבה… דברי, ואני אעצור כשתסיימי"); };
  r.onresult = e => { heard = [...e.results].map(x => x[0].transcript).join(" ").trim(); input.value = (before ? before + "\n" : "") + heard; grow(); };
  r.onerror = e => { failed = e.error; };
  r.onend = () => {
    rec = null; mic.classList.remove("on"); mic.setAttribute("aria-pressed", "false"); setStatus("");
    if (failed === "not-allowed" || failed === "service-not-allowed") toast("אין הרשאה למיקרופון. צריך לאשר אותה בהגדרות הדפדפן.");
    else if (heard) submit();
    else if (failed !== "aborted") toast("לא שמעתי כלום. נסי שוב.");
  };
  try{ r.start(); }catch(_){ rec = null; }
}
if (Speech && mic){ mic.hidden = false; mic.addEventListener("click", () => rec ? stopRec() : startRec()); }

const findListByName = n => findListByNameIn(n, listsSorted());
const sortContext = () => listsSorted().map(l => ({ id: l.id, name: l.name, examples: tasksOf(l.id).sort((a, b) => (b.created || 0) - (a.created || 0)).slice(0, 12).map(t => t.text) }));
let chooser = null;   // { queue: [{ text, labels, suggestId, suggestNew, moveId? }] }

async function submit(){
  const lines = input.value.split("\n").map(s => s.trim()).filter(Boolean);
  if (!lines.length) return;
  input.value = ""; grow();
  const lists = listsSorted(), ctx = sortContext();
  const pending = [];
  for (const line of lines){
    const d = directMatch(line, lists);
    if (d){ const x = extractLabels(d.text); addTo(d.list.id, x.text, false, x.labels); continue; }
    const x = extractLabels(line);
    // free guess from words already in each list
    const g = guessList(x.text, ctx);
    if (g.listId && g.confidence >= LOCAL_SURE){ addTo(g.listId, x.text, true, x.labels); continue; }
    pending.push({ ...x, guess: g.listId });
  }
  if (!pending.length) return;
  if (!cfg.smartSort || !lists.length){ enqueue(pending.map(p => ({ text: p.text, labels: p.labels, suggestId: p.guess, suggestNew: "" }))); return; }
  setStatus("ממיין…"); send.disabled = true;
  try{
    const { data: s } = await sb.auth.getSession();
    const r = await fetch("/api/sort", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${s.session?.access_token}` },
      body: JSON.stringify({ lists: ctx, items: pending.map(p => p.text) }) });
    const res = r.ok ? await r.json() : null;
    setStatus("");
    const ask = [];
    pending.forEach((p, i) => {
      const hit = res?.results?.find(x => Number(x?.i) === i);
      const lid = hit && state.lists[hit.listId] ? hit.listId : null;
      const clean = hit && typeof hit.text === "string" ? hit.text.trim() : "";
      if (clean && clean.length < p.text.length && p.text.includes(clean)) p.text = clean;
      if (lid && Number(hit.confidence) >= CLAUDE_SURE) addTo(lid, p.text, true, p.labels);
      else ask.push({ text: p.text, labels: p.labels, suggestId: lid || p.guess, suggestNew: hit?.newList ? String(hit.newList).slice(0, 30) : "" });
    });
    enqueue(ask);
  }catch(e){
    setStatus("");
    enqueue(pending.map(p => ({ text: p.text, labels: p.labels, suggestId: p.guess, suggestNew: "" })));
  }
  grow();
}

function addTo(listId, text, auto, labels){
  const t = { id: newId(), text, listId, done: false, created: Date.now(), labels: labels || [], by: me.id };
  flashId = listId; store.putTask(t);
  toast(`נוסף ל־${state.lists[listId]?.name || ""}`, auto ? t : null);
}

/* chooser: "to which list?" */
function enqueue(items){
  if (!items.length) return;
  if (chooser){ chooser.queue.push(...items); renderChooser(); return; }
  chooser = { queue: items }; renderChooser();
}
function nextChoice(skipAll){
  if (!chooser) return;
  if (skipAll){ const rest = chooser.queue.filter(q => !q.moveId).map(q => q.text).join("\n"); chooser = null; $("#layer").innerHTML = "";
    if (rest){ input.value = rest; grow(); setStatus("השארתי את מה שלא מוין בתיבה.", 4000); } return; }
  chooser.queue.shift();
  if (!chooser.queue.length){ chooser = null; $("#layer").innerHTML = ""; return; }
  renderChooser();
}
function renderChooser(){
  resetLayerState();
  const c = chooser.queue[0], lists = listsSorted();
  const chips = lists.map(l => `<button class="chip hued${l.id === c.suggestId ? " sug" : ""}" style="${hueStyle(l)}" data-pick="${l.id}">${esc(l.name)}</button>`).join("");
  $("#layer").innerHTML = `<div class="scrim" data-chscrim><div class="sheet" role="dialog" aria-modal="true" aria-label="לאיזו רשימה?">
    <div class="sh-head"><div class="sh-title">${c.moveId ? "לאיזו רשימה להעביר?" : "לאיזו רשימה?"}</div>
      ${chooser.queue.length > 1 ? `<span class="queue">עוד ${chooser.queue.length - 1}</span>` : ""}
      <button class="x" data-chclose aria-label="סגור">${I.x}</button></div>
    <div class="ch-body">
      <textarea class="quote chtext" id="chText" rows="1" aria-label="טקסט המשימה">${esc(c.text)}</textarea>
      <div class="chips chlabels">${labelsSorted().map(x => `<button type="button" class="lchip hued${(c.labels || []).includes(x.name) ? " on" : ""}" style="${labelStyle(x)}" data-chlabel="${esc(x.name)}" aria-pressed="${(c.labels || []).includes(x.name)}">${esc(x.emoji || "")} ${esc(x.name)}</button>`).join("")}</div>
      ${lists.length ? `<p class="label">רשימה קיימת</p><div class="chips">${chips}</div>` : ""}
      <p class="label">או רשימה חדשה</p>
      <form class="newlist" id="chNew"><input id="chNewName" value="${esc(c.suggestNew)}" placeholder="שם הרשימה" autocomplete="off"><button type="submit">צור והוסף</button></form>
      <button class="ghost danger" data-chdrop style="align-self:flex-start;margin-top:14px">${c.moveId ? "לא צריך — לסל המחזור" : "לא להוסיף את המשימה"}</button>
    </div></div></div>`;
  const tx = $("#chText"), fit = () => { tx.style.height = "auto"; tx.style.height = tx.scrollHeight + "px"; };
  fit(); tx.addEventListener("input", () => { c.text = tx.value; fit(); });
  tx.addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); tx.blur(); } });
  if (!lists.length) $("#chNewName").focus();
}
// what the chooser's text box holds now (falls back to the original if it was emptied)
function chosenText(c){ const v = ($("#chText")?.value ?? c.text).replace(/\s+/g, " ").trim(); return v || c.text; }
$("#layer").addEventListener("click", e => {
  if (!chooser) return;
  if (e.target.matches("[data-chscrim]") || e.target.closest("[data-chclose]")) return nextChoice(true);
  if (e.target.closest("[data-chdrop]")){
    // added by mistake or no longer needed: a typed line is simply dropped, a recorded one goes to the bin
    const c = chooser.queue[0];
    if (c.moveId){ const t = state.tasks[c.moveId]; if (t){ store.putTask({ ...t, deletedAt: Date.now() }); toast("הועבר לסל המחזור", { undo: { ...t, deletedAt: null } }); } }
    else toast("המשימה לא נוספה");
    return nextChoice();
  }
  const lb = e.target.closest("[data-chlabel]");
  if (lb){ const c = chooser.queue[0], n = lb.dataset.chlabel, has = (c.labels || []).includes(n);
    c.labels = has ? c.labels.filter(x => x !== n) : [...(c.labels || []), n];
    lb.classList.toggle("on", !has); lb.setAttribute("aria-pressed", String(!has)); return; }
  const p = e.target.closest("[data-pick]");
  if (p){ const c = chooser.queue[0], text = chosenText(c);
    if (c.moveId){ const t = state.tasks[c.moveId]; if (t) store.putTask({ ...t, text, labels: c.labels || [], listId: p.dataset.pick, deletedAt: null }); flashId = p.dataset.pick; toast(`הועבר ל־${state.lists[p.dataset.pick].name}`); }
    else addTo(p.dataset.pick, text, false, c.labels);
    nextChoice(); }
});
$("#layer").addEventListener("submit", e => {
  if (e.target.id !== "chNew") return; e.preventDefault();
  const v = $("#chNewName").value.trim(); if (!v) return;
  const c = chooser.queue[0], text = chosenText(c);
  const existing = findListByName(v);
  const l = existing || newList(v);
  const go = () => {
    if (c.moveId){ const t = state.tasks[c.moveId]; if (t) store.putTask({ ...t, text, labels: c.labels || [], listId: l.id, deletedAt: null }); flashId = l.id; toast(`הועבר ל־${l.name}`); }
    else addTo(l.id, text, false, c.labels);
    nextChoice();
  };
  if (existing) go(); else store.putList(l).then(go);
});

/* =====================================================================
   settings: name, iPhone shortcut, import, sign out
   ===================================================================== */
let settingsOpen = false;
// "add to the home screen": shown first while the page runs in a browser tab, lower down once it is installed
function isInstalled(){ return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; }
function installSec(top){
  if (top === isInstalled()) return "";
  return `<div class="set-sec">
        <h3>להפוך את הגיגית לאפליקציה</h3>
        <p>${isInstalled() ? "הגיגית כבר מותקנת כאן. כך מתקינים אותה בטלפון נוסף:" : "כך הגיגית מקבלת אייקון במסך הבית, נפתחת במסך מלא בלי שורת הכתובת, וזוכרת את הכניסה שלך."}</p>
        <details${isInstalled() ? "" : " open"}><summary>באייפון</summary>
          <ol>
            <li>פותחים את <b>hagigit.vercel.app</b> בדפדפן <b>Safari</b> (לא מתוך וואטסאפ או אפליקציה אחרת).</li>
            <li>לוחצים על כפתור <b>השיתוף</b> — הריבוע עם החץ למעלה, בתחתית המסך.</li>
            <li>גוללים ובוחרים <b>Add to Home Screen</b> (הוספה למסך הבית).</li>
            <li>לוחצים <b>Add</b> (הוספה). האייקון של הגיגית מופיע במסך הבית.</li>
            <li>פותחים מהאייקון ונכנסים פעם אחת עם המייל והסיסמה.</li>
          </ol>
        </details>
        <details><summary>באנדרואיד</summary>
          <ol>
            <li>פותחים את <b>hagigit.vercel.app</b> בדפדפן <b>Chrome</b>.</li>
            <li>לוחצים על שלוש הנקודות <b>⋮</b> למעלה.</li>
            <li>בוחרים <b>Add to Home screen</b> או <b>Install app</b> (הוספה למסך הבית / התקנת האפליקציה).</li>
            <li>מאשרים. האייקון מופיע במסך הבית, ופותחים ממנו.</li>
          </ol>
        </details>
        <p>עדכונים מגיעים לבד: סוגרים את הגיגית עד הסוף ופותחים שוב. אין צורך להתקין מחדש.</p>
      </div>`;
}
// iCloud link of the ready-made shortcut (asks for the personal address on install). Empty = show manual steps only.
const SHORTCUT_LINK = "https://www.icloud.com/shortcuts/7e848a49d8d34e1594f0841e61de6b1a";
function captureUrl(){ return captureToken ? `${location.origin}/api/capture?t=${captureToken}` : ""; }
function openSettings(welcome){
  resetLayerState(); settingsOpen = true;
  const name = myProfile?.name || "";
  $("#layer").innerHTML = `<div class="scrim" data-scrim><div class="sheet" role="dialog" aria-modal="true" aria-label="הגדרות">
    <div class="sh-head"><div class="sh-title">${welcome ? "ברוכה הבאה להגיגית" : "הגדרות"}</div><button class="x" data-act="close" aria-label="סגור">${I.x}</button></div>
    <div class="ch-body">
      ${installSec(true)}
      <div class="set-sec">
        <h3>השם שלך</h3>
        <p>כך תופיעי אצל מי שמשתפים איתו רשימות.</p>
        <form class="newlist" id="nameForm"><input id="myName" value="${esc(name)}" maxlength="30" placeholder="למשל: גיל" autocomplete="name"><button type="submit">שמירה</button></form>
        <p style="font-size:12.5px">${esc(me.email || "")}</p>
        <p style="font-size:12.5px">מיון חכם עם Claude: ${cfg?.smartSort ? "פעיל ✓" : "כבוי"}</p>
      </div>
      ${installSec(false)}
      <div class="set-sec">
        <h3>הקלטה מכפתור הפעולה באייפון</h3>
        <p>הקיצור שולח את מה שאמרת ישר להגיגית, בלי לפתוח אותה. בסוף תקבלי הודעה לאן זה נכנס.</p>
        ${captureToken ? `<div class="codebox"><code>${esc(captureUrl())}</code><button data-set="copyurl">העתקה</button></div>` : `<p>הכתובת האישית עוד לא מוכנה. רענני את האפליקציה.</p>`}
        ${captureToken && SHORTCUT_LINK ? `<button class="softbtn" data-set="getshortcut">התקנת הקיצור</button>
        <p>הכפתור מעתיק את הכתובת האישית ופותח את הקיצור המוכן. כשהוא שואל על הכתובת — מדביקים.</p>` : ""}
        <details open><summary>איך מחברים את הקיצור לכפתור הפעולה (Action Button)</summary>
          <ol>
            <li>פותחים באייפון את <b>Settings</b> (הגדרות) ← <b>Action Button</b>.</li>
            <li>מחליקים הצידה בין האפשרויות עד שמגיעים ל-<b>Shortcut</b> (קיצור).</li>
            <li>לוחצים על <b>Choose a Shortcut…</b> ובוחרים את <b>הגיגית</b>.</li>
            <li>מעכשיו: לחיצה ארוכה על הכפתור שבצד שמאל של הטלפון, מעל כפתורי הווליום — מתחילה הקלטה. אומרים את המשימה, והיא נכנסת לבד.</li>
          </ol>
          <p>כפתור הפעולה קיים באייפון 15 Pro ומעלה ובכל דגמי אייפון 16 ומעלה.</p>
          <p><b>אין כפתור פעולה?</b> אותו קיצור עובד גם כך:</p>
          <ol>
            <li><b>הקשה על גב הטלפון:</b> Settings ← Accessibility ← Touch ← Back Tap ← Double Tap ← הגיגית.</li>
            <li><b>מסך הנעילה:</b> לחיצה ארוכה על מסך הנעילה ← Customize ← מחליפים את כפתור הפנס או המצלמה ב-Shortcut ← הגיגית.</li>
            <li><b>Siri:</b> אומרים "היי סירי, הגיגית".</li>
            <li><b>מרכז הבקרה:</b> מוסיפים שם את הקיצור ככפתור.</li>
          </ol>
        </details>
        ${captureToken && SHORTCUT_LINK ? `<details><summary>או לבנות את הקיצור לבד</summary>` : ""}
        <ol>
          <li>באפליקציית <b>Shortcuts</b> יוצרים קיצור חדש.</li>
          <li><b>Dictate Text</b> — שפה: עברית.</li>
          <li><b>Get Contents of URL</b> — מדביקים את הכתובת שלמעלה. לוחצים ▸: Method = <b>POST</b>, Request Body = <b>JSON</b>, מוסיפים שדה Text בשם <b>text</b> ובוחרים בו את <b>Dictated Text</b>.</li>
          <li><b>Show Notification</b> — עם <b>Contents of URL</b>.</li>
          <li>נותנים לקיצור את השם <b>הגיגית</b>, ומחברים אותו לכפתור הפעולה לפי ההסבר שלמעלה.</li>
        </ol>
        ${captureToken && SHORTCUT_LINK ? `</details>` : ""}
        <details><summary>באנדרואיד</summary>
          <p><b>הכי פשוט — הקלטה מתוך הגיגית:</b> לחיצה ארוכה על האייקון של הגיגית במסך הבית ← <b>הקלטת משימה</b>. אפשר לגרור את השורה הזו למסך הבית, והיא הופכת לאייקון שפותח את הגיגית ומתחיל להקשיב. בתוך האפליקציה זה כפתור המיקרופון ליד שורת הכתיבה.</p>
          <p><b>בלי לפתוח את הגיגית</b> — עם האפליקציה החינמית <b>HTTP Shortcuts</b> (מ-Google Play):</p>
          <ol>
            <li>יוצרים בה משתנה (Variables) מסוג <b>Text Input</b>, בשם <b>task</b>.</li>
            <li>יוצרים קיצור חדש (Regular HTTP Shortcut): Method = <b>POST</b>, ב-URL מדביקים את הכתובת האישית שלמעלה.</li>
            <li>ב-Request Body בוחרים <b>Custom Text</b>, Content-Type = <b>text/plain</b>, ובתוכן מכניסים את המשתנה <b>task</b> (הכפתור <b>{}</b>).</li>
            <li>ב-Response בוחרים להציג את התשובה כהודעה קצרה (Toast).</li>
            <li>לחיצה ארוכה על הקיצור ← <b>Place on home screen</b>. בלחיצה על האייקון נפתחת תיבה: לוחצים על המיקרופון במקלדת, אומרים את המשימה, ושולחים.</li>
          </ol>
        </details>
        <p>הכתובת הזו אישית: מי שמחזיק בה יכול להוסיף לך משימות. לא משתפים אותה.</p>
      </div>
      <div class="set-sec">
        <h3>ייבוא מהגיגית הקודמת</h3>
        <p>בוחרים את קובץ ה-JSON שקיבלת מ-Claude, והרשימות והמשימות נוספות לחשבון שלך. אפשר לייבא שוב קובץ חדש יותר: רשימה עם אותו שם מתעדכנת, ומשימה שכבר קיימת לא תיכנס פעמיים.</p>
        <button class="softbtn" data-set="import" id="importBtn">בחירת קובץ</button>
        <div id="importMsg" role="status" style="font-size:13.5px;line-height:1.5"></div>
        <input type="file" id="importPick" accept="application/json,.json" hidden>
      </div>
      <div class="set-sec">
        <h3>להתחיל מחדש</h3>
        <p>מוחק את כל הרשימות שיצרת ואת המשימות שבהן. רשימות ששיתפו איתך לא נמחקות.</p>
        <button class="ghost danger" data-set="wipe" id="wipeBtn" style="align-self:flex-start">מחיקת כל הרשימות שלי</button>
      </div>
      <div class="set-sec">
        <button class="ghost danger" data-set="logout" style="align-self:flex-start">יציאה מהחשבון</button>
      </div>
    </div></div></div>`;
  if (welcome) $("#myName").focus();
  $("#importPick").addEventListener("change", importFile);
}
$("#whoBtn").addEventListener("click", () => openSettings(false));
$("#layer").addEventListener("submit", async e => {
  if (e.target.id !== "nameForm") return; e.preventDefault();
  const name = $("#myName").value.trim(); if (!name) return;
  const { error } = await sb.from("profiles").update({ name }).eq("id", me.id);
  if (error) return fail(error);
  myProfile = { ...myProfile, name }; state.people[me.id] = myProfile; render(); toast("השם נשמר");
});
$("#layer").addEventListener("click", async e => {
  const b = e.target.closest("[data-set]"); if (!b || !settingsOpen) return;
  const k = b.dataset.set;
  if (k === "copyurl") copyText(captureUrl(), "הכתובת הועתקה");
  if (k === "import") $("#importPick").click();
  if (k === "getshortcut"){ await copyText(captureUrl(), "הכתובת הועתקה — הדביקי אותה כשהקיצור שואל"); setTimeout(() => { location.href = SHORTCUT_LINK; }, 900); }
  if (k === "logout"){ await sb.auth.signOut(); location.reload(); }
  if (k === "wipe") wipeMine(b);
});

// delete every list I own (tasks and memberships go with them). Two taps: the first arms the button.
async function wipeMine(b){
  if (!b.classList.contains("armed")){
    b.classList.add("armed"); b.textContent = "בטוחה? לחצי שוב למחיקה";
    setTimeout(() => { if (b.isConnected && !b.disabled){ b.classList.remove("armed"); b.textContent = "מחיקת כל הרשימות שלי"; } }, 5000);
    return;
  }
  b.disabled = true; b.textContent = "מוחקת…";
  const { error } = await sb.from("lists").delete().eq("owner_id", me.id).eq("kind", "list");
  if (error){ b.disabled = false; b.classList.remove("armed"); b.textContent = "מחיקת כל הרשימות שלי"; return fail(error); }
  await loadAll();
  b.classList.remove("armed"); b.textContent = "נמחק ✓";
  toast("כל הרשימות שלך נמחקו. אפשר לייבא קובץ חדש.");
}

// import the JSON exported from the artifact version
async function importFile(e){
  const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
  let data; try{ data = JSON.parse(await file.text()); }catch(_){ toast("הקובץ לא נקרא. ודאי שזה קובץ ה-JSON מ-Claude."); return; }
  if (!Array.isArray(data?.lists) || !Array.isArray(data?.tasks)){ toast("זה לא נראה כמו קובץ ייצוא של הגיגית."); return; }
  const btn = $("#importBtn"), msg = $("#importMsg");
  const say = m => { if (msg) msg.textContent = m; };
  if (btn){ btn.disabled = true; btn.textContent = "מייבאת…"; }
  say("מייבאת, רגע…");
  try{
    await loadAll();
    for (const lb of data.labels || []){ if (!labelByName(lb.name)) createLabel(lb.emoji, lb.name); }
    // a list I own with the same name is reused, so importing again (or a newer file) doesn't duplicate lists
    const mineByName = {};
    for (const l of Object.values(state.lists)) if (l.kind === "list" && l.ownerId === me.id && !mineByName[l.name]) mineByName[l.name] = l;
    const idFor = {}, created = [];
    data.lists.forEach((l, i) => {
      const have = mineByName[l.name];
      if (have){ idFor[l.key] = have.id; return; }
      const id = newId(); idFor[l.key] = id; mineByName[l.name] = { id };
      created.push({ id, name: l.name, color: Number.isInteger(l.color) ? l.color : i % PALETTE.length, owner_id: me.id });
    });
    for (const l of created){ const { error } = await sb.from("lists").insert(l); if (error) throw error; }
    const pins = data.lists.filter(l => l.pinned).map(l => idFor[l.key]);
    for (const id of pins) await sb.from("list_members").update({ pinned: true }).eq("list_id", id).eq("user_id", me.id);
    // a task with the same text already in that list is updated instead of added again
    const norm = s => String(s || "").trim().replace(/\s+/g, " ");
    const existing = {};
    for (const t of Object.values(state.tasks)) existing[t.listId + "|" + norm(t.text)] = t;
    const rows = [], seen = new Set(); let updated = 0;
    for (const t of data.tasks){
      const listId = idFor[t.listKey]; if (!listId) continue;
      const k = listId + "|" + norm(t.text); if (seen.has(k)) continue; seen.add(k);
      const fields = { note: t.note || "", note_at: iso(t.noteAt), done: !!t.done, done_at: iso(t.doneAt), pinned: !!t.pinned, labels: t.labels || [], deleted_at: iso(t.deletedAt) };
      const have = existing[k];
      if (have){ const { error } = await sb.from("tasks").update(fields).eq("id", have.id); if (error) throw error; updated++; continue; }
      rows.push({ id: newId(), list_id: listId, text: t.text, created_at: iso(t.created || Date.now()), ...fields });
    }
    for (let i = 0; i < rows.length; i += 200){ say(`מייבאת… ${i}/${rows.length}`); const { error } = await sb.from("tasks").insert(rows.slice(i, i + 200)); if (error) throw error; }
    await loadAll();
    const done = `✓ הייבוא הסתיים: ${created.length} רשימות חדשות, ${rows.length} משימות חדשות${updated ? `, ${updated} עודכנו` : ""}.`;
    say(done); toast(done);
    if (btn){ btn.disabled = false; btn.textContent = "בחירת קובץ"; }
    const wasShared = data.lists.filter(l => l.sharedBefore).map(l => l.name);
    setStatus(wasShared.length ? `רשימות שהיו משותפות קודם: ${wasShared.join(", ")}. אפשר לשתף אותן מחדש מתוך כל רשימה (כפתור "שיתוף").` : "", 20000);
  }catch(err){
    console.error(err); if (btn){ btn.disabled = false; btn.textContent = "בחירת קובץ"; }
    say("הייבוא נעצר באמצע. אפשר לנסות שוב — מה שכבר נכנס לא ייכנס פעמיים."); await loadAll();
  }
}

/* =====================================================================
   toast
   ===================================================================== */
let toastTimer;
function toast(msg, opt){
  const el = $("#toast");
  const movable = opt && !opt.undo ? opt : null, undo = opt?.undo;
  el.innerHTML = `<div><span>${esc(msg)}</span>${movable ? `<button id="moveBtn">העברה</button>` : ""}${undo ? `<button id="undoBtn">ביטול</button>` : ""}</div>`;
  el.hidden = false; clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.hidden = true, movable || undo ? 8000 : 2400);
  if (undo) $("#undoBtn").onclick = () => { el.hidden = true; store.putTask(undo); };
  if (movable) $("#moveBtn").onclick = () => { el.hidden = true; enqueue([{ text: movable.text, suggestId: movable.listId, suggestNew: "", moveId: movable.id }]); };
}

/* ---------- installable app ---------- */
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

boot();
