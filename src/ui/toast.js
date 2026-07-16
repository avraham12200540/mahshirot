/**
 * טוסטים — הודעות מצב קצרות. מעוצבים, לא alert() של הדפדפן.
 */

import { el, svg } from "../core/dom.js";
import { icon } from "./icons.js";

const ICONS = { info: "info", ok: "check", warn: "alert", danger: "alert" };

let container = null;

function ensureContainer() {
  if (!container) {
    container = el("div.toasts", { "aria-live": "polite" });
    document.body.append(container);
  }
  return container;
}

/**
 * מציג טוסט.
 * @param {string} message
 * @param {"info"|"ok"|"warn"|"danger"} [tone]
 * @param {number} [duration] אלפיות שנייה. 0 = לא נסגר לבד
 */
export function toast(message, tone = "info", duration = 4200) {
  const root = ensureContainer();

  const node = el(`div.banner.toast.banner--${tone}`, {}, [
    svg(icon(ICONS[tone] ?? "info", 16)),
    el("div.banner__content", {}, [el("div", { text: message })]),
    el("button.banner__close", {
      html: icon("x", 11),
      "aria-label": "סגור",
      on: { click: () => dismiss(node) },
    }),
  ]);

  root.append(node);

  if (duration > 0) {
    setTimeout(() => dismiss(node), duration);
  }

  return node;
}

function dismiss(node) {
  if (!node.isConnected) return;
  node.classList.add("toast--out");
  setTimeout(() => node.remove(), 200);
}

export const toastOk = (m) => toast(m, "ok");
export const toastErr = (m) => toast(m, "danger", 6500);
export const toastWarn = (m) => toast(m, "warn", 5200);
