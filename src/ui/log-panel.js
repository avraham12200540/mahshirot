/**
 * פאנל הלוג הדביק — הלב של האתר.
 *
 * כל פקודה שרצה באתר מופיעה כאן בזמן אמת: חותמת זמן, הפקודה, והפלט.
 * כולל שורת קלט ידנית עם היסטוריה (חיצים למעלה/למטה, כמו טרמינל).
 */

import { el, clear, svg } from "../core/dom.js";
import { icon } from "./icons.js";
import { log, describeError } from "../core/logger.js";
import { adbService } from "../core/adb-service.js";
import { fastbootService } from "../core/fastboot-service.js";
import { checkAdbDevices, checkFastbootDevices } from "./connection-actions.js";
import { findCommand, pickFiles, uninstallPackage } from "../data/commands.js";
import * as ops from "../core/adb-ops.js";

const MIN_HEIGHT = 46;
const MAX_HEIGHT_RATIO = 0.8;
const DEFAULT_HEIGHT = 300;
const STORAGE_KEY = "mahshirot:logHeight";

export function createLogPanel() {
  let activeTab = "log";
  let autoScroll = true;
  let collapsed = false;

  /* ---------- אלמנטים ---------- */

  const body = el("div.logpanel__body", { id: "log-body" });
  const input = el("input.logpanel__input", {
    type: "text",
    placeholder: "adb shell getprop  |  fastboot getvar product",
    spellcheck: "false",
    autocomplete: "off",
    "aria-label": "שורת פקודה ידנית",
  });

  const logCount = el("span.logtab__count", { text: "0" });
  const histCount = el("span.logtab__count", { text: "0" });

  const tabLog = el("button.logtab.logtab--active", {}, [
    svg(icon("terminal", 13)),
    document.createTextNode("לוג"),
    logCount,
  ]);

  const tabHist = el("button.logtab", {}, [
    svg(icon("list", 13)),
    document.createTextNode("פקודות ADB"),
    histCount,
  ]);
    const collapseBtn = el("button.iconbtn", {
    html: icon("chevronDown", 14),
    "aria-label": "הסתר פאנל",
    "data-tip": "הסתר/הצג את הפאנל",
    });

  const panel = el("aside.logpanel", { "aria-label": "פאנל לוג" }, [
    el("div.logpanel__grip", { "aria-hidden": "true" }),
    el("div.logpanel__head", {}, [
      el("div.logpanel__tabs", {}, [tabLog, tabHist]),
      el("div.logpanel__spacer"),
      el("div.logpanel__actions", {}, [
        el("button.iconbtn", {
          html: icon("copy", 14),
          "aria-label": "העתק לוג",
          "data-tip": "העתק את כל הלוג",
          on: { click: copyLog },
        }),
        el("button.iconbtn", {
          html: icon("eraser", 14),
          "aria-label": "נקה",
          "data-tip": "נקה את הלוג / ההיסטוריה",
          on: { click: clearActive },
        }),
        collapseBtn,
      ]),
    ]),
    body,
    el("div.logpanel__input-row", {}, [
      el("span.logpanel__prompt", { text: "$" }),
      input,
      el("button.btn.btn--primary", {}, [svg(icon("send", 14)), document.createTextNode("שלח")]),
    ]),
  ]);

  // כפתור "שלח"
  panel.querySelector(".logpanel__input-row .btn").addEventListener("click", submit);

  /* ---------- רינדור ---------- */

  function lineNode(entry) {
    // פלט המכשיר נשאר LTR באנגלית; הודעות מערכת בעברית RTL
    const isOutput = entry.level === "out";
    return el(`div.logline.logline--${entry.level}`, {}, [
      el("span.logline__time", { text: entry.time }),
      el("span.logline__badge", { text: entry.badge }),
      el("span.logline__msg", {
        class: isOutput ? "logline__msg--out" : "",
        text: entry.message,
      }),
    ]);
  }

  function renderLog() {
    clear(body);
    if (!log.entries.length) {
      body.append(
        el("div.logpanel__empty", {
          text: "אין עדיין פעילות. חבר מכשיר ולחץ על אחת הפקודות — כל מה שירוץ יופיע כאן.",
        }),
      );
      return;
    }
    const pane = el("div.logpanel__pane");
    for (const entry of log.entries) pane.append(lineNode(entry));
    body.append(pane);
    scrollToEnd();
  }

  function renderHistory() {
    clear(body);
    if (!log.history.length) {
      body.append(
        el("div.logpanel__empty", { text: "עדיין לא הורצו פקודות. ההיסטוריה תופיע כאן." }),
      );
      return;
    }

    const list = el("div.cmdhist");
    // האחרונות למעלה — נוח יותר
    for (const item of [...log.history].reverse()) {
      list.append(
        el(
          "button.cmdhist__item",
          {
            "aria-label": `הרץ שוב: ${item.cmd}`,
            on: {
              click: () => {
                input.value = item.cmd;
                switchTab("log");
                input.focus();
              },
            },
          },
          [
            el("span.cmdhist__time", { text: item.time }),
            el("span.cmdhist__cmd", { text: item.cmd }),
            el("span.cmdhist__replay", { text: "טען מחדש ↺" }),
          ],
        ),
      );
    }
    body.append(list);
  }

  function render() {
    activeTab === "log" ? renderLog() : renderHistory();
  }

  function scrollToEnd() {
    if (autoScroll) body.scrollTop = body.scrollHeight;
  }

  function updateCounts() {
    logCount.textContent = String(log.entries.length);
    histCount.textContent = String(log.history.length);
  }

  /* ---------- טאבים ---------- */

  function switchTab(tab) {
    activeTab = tab;
    tabLog.classList.toggle("logtab--active", tab === "log");
    tabHist.classList.toggle("logtab--active", tab === "history");
    render();
  }

  tabLog.addEventListener("click", () => switchTab("log"));
  tabHist.addEventListener("click", () => switchTab("history"));

  /* ---------- פעולות ---------- */

  function clearActive() {
    activeTab === "log" ? log.clear() : log.clearHistory();
  }

  async function copyLog() {
    try {
      await navigator.clipboard.writeText(log.toText());
      log.ok("הלוג הועתק ללוח.");
    } catch {
      log.err("ההעתקה נכשלה — הדפדפן חסם גישה ללוח.");
    }
  }

  /* ---------- קלט ידני + היסטוריה ---------- */

  let historyIndex = -1;
  let draft = "";

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      submit();
      return;
    }

    // חיצים — ניווט בהיסטוריה, בדיוק כמו טרמינל
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!log.history.length) return;
      if (historyIndex === -1) draft = input.value;
      historyIndex = Math.min(historyIndex + 1, log.history.length - 1);
      input.value = log.history[log.history.length - 1 - historyIndex].cmd;
      moveCaretToEnd();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex <= 0) {
        historyIndex = -1;
        input.value = draft;
      } else {
        historyIndex--;
        input.value = log.history[log.history.length - 1 - historyIndex].cmd;
      }
      moveCaretToEnd();
    }
  });

  function moveCaretToEnd() {
    requestAnimationFrame(() => {
      input.selectionStart = input.selectionEnd = input.value.length;
    });
  }

  async function submit() {
    const raw = input.value.trim();
    if (!raw) return;

    input.value = "";
    historyIndex = -1;
    draft = "";
    switchTab("log");

    // נרשם לפני ההרצה — כדי שגם פקודה שנכשלת תישאר בהיסטוריה
    log.remember(raw);

    try {
      await runManualCommand(raw);
    } catch (error) {
      log.err(describeError(error));
    }
  }

  /* ---------- שינוי גובה ---------- */

  const grip = panel.querySelector(".logpanel__grip");
  let dragging = false;

  grip.addEventListener("pointerdown", (e) => {
    if (collapsed) return;
    dragging = true;
    grip.setPointerCapture(e.pointerId);
    document.body.style.userSelect = "none";
  });

  grip.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const height = window.innerHeight - e.clientY;
    setHeight(height);
  });

  grip.addEventListener("pointerup", (e) => {
    dragging = false;
    grip.releasePointerCapture(e.pointerId);
    document.body.style.userSelect = "";
    localStorage.setItem(STORAGE_KEY, String(currentHeight));
  });

  let currentHeight = DEFAULT_HEIGHT;

  function setHeight(px) {
    const floor = MIN_HEIGHT + 60;
    // בזמן טעינה innerHeight עלול להיות 0 — בלי המשמר הזה התקרה הייתה
    // מתאפסת והפאנל היה נעלם לגמרי.
    const viewport = window.innerHeight;
    const ceiling = viewport > 200 ? viewport * MAX_HEIGHT_RATIO : Infinity;
    currentHeight = Math.round(Math.min(ceiling, Math.max(floor, px)));
    if (!collapsed) {
      document.documentElement.style.setProperty("--log-panel-height", `${currentHeight}px`);
    }
  }

  // כשמשנים את גודל החלון — מוודאים שהפאנל עדיין נכנס למסך
  window.addEventListener("resize", () => setHeight(currentHeight));

  function toggleCollapse() {
    collapsed = !collapsed;
    panel.classList.toggle("logpanel--collapsed", collapsed);
    collapseBtn.innerHTML = icon(collapsed ? "chevronUp" : "chevronDown", 14);
    document.documentElement.style.setProperty(
      "--log-panel-height",
      collapsed ? `${MIN_HEIGHT}px` : `${currentHeight}px`,
    );
  }

  collapseBtn.addEventListener("click", toggleCollapse);

  // גלילה ידנית מכבה auto-scroll, חזרה לתחתית מדליקה אותו
  body.addEventListener("scroll", () => {
    const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 40;
    autoScroll = atBottom;
  });

  /* ---------- חיבור ללוגר ---------- */

  log.subscribe((event) => {
    updateCounts();

    if (activeTab === "history") {
      if (event.type === "history") renderHistory();
      return;
    }

    if (event.type === "entry") {
      // הוספה נקודתית במקום רינדור מחדש — חשוב כשה-logcat מזרים מהר
      const pane = body.querySelector(".logpanel__pane");
      if (pane) {
        pane.append(lineNode(event.entry));
        // גוזמים גם ב-DOM כדי שלא ייצבר לאורך זמן
        while (pane.childElementCount > log.entries.length) pane.firstElementChild.remove();
        scrollToEnd();
      } else {
        renderLog();
      }
      return;
    }

    render();
  });

  /* ---------- אתחול ---------- */

  const saved = Number(localStorage.getItem(STORAGE_KEY));
  setHeight(Number.isFinite(saved) && saved > 100 ? saved : DEFAULT_HEIGHT);
  render();
  updateCounts();

  return { panel, focusInput: () => input.focus(), setValue: (v) => (input.value = v) };
}

