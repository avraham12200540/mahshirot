/**
 * "עוד קטגוריות" — בורר קטגוריות ומודאל פקודות לכל קטגוריה.
 */

import { el, svg } from "../core/dom.js";
import { icon } from "./icons.js";
import { openModal } from "./modal.js";
import { CATEGORIES, findCategory } from "../data/commands.js";
import { runCommandButton } from "./command-button.js";

/** פותח מודאל עם כל הפקודות של קטגוריה. */
export function openCategoryModal(categoryId) {
  const category = findCategory(categoryId);
  if (!category) return;

  const adbCount = category.commands.filter((c) => c.mode === "adb").length;
  const fbCount = category.commands.filter((c) => c.mode === "fastboot").length;

  const body = el("div", {}, [
    el("div.card__hint", {
      style: { marginBottom: "12px" },
      text:
        fbCount > 0 && adbCount > 0
          ? `${category.commands.length} פקודות — ${adbCount} דורשות מצב ADB, ${fbCount} דורשות מצב Fastboot. רחף מעל כפתור כדי לראות מה הוא עושה.`
          : fbCount > 0
            ? `${category.commands.length} פקודות. כולן דורשות שהמכשיר יהיה במצב Fastboot.`
            : `${category.commands.length} פקודות. כולן דורשות שהמכשיר יהיה מחובר במצב ADB.`,
    }),
    el(
      "div",
      { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "8px" } },
      category.commands.map((c) => runCommandButton(c)),
    ),
  ]);

  return openModal({
    title: category.name,
    body,
    iconName: category.icon,
    wide: true,
    buttons: [
      { label: "חזרה לקטגוריות", value: "back", variant: "ghost" },
      { label: "סגור", value: null, variant: "primary", primary: true },
    ],
  }).then((v) => {
    if (v === "back") openCategoryPicker();
  });
}

/** פותח את בורר הקטגוריות. */
export function openCategoryPicker() {
  const grid = el(
    "div.catgrid",
    {},
    CATEGORIES.map((cat) => {
      const card = el("button.catcard", { "data-tip": `${cat.commands.length} פקודות` }, [
        el("div.catcard__icon", { html: icon(cat.icon, 15) }),
        el("div.catcard__text", {}, [
          el("span.catcard__name", { text: cat.name }),
          el("span.catcard__count", { text: `${cat.commands.length} פקודות` }),
        ]),
      ]);
      card.addEventListener("click", () => {
        close?.();
        openCategoryModal(cat.id);
      });
      return card;
    }),
  );

  const total = CATEGORIES.reduce((sum, c) => sum + c.commands.length, 0);

  let close;

  return openModal({
    title: "עוד קטגוריות",
    body: el("div", {}, [
      el("div.card__hint", {
        style: { marginBottom: "12px" },
        text: `${total} פקודות ב-${CATEGORIES.length} קטגוריות. בחר קטגוריה כדי לראות את כל הפקודות שבה.`,
      }),
      grid,
    ]),
    iconName: "grid",
    wide: true,
    buttons: [{ label: "סגור", value: null, variant: "primary", primary: true }],
    onMount: (closeFn) => {
      close = closeFn;
    },
  });
}
