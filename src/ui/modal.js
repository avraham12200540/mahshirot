/**
 * מודאלים — אישור, אישור סיכון (עם הקלדה), קלט, ותצוגה חופשית.
 * אף פעם לא alert()/confirm() של הדפדפן — הכל מעוצב בתוך האתר.
 */

import { el, clear } from "../core/dom.js";
import { icon } from "./icons.js";

let openCount = 0;

/**
 * פותח מודאל גנרי.
 * @param {object} options
 * @param {string} options.title
 * @param {Node|string} options.body
 * @param {string} [options.iconName]
 * @param {"default"|"danger"|"warn"} [options.tone]
 * @param {boolean} [options.wide]
 * @param {Array<{label:string, variant?:string, value?:any, primary?:boolean}>} [options.buttons]
 * @param {(close:Function, root:HTMLElement)=>void} [options.onMount]
 * @returns {Promise<any>} הערך של הכפתור שנלחץ, או null אם בוטל
 */
export function openModal({
  title,
  body,
  iconName = "info",
  tone = "default",
  wide = false,
  buttons = [{ label: "סגור", value: null }],
  onMount,
}) {
  return new Promise((resolve) => {
    let settled = false;

    const close = (value = null) => {
      if (settled) return;
      settled = true;
      overlay.remove();
      openCount = Math.max(0, openCount - 1);
      if (openCount === 0) document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      resolve(value);
    };

    const onKey = (e) => {
      if (e.key === "Escape") close(null);
    };

    const toneClass =
      tone === "danger" ? " modal__icon--danger" : tone === "warn" ? " modal__icon--warn" : "";

    const bodyNode =
      typeof body === "string" ? el("div", { html: body }) : body ?? el("div");

    const footer = el(
      "div.modal__foot",
      {},
      buttons.map((b) =>
        el("button.btn", {
          class: b.variant ? `btn--${b.variant}` : "",
          text: b.label,
          on: { click: () => close(b.value ?? null) },
          dataset: { role: b.primary ? "primary" : "" },
        }),
      ),
    );

    const modal = el("div.modal", { class: wide ? "modal--wide" : "", role: "dialog", "aria-modal": "true" }, [
      el("div.modal__head", {}, [
        el("div.modal__icon", { class: toneClass.trim(), html: icon(iconName, 17) }),
        el("h2.modal__title", { text: title }),
        el("button.iconbtn", {
          html: icon("x", 14),
          "aria-label": "סגור",
          on: { click: () => close(null) },
        }),
      ]),
      el("div.modal__body", {}, [bodyNode]),
      footer,
    ]);

    const overlay = el("div.modal-overlay", {
      on: {
        click: (e) => {
          if (e.target === overlay) close(null);
        },
      },
    }, [modal]);

    document.body.append(overlay);
    openCount++;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);

    onMount?.(close, modal);

    // מיקוד ראשוני על הכפתור הראשי, אחרת על המודאל
    const primary = modal.querySelector('[data-role="primary"]');
    (primary ?? modal.querySelector("input, .btn") ?? modal).focus?.();
  });
}

/**
 * מודאל אישור פשוט.
 * @returns {Promise<boolean>}
 */
export async function confirmModal({
  title,
  message,
  confirmLabel = "אישור",
  cancelLabel = "ביטול",
  tone = "default",
  iconName = "alert",
}) {
  const result = await openModal({
    title,
    body: typeof message === "string" ? el("p", { text: message }) : message,
    iconName,
    tone,
    buttons: [
      { label: cancelLabel, value: false, variant: "ghost" },
      {
        label: confirmLabel,
        value: true,
        variant: tone === "danger" ? "danger" : "primary",
        primary: true,
      },
    ],
  });
  return result === true;
}

/**
 * מודאל אזהרת סיכון לפעולה הרסנית.
 * דורש הקלדת מילת אישור — כדי שלא ילחצו בטעות.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.what מה הפעולה עושה
 * @param {string[]} options.risks רשימת סיכונים
 * @param {string} [options.typeWord] מילה שצריך להקליד
 * @param {string} [options.confirmLabel]
 * @returns {Promise<boolean>}
 */
export async function riskModal({
  title,
  what,
  risks = [],
  typeWord = "אישור",
  confirmLabel = "בצע בכל זאת",
}) {
  const input = el("input.field__input", {
    type: "text",
    autocomplete: "off",
    spellcheck: "false",
    placeholder: typeWord,
  });

  const body = el("div", {}, [
    el("p", { text: what }),
    el("div.riskbox", {}, [
      el("div.riskbox__title", { text: "⚠️ אזהרה — פעולה בלתי הפיכה" }),
      el(
        "ul",
        {},
        risks.map((r) => el("li", { text: r })),
      ),
    ]),
    el("div.confirm-type", {}, [
      el("div.confirm-type__label", {
        html: `כדי להמשיך, הקלד <code>${typeWord}</code> בשדה:`,
      }),
      input,
    ]),
  ]);

  return openModal({
    title,
    body,
    iconName: "alert",
    tone: "danger",
    buttons: [
      { label: "ביטול", value: false, variant: "ghost" },
      { label: confirmLabel, value: true, variant: "danger" },
    ],
    onMount: (close, root) => {
      const confirmBtn = [...root.querySelectorAll(".modal__foot .btn")].at(-1);
      confirmBtn.disabled = true;

      const validate = () => {
        confirmBtn.disabled = input.value.trim() !== typeWord;
      };

      input.addEventListener("input", validate);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !confirmBtn.disabled) close(true);
      });
      setTimeout(() => input.focus(), 60);
    },
  }).then((v) => v === true);
}

/**
 * מודאל קלט טקסט.
 * @returns {Promise<string|null>}
 */
export async function promptModal({
  title,
  label,
  placeholder = "",
  value = "",
  hint = "",
  ltr = true,
  confirmLabel = "אישור",
}) {
  const input = el("input.field__input", {
    type: "text",
    value,
    placeholder,
    autocomplete: "off",
    spellcheck: "false",
    style: ltr ? { direction: "ltr", textAlign: "start" } : {},
  });

  const body = el("div.field", {}, [
    label && el("label.field__label", { text: label }),
    input,
    hint && el("div.card__hint", { text: hint }),
  ]);

  let submitted = null;

  const result = await openModal({
    title,
    body,
    iconName: "terminal",
    buttons: [
      { label: "ביטול", value: null, variant: "ghost" },
      { label: confirmLabel, value: "__ok__", variant: "primary" },
    ],
    onMount: (close) => {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          submitted = input.value;
          close("__ok__");
        }
      });
      setTimeout(() => input.focus(), 60);
    },
  });

  if (result !== "__ok__") return null;
  const final = submitted ?? input.value;
  return final.trim() ? final.trim() : null;
}
