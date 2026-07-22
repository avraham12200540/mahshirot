/**
 * מדריך הפקודות המלא שתרם פב״ב הראשון — מוטבע כאן בדיוק כפי שנשלח,
 * בתוך iframe, כדי לא לפגוע בעיצוב או בפונקציונליות המקוריים שלו.
 */

import { el } from "../core/dom.js";

export function createPavvSection() {
  return el("section.pavv-section", { id: "pavv-guide" }, [
    el("div.pavv-section__head", {}, [
      el("h2", { text: "📚 מדריך הפקודות המלא — תודה לפב״ב הראשון" }),
      el("p", {
        text: "אוסף פקודות ADB מורחב שתרם פב״ב הראשון לקהילה — מוטבע כאן בדיוק כפי שנשלח, על כל הכלים שלו (חיפוש, מועדפים, שמירה, מסוף וירטואלי).",
      }),
      el("a.pavv-section__open", {
        href: "./adb-reference-pavv.html",
        target: "_blank",
        rel: "noopener noreferrer",
        text: "פתח בעמוד נפרד ⇱",
      }),
    ]),
    el("iframe.pavv-section__frame", {
      src: "./adb-reference-pavv.html",
      title: "מדריך הפקודות של פב״ב הראשון",
      loading: "lazy",
    }),
  ]);
}