/**
 * מריץ פקודה ידנית שהמשתמש הקליד.
 * תומך ב-`adb ...`, `fastboot ...`, או פקודת shell גולמית.
 * @param {string} raw
 */
export async function runManualCommand(raw) {
  const text = raw.trim();

  /* --- fastboot --- */
  if (/^fastboot\s+/i.test(text)) {
    const rest = text.replace(/^fastboot\s+/i, "").trim();

    if (/^devices?$/i.test(rest)) {
      return checkFastbootDevices();
    }

    if (/^getvar\s+/i.test(rest)) {
      const name = rest.replace(/^getvar\s+/i, "").trim();
      if (name === "all") {
        return findCommand("fb-getvar-all").run();
      }
      return fastbootService.getVariable(name);
    }

    if (/^reboot(\s|$)/i.test(rest)) {
      const target = rest.replace(/^reboot\s*/i, "").trim();
      return fastbootService.reboot(target);
    }

    if (/^flash\s+/i.test(rest)) {
      const partition = rest.split(/\s+/)[1];
      log.warn(
        `לצריבה יש לבחור קובץ. השתמש בכרטיסיית 'צריבה ורוט' או בפקודה 'צרוב לפרטישן כלשהו' (פרטישן: ${partition ?? "?"}).`,
      );
      return;
    }

    // כל השאר — פקודה גולמית. `oem x` ו-`erase x` צריכים נקודתיים בפרוטוקול.
    const wire = rest.replace(/^(erase|getvar|set_active)\s+/i, "$1:");
    return fastbootService.runCommand(wire);
  }

  /* --- adb --- */
  if (/^adb\s+/i.test(text)) {
    const rest = text.replace(/^adb\s+/i, "").trim();

    if (/^devices?$/i.test(rest)) {
      return checkAdbDevices();
    }

    if (/^shell\s+/i.test(rest)) {
      return adbService.shell(rest.replace(/^shell\s+/i, ""));
    }

    if (/^shell$/i.test(rest)) {
      log.warn("shell אינטראקטיבי לא נתמך. הקלד פקודה מלאה, למשל: adb shell getprop");
      return;
    }

    if (/^reboot(\s|$)/i.test(rest)) {
      const target = rest.replace(/^reboot\s*/i, "").trim();
      const power = adbService.requireDevice().power;
      log.cmd(text);
      if (!target) await power.reboot();
      else if (target === "recovery") await power.recovery();
      else if (target === "bootloader") await power.bootloader();
      else if (target === "fastboot") await power.fastboot();
      else if (target === "sideload") await power.sideload();
      else await power.reboot(target);
      log.ok("פקודת האתחול נשלחה.");
      return;
    }

    if (/^install(\s|$)/i.test(rest)) {
      const file = await pickFiles({ accept: ".apk" });
      if (!file) return log.warn("לא נבחר קובץ.");
      return ops.installApk(file);
    }

    if (/^uninstall\s+/i.test(rest)) {
      return uninstallPackage(rest.replace(/^uninstall\s+/i, "").trim());
    }

    if (/^pull\s+/i.test(rest)) {
      return ops.pullToDisk(rest.replace(/^pull\s+/i, "").trim().split(/\s+/)[0]);
    }

    if (/^push(\s|$)/i.test(rest)) {
      log.warn("להעלאת קובץ השתמש בפקודה 'העלה קובץ למכשיר' — הדפדפן חייב דיאלוג בחירת קובץ.");
      return;
    }

    if (/^logcat(\s|$)/i.test(rest)) {
      return adbService.shell(`${rest} -d -t 200`.replace(/logcat/, "logcat"));
    }

    // ברירת מחדל — מריצים כ-shell
    return adbService.shell(rest);
  }

  /* --- בלי קידומת: shell גולמי --- */
  return adbService.shell(text);
}
