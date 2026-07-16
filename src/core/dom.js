/**
 * עזרי DOM קטנים — יצירת אלמנטים בלי תלות בספרייה חיצונית.
 */

/**
 * יוצר אלמנט עם תכונות וילדים.
 * @param {string} tag שם התג, אפשר עם מחלקות: "div.card.card--wide"
 * @param {object} [props] תכונות. `class`, `text`, `html`, `on` (מאזינים), `dataset`, שאר — attributes
 * @param {Array} [children]
 */
export function el(tag, props = {}, children = []) {
  const [name, ...classes] = tag.split(".");
  const node = document.createElement(name || "div");

  if (classes.length) node.classList.add(...classes);

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === "class") {
      node.classList.add(...String(value).split(" ").filter(Boolean));
    } else if (key === "text") {
      node.textContent = String(value);
    } else if (key === "html") {
      node.innerHTML = value;
    } else if (key === "on") {
      for (const [evt, handler] of Object.entries(value)) {
        node.addEventListener(evt, handler);
      }
    } else if (key === "dataset") {
      Object.assign(node.dataset, value);
    } else if (key === "style" && typeof value === "object") {
      Object.assign(node.style, value);
    } else if (value === true) {
      node.setAttribute(key, "");
    } else {
      node.setAttribute(key, String(value));
    }
  }

  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  return node;
}

/** ממיר מחרוזת SVG לאלמנט. */
export function svg(markup) {
  const wrap = document.createElement("div");
  wrap.innerHTML = markup.trim();
  return wrap.firstElementChild;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** מנקה אלמנט מכל ילדיו. */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** פורמט גודל קובץ קריא. */
export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

/** חותמת זמן HH:MM:SS. */
export function timestamp(date = new Date()) {
  return date.toLocaleTimeString("he-IL", { hour12: false });
}

/** השהיה. */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** דיבאונס. */
export function debounce(fn, ms = 160) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
