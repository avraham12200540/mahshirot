/**
 * Footer — קרדיט קבוע לשלמה רביב, עם מייל וקישור לחיצים.
 */

import { el } from "../core/dom.js";
import { icon } from "./icons.js";

export const AUTHOR = {
  name: "שלמה רביב",
  email: "0556798858b@gmail.com",
  site: "https://shlomoraviv.github.io/Raviv-Digital/",
  siteLabel: "shlomoraviv.github.io/Raviv-Digital",
};

export function createFooter() {
  return el("footer.footer", {}, [
    el("div.container", {}, [
      el("div.footer__inner", {}, [
        el("div.footer__brand", {}, [
          el("div.footer__brand-mark", { html: icon("smartphone", 14) }),
          el("strong", { text: "מכשירוט" }),
        ]),

        el("p.footer__main", {
          html: `נבנה על ידי <strong>${AUTHOR.name}</strong> — מפתח תוכנות ואפליקציות | מבצע צריבות גרסאות למכשירים ונגנים בתשלום ועוד.`,
        }),

        el("div.footer__links", {}, [
          el("span", { text: "לפרטים נוספים:" }),
          el("a", { href: `mailto:${AUTHOR.email}`, text: AUTHOR.email }),
          el("span.footer__sep", { text: "•" }),
          el("span", { text: "לאתר:" }),
          el("a", {
            href: AUTHOR.site,
            target: "_blank",
            rel: "noopener noreferrer",
            text: AUTHOR.siteLabel,
          }),
        ]),

        el("p.footer__note", {
          text: "האתר פועל כולו בדפדפן שלך (WebUSB) — אין שרת ואין איסוף נתונים. השימוש באחריות המשתמש בלבד; פעולות צריבה ופתיחת בוטלואדר עלולות למחוק נתונים או להשבית את המכשיר.",
        }),
      ]),
    ]),
  ]);
}
