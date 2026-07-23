/**
 * שורת החיפוש וטאבי הקטגוריות.
 *
 * החיפוש מסנן את *כל* הפקודות בכל הקטגוריות בזמן אמת ומציג אותן ככרטיסיית
 * תוצאות; ריקון השדה מחזיר את התצוגה הרגילה.
 */

import { el, clear, svg, debounce } from "../core/dom.js";
import { icon } from "./icons.js";
import { CATEGORIES, searchCommands } from "../data/commands.js";
import { openCategoryModal, openCategoryPicker } from "./categories.js";
import { runCommandButton } from "./command-button.js";
import { createInjectionBar } from "./injection-bar.js";

/** הקטגוריות שמופיעות כטאבים מהירים. השאר תחת "עוד קטגוריות". */
const QUICK_TABS = [
  { id: "__home", name: "חיבור" },
  { id: "__bootloader", name: "בוטלואדר" },
  { id: "device", name: "אנדרואיד" },
  { id: "cpu", name: "מעבד" },
  { id: "fastbootAdv", name: "Fastboot" },
];

export function createToolbar({ onScrollToCards }) {
  const input = el("input.search__input", {
    type: "search",
    placeholder: "חפש פקודה… (למשל: צילום מסך, סוללה, getprop, unlock)",
    "aria-label": "חיפוש פקודות",
    autocomplete: "off",
  });

  const clearBtn = el("button.search__clear.hidden", {
    html: icon("x", 12),
    "aria-label": "נקה חיפוש",
  });

  const results = el("div.search-results.hidden");

  const tabs = el("div.tabs", { role: "tablist" });

  for (const tab of QUICK_TABS) {
    const b = el("button.tab", { text: tab.name, "data-cat": tab.id });
    b.addEventListener("click", () => {
      // הטאבים הראשונים גוללים לכרטיסיות; השאר פותחים מודאל קטגוריה
      if (tab.id.startsWith("__")) {
        onScrollToCards?.();
      } else {
        openCategoryModal(tab.id);
      }
      setActive(b);
    });
    tabs.append(b);
  }

  const moreBtn = el("button.tab.tab--more", {}, [
    svg(icon("grid", 13)),
    document.createTextNode("עוד קטגוריות"),
  ]);
  moreBtn.addEventListener("click", () => openCategoryPicker());
  tabs.append(moreBtn);

  function setActive(button) {
    for (const b of tabs.querySelectorAll(".tab")) b.classList.remove("tab--active");
    button?.classList.add("tab--active");
  }

  // הטאב הראשון פעיל כברירת מחדל
  setActive(tabs.querySelector(".tab"));

  /* ---------- חיפוש ---------- */

  function renderResults(query) {
    const matches = searchCommands(query);
    clear(results);

    if (!query.trim()) {
      results.classList.add("hidden");
      return;
    }

    results.classList.remove("hidden");

    if (!matches.length) {
      results.append(
        el("div.search-results__empty", {
          text: `לא נמצאו פקודות עבור "${query}". נסה מילה אחרת — למשל "סוללה", "מסך", "getprop".`,
        }),
      );
      return;
    }

    results.append(
      el("div.search-results__title", {}, [
        document.createTextNode("נמצאו "),
        el("strong", { text: String(matches.length) }),
        document.createTextNode(` פקודות עבור "${query}"`),
      ]),
    );

    // מקבצים לפי קטגוריה כדי שהתוצאות יישארו קריאות
    const byCategory = new Map();
    for (const cmd of matches) {
      if (!byCategory.has(cmd.categoryId)) byCategory.set(cmd.categoryId, []);
      byCategory.get(cmd.categoryId).push(cmd);
    }

    const grid = el("div.cards-grid");
    for (const [catId, commands] of byCategory) {
      const cat = CATEGORIES.find((c) => c.id === catId);
      grid.append(
        el("section.card", {}, [
          el("div.card__head", {}, [
            el("h2.card__title", {}, [
              svg(icon(cat?.icon ?? "terminal", 17)),
              document.createTextNode(cat?.name ?? "פקודות"),
            ]),
            el("div.card__rule"),
          ]),
          el(
            "div.card__body",
            {},
            commands.map((c) => runCommandButton(c)),
          ),
        ]),
      );
    }
    results.append(grid);
  }

  const onSearch = debounce((value) => renderResults(value), 130);

  input.addEventListener("input", () => {
    clearBtn.classList.toggle("hidden", !input.value);
    onSearch(input.value);
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    clearBtn.classList.add("hidden");
    renderResults("");
    input.focus();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = "";
      clearBtn.classList.add("hidden");
      renderResults("");
    }
  });

  const toolbar = el("div.toolbar", {}, [
    el("div.search", {}, [svg(icon("search", 17)), input, clearBtn]),
    tabs,
    createInjectionBar(),
  ]);

  // מוסיפים את class האייקון ידנית (svg() מחזיר אלמנט בלי מחלקה)
  toolbar.querySelector(".search > svg")?.classList.add("search__icon");

  return { toolbar, results, focusSearch: () => input.focus() };
}
