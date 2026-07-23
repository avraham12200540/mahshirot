/**
 * הזרקת חבילה/IP גלובלית — ערך אחד שמוזרק אוטומטית לכל פקודה שדורשת אותו,
 * כדי לא להקליד אותו שוב ושוב בכל כפתור. נשמר ב-localStorage.
 */

const KEY = "mahshirot:injection";

let value = localStorage.getItem(KEY) || "";
const listeners = new Set();

/** הערך המוזרק הנוכחי (ריק אם לא הוגדר). */
export function getInjection() {
  return value;
}

/** קובע ערך הזרקה חדש (או מנקה אם ריק). */
export function setInjection(next) {
  value = String(next ?? "").trim();
  if (value) localStorage.setItem(KEY, value);
  else localStorage.removeItem(KEY);
  listeners.forEach((fn) => fn(value));
}

/** נרשם לשינויים בערך ההזרקה. מחזיר פונקציית ביטול הרשמה. */
export function subscribeInjection(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
