// A calendar event for one task. The app opens this address, and the phone offers to add it to the calendar.
//   GET /api/ics?t=<personal token>&task=<task id>&start=<ISO time or YYYY-MM-DD>&dur=<minutes>
// The address carries no task text: the task is read here, after checking the person can see it.
import { env, admin } from "./_env.js";

const esc = s => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = d => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dayStamp = s => s.replace(/-/g, "");

export default async function handler(req, res) {
  const say = (code, msg) => { res.setHeader("Content-Type", "text/plain; charset=utf-8"); res.status(code).send(msg); };
  if (!env.url || !env.service) return say(500, "השרת לא מוגדר עדיין.");
  const token = String(req.query.t || "").trim(), taskId = String(req.query.task || "").trim(), start = String(req.query.start || "").trim();
  if (!token || !taskId || !start) return say(400, "חסרים פרטים.");

  const db = admin();
  const { data: tok } = await db.from("capture_tokens").select("user_id").eq("token", token).maybeSingle();
  if (!tok) return say(401, "הכתובת לא מוכרת.");
  const { data: task } = await db.from("tasks").select("id, list_id, text, note").eq("id", taskId).maybeSingle();
  if (!task) return say(404, "המשימה לא נמצאה.");
  const { data: mem } = await db.from("list_members").select("list_id").eq("list_id", task.list_id).eq("user_id", tok.user_id).maybeSingle();
  if (!mem) return say(404, "המשימה לא נמצאה.");

  let when, alarm = [];
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) {            // a whole day
    const next = new Date(start + "T00:00:00Z"); next.setUTCDate(next.getUTCDate() + 1);
    when = [`DTSTART;VALUE=DATE:${dayStamp(start)}`, `DTEND;VALUE=DATE:${dayStamp(next.toISOString().slice(0, 10))}`];
  } else {
    const from = new Date(start); if (isNaN(from)) return say(400, "התאריך לא תקין.");
    const dur = Math.min(Math.max(parseInt(req.query.dur, 10) || 30, 5), 24 * 60);
    when = [`DTSTART:${stamp(from)}`, `DTEND:${stamp(new Date(from.getTime() + dur * 60000))}`];
    // an alert at the time itself, so the calendar event also works as a reminder
    alarm = ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(task.text)}`, "TRIGGER:PT0M", "END:VALARM"];
  }
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//hagigit//he", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${task.id}-${Date.now()}@hagigit`, `DTSTAMP:${stamp(new Date())}`, ...when,
    `SUMMARY:${esc(task.text)}`, ...(task.note ? [`DESCRIPTION:${esc(String(task.note).slice(0, 1500))}`] : []),
    ...alarm, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'inline; filename="hagigit.ics"');
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(ics);
}
