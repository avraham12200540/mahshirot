/**
 * Header — לוגו, כפתורי ערכות נושא, קרדיט מפתח.
 */

import { el, svg } from "../core/dom.js";
import { icon } from "./icons.js";
import { openAboutModal } from "./guides.js";
import { openAiChat } from "./ai-chat.js";

const THEME_KEY = "mahshirot:theme";
const THEMES = [
  { id: "dark", label: "כהה", icon: "moon" },
  { id: "light", label: "בהיר", icon: "sun" },
  { id: "neon", label: "ניאון", icon: "zap" },
];

const LAYOUT_KEY = "mahshirot:layout";

/** מחזיר את ערכת הנושא השמורה. */
export function currentTheme() {
  return localStorage.getItem(THEME_KEY) || "dark";
}

/** מחיל ערכת נושא. */
export function applyTheme(id) {
  document.documentElement.dataset.theme = id;
  localStorage.setItem(THEME_KEY, id);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const colors = { dark: "#0b1220", light: "#eef2f8", neon: "#05070f" };
    meta.content = colors[id] ?? "#0b1220";
  }
}

/** מחזירה true אם פריסה רחבה פעילה. */
export function isWideLayout() {
  return localStorage.getItem(LAYOUT_KEY) === "wide";
}

/** מחילה פריסה רחבה/רגילה. */
export function applyLayout(wide) {
  document.documentElement.dataset.layout = wide ? "wide" : "normal";
  localStorage.setItem(LAYOUT_KEY, wide ? "wide" : "normal");
}

export function createHeader() {
  const buttons = THEMES.map((t) => {
    const b = el(
      "button.theme-btn",
      {
        "aria-pressed": String(currentTheme() === t.id),
        "data-theme-id": t.id,
        "data-tip": `ערכת נושא ${t.label}`,
      },
      [svg(icon(t.icon, 14)), el("span", { text: t.label })],
    );

    b.addEventListener("click", () => {
      applyTheme(t.id);
      sync();
    });

    return b;
  });

  function sync() {
    const active = currentTheme();
    for (const b of buttons) {
      b.setAttribute("aria-pressed", String(b.dataset.themeId === active));
    }
  }

  const aboutBtn = el(
    "button.theme-btn",
    { "data-tip": "מידע חשוב, אזהרות ופרטי קשר — חובה לקרוא לפני השימוש" },
    [svg(icon("info", 14)), el("span", { text: "פרטים ומשוב" })],
  );
  aboutBtn.addEventListener("click", () => openAboutModal());

  const layoutBtn = el(
    "button.theme-btn",
    {
      "aria-pressed": String(isWideLayout()),
      "data-tip": "החלף בין פריסה רגילה לפריסה רחבה יותר",
    },
    [svg(icon(isWideLayout() ? "minimize" : "maximize", 14)), el("span", { text: "פריסה רחבה" })],
  );
  layoutBtn.addEventListener("click", () => {
    const next = !isWideLayout();
    applyLayout(next);
    layoutBtn.setAttribute("aria-pressed", String(next));
    layoutBtn.replaceChildren(svg(icon(next ? "minimize" : "maximize", 14)), el("span", { text: "פריסה רחבה" }));
  });

  const aiBtn = el(
    "button.theme-btn",
    { "data-tip": "צ'אט עם AI (Gemini) — עם מפתח API אישי וחינמי מ-Google AI Studio" },
    [svg(icon("send", 14)), el("span", { text: "צ'אט עם AI" })],
  );
  aiBtn.addEventListener("click", () => openAiChat());

  return el("header.header", {}, [
    el("div.container", {}, [
      el("div.header__inner", {}, [
        // לוגו
        el("div.brand", {}, [
          el("div.brand__mark", { html: icon("smartphone", 21) }),
          el("div.brand__text", {}, [
            el("div.brand__name", { text: "מכשירוט" }),
            el("div.brand__underline"),
          ]),
        ]),

        // כפתורי מצב
        el("div.header__controls", {}, [aboutBtn, aiBtn, layoutBtn, ...buttons]),

        // קרדיט מפתח
        el("div.header__author", {}, [
          el("span.header__author-name", { text: "שלמה רביב" }),
          el("a.header__author-link", {
            href: "https://shlomoraviv.github.io/Raviv-Digital/",
            target: "_blank",
            rel: "noopener noreferrer",
            text: "פרופיל בפורום ↗",
          }),
        ]),
      ]),
    ]),
  ]);
}
