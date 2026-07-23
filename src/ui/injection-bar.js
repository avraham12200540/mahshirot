/**
 * סרגל הזרקת חבילה/IP — ערך קבוע אחד שמוזרק אוטומטית לכל פקודה שדורשת
 * שם חבילה או כתובת (כולל פקודות פב״ב הראשון עם XXX), בלי להקליד כל פעם מחדש.
 */

import { el, svg } from "../core/dom.js";
import { icon } from "./icons.js";
import { getInjection, setInjection } from "../core/injection.js";
import { toastOk, toastWarn } from "./toast.js";

export function createInjectionBar() {
  const input = el("input.injection__input", {
    type: "text",
    placeholder: "הזרקת חבילה/IP קבועים (למשל com.whatsapp) — יוזרק אוטומטית לכל פקודה",
    autocomplete: "off",
    spellcheck: "false",
    value: getInjection(),
    style: { direction: "ltr", textAlign: "start" },
  });

  const applyBtn = el("button.btn.btn--sm.btn--primary", { text: "הזרק" });
  const clearBtn = el("button.btn.btn--sm.btn--ghost.injection__clear", { text: "נקה" });

  const bar = el("div.injection", {}, [svg(icon("zap", 14)), input, applyBtn, clearBtn]);

  function sync() {
    const active = !!getInjection();
    bar.classList.toggle("injection--active", active);
    clearBtn.classList.toggle("hidden", !active);
  }

  applyBtn.addEventListener("click", () => {
    const value = input.value.trim();
    if (!value) {
      toastWarn("הקלד חבילה או כתובת להזרקה קודם.");
      return;
    }
    setInjection(value);
    toastOk(`הוזרק: ${value} — יוזרק אוטומטית לכל פקודה שדורשת חבילה/IP.`);
    sync();
  });

  clearBtn.addEventListener("click", () => {
    setInjection("");
    input.value = "";
    toastOk("ההזרקה בוטלה — פקודות ישאלו שוב כרגיל.");
    sync();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyBtn.click();
  });

  sync();
  return bar;
}
