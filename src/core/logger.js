/**
 * הלוג המרכזי של האתר.
 *
 * כל פקודה, פלט ושגיאה עוברים דרך כאן — אין אף מסלול אחר.
 * לעולם לא נפתח חלון טרמינל/CMD חיצוני: הכל מוצג בתוך פאנל הלוג באתר.
 */

import { timestamp } from "./dom.js";

/** @typedef {"info"|"cmd"|"out"|"ok"|"err"|"warn"} LogLevel */

const BADGES = {
  info: "מערכת",
  cmd: "פקודה",
  out: "פלט",
  ok: "הצלחה",
  err: "שגיאה",
  warn: "אזהרה",
};

const MAX_ENTRIES = 2000;
const MAX_HISTORY = 200;

class Logger {
  /** @type {Array<{id:number, level:LogLevel, message:string, time:string, badge:string}>} */
  entries = [];
  /** @type {Array<{cmd:string, time:string}>} */
  history = [];
  /** @type {Set<Function>} */
  #listeners = new Set();
  #nextId = 1;

  /** נרשם לשינויים. מחזיר פונקציית ביטול. */
  subscribe(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  #emit(event) {
    for (const fn of this.#listeners) {
      try {
        fn(event);
      } catch (err) {
        console.error("log listener failed", err);
      }
    }
  }

  /**
   * מוסיף שורה ללוג.
   * @param {LogLevel} level
   * @param {string} message
   */
  add(level, message) {
    const text = String(message ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (!text.trim() && level === "out") return null;

    const entry = {
      id: this.#nextId++,
      level,
      message: text,
      time: timestamp(),
      badge: BADGES[level] ?? level,
    };

    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }

    this.#emit({ type: "entry", entry });
    return entry;
  }

  info(msg) {
    return this.add("info", msg);
  }
  ok(msg) {
    return this.add("ok", msg);
  }
  warn(msg) {
    return this.add("warn", msg);
  }
  err(msg) {
    return this.add("err", msg);
  }
  out(msg) {
    return this.add("out", msg);
  }

  /**
   * מוסיף פקודה להיסטוריה בלבד, בלי לרשום שורת לוג.
   *
   * שורת הקלט הידנית קוראת לזה *לפני* ההרצה, כדי שגם פקודה שנכשלה
   * (למשל כשאין מכשיר מחובר) תישאר זמינה לשליפה בחץ למעלה — בדיוק
   * כמו בטרמינל אמיתי.
   *
   * @param {string} cmd
   */
  remember(cmd) {
    const text = String(cmd ?? "").trim();
    if (!text) return;

    // מונע כפילות: ההרצה עצמה תרשום את אותה פקודה מיד אחרי
    if (this.history.at(-1)?.cmd === text) return;

    this.history.push({ cmd: text, time: timestamp() });
    if (this.history.length > MAX_HISTORY) this.history.shift();
    this.#emit({ type: "history" });
  }

  /**
   * רושם פקודה שנשלחה למכשיר, ומוסיף אותה להיסטוריה.
   * @param {string} cmd הפקודה כפי שהיא (למשל "adb shell getprop")
   */
  cmd(cmd) {
    const entry = this.add("cmd", cmd);
    this.remember(cmd);
    return entry;
  }

  /** רושם פלט רב-שורתי מהמכשיר (נשאר באנגלית כפי שהתקבל). */
  output(text) {
    const trimmed = String(text ?? "").trimEnd();
    if (!trimmed) {
      this.add("out", "(אין פלט)");
      return;
    }
    this.add("out", trimmed);
  }

  /** מנקה את הלוג. */
  clear() {
    this.entries = [];
    this.#emit({ type: "clear" });
    this.info("הלוג נוקה.");
  }

  /** מנקה את היסטוריית הפקודות. */
  clearHistory() {
    this.history = [];
    this.#emit({ type: "history" });
    this.info("היסטוריית הפקודות נוקתה.");
  }

  /** מייצא את הלוג כטקסט. */
  toText() {
    return this.entries.map((e) => `[${e.time}] ${e.badge}: ${e.message}`).join("\n");
  }
}

export const log = new Logger();

/**
 * ממיר שגיאה להודעה קריאה בעברית.
 * @param {unknown} error
 */
export function describeError(error) {
  if (!error) return "שגיאה לא ידועה.";
  const msg = error instanceof Error ? error.message : String(error);

  // שגיאות WebUSB נפוצות — מתורגמות להסבר מעשי
  if (/No device selected|No device chosen/i.test(msg)) {
    return "לא נבחר מכשיר בחלון הבחירה של הדפדפן.";
  }
  if (/user gesture/i.test(msg)) {
    return "הדפדפן דורש לחיצה ישירה כדי לפתוח את חלון בחירת המכשיר. לחץ שוב על הכפתור.";
  }
  if (/requestDevice/i.test(msg) && /permission/i.test(msg)) {
    return "הדפדפן חסם את בקשת בחירת המכשיר. לחץ שוב על הכפתור ואשר את החלון שנפתח.";
  }
  if (/Access denied|SecurityError/i.test(msg)) {
    return "הדפדפן חסם את הגישה למכשיר. ודא שהדרייבר הוא WinUSB (ראה 'התקן דרייברים').";
  }
  if (/Unable to claim interface|claim/i.test(msg)) {
    return "לא ניתן לתפוס את ממשק ה-USB — ככל הנראה שרת ADB אחר במחשב תפס את המכשיר. סגור אותו ונסה שוב (במחשב: adb kill-server), או החלף דרייבר ל-WinUSB.";
  }
  if (/device was disconnected|The device was disconnected/i.test(msg)) {
    return "המכשיר נותק מה-USB.";
  }
  if (/transfer error|babble|stall/i.test(msg)) {
    return "שגיאת תקשורת USB. נתק וחבר מחדש את הכבל ונסה שוב.";
  }
  return msg;
}
