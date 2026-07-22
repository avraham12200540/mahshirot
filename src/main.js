/**
 * מכשירוט — נקודת הכניסה.
 * נבנה על ידי שלמה רביב — מפתח תוכנות ואפליקציות.
 *
 * ADB ו-Fastboot ישירות מהדפדפן דרך WebUSB. בלי התקנה, בלי חלון CMD.
 */

import "./styles/themes.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/header.css";
import "./styles/search.css";
import "./styles/cards.css";
import "./styles/buttons.css";
import "./styles/log-panel.css";
import "./styles/modal.css";
import "./styles/banner.css";
import "./styles/file-manager.css";
import "./styles/footer.css";
import "./styles/pavv-section.css";
import "./styles/responsive.css";

import { el, svg, $ } from "./core/dom.js";
import { icon } from "./ui/icons.js";
import { log } from "./core/logger.js";
import { isWebUsbSupported, isChromiumBased, browserName } from "./core/usb.js";
import { adbService } from "./core/adb-service.js";
import { fastbootService } from "./core/fastboot-service.js";

import { createHeader, applyTheme, currentTheme } from "./ui/header.js";
import { createToolbar } from "./ui/toolbar.js";
import { createMainCards } from "./ui/cards.js";
import { createLogPanel } from "./ui/log-panel.js";
import { createFooter } from "./ui/footer.js";
import { createPavvSection } from "./ui/pavv-section.js";
import { openSourcesGuide, openAboutModal, openDebuggingGuide } from "./ui/guides.js";

/* ==========================================================================
   באנר תמיכת דפדפן
   ========================================================================== */

function browserBanner() {
  const supported = isWebUsbSupported();
  const chromium = isChromiumBased();

  if (supported && chromium) {
    // תמיכה מלאה — באנר עדין בלבד, ניתן לסגירה
    const banner = el("div.banner.banner--info.banner--browser", {}, [
      svg(icon("info", 16)),
      el("div.banner__content", {}, [
        el("div", {
          html: `האתר עובד ישירות מול המכשיר דרך <strong>WebUSB</strong> — אין צורך להתקין ADB ואין חלון CMD. כל פקודה ופלט מוצגים בפאנל הלוג למטה.`,
        }),
      ]),
      el("button.banner__close", {
        html: icon("x", 11),
        "aria-label": "סגור",
        on: { click: () => banner.remove() },
      }),
    ]);
    return banner;
  }

  // אין WebUSB — הודעה חוסמת ומוסברת, לא alert() גנרי
  return el("div.banner.banner--danger.banner--browser", {}, [
    svg(icon("alert", 16)),
    el("div.banner__content", {}, [
      el("div.banner__title", { text: `${browserName()} לא תומך ב-WebUSB` }),
      el("div", {
        html: supported
          ? "הדפדפן מדווח על תמיכה חלקית. לתוצאה אמינה השתמש ב-<strong>Chrome</strong>, <strong>Edge</strong> או <strong>Opera</strong>."
          : "האתר דורש WebUSB, ש-<strong>Safari ו-Firefox לא תומכים בו</strong>. פתח את האתר ב-<strong>Chrome</strong>, <strong>Edge</strong> או <strong>Opera</strong> כדי להשתמש בו.",
      }),
    ]),
  ]);
}

/* ==========================================================================
   שורת הפעולות מתחת לכרטיסיות
   ========================================================================== */

function actionsRow() {
  const guideBtn = el("button.btn.btn--lg.btn--primary", { "data-tip": "איך זה עובד, דרישות, ומקורות" }, [
    svg(icon("book", 15)),
    document.createTextNode("מדריך ומקורות"),
  ]);
  guideBtn.addEventListener("click", () => openSourcesGuide());

  const debugBtn = el("button.btn.btn--lg.btn--outline", { "data-tip": "איך מפעילים ניפוי באגים ב-USB" }, [
    svg(icon("smartphone", 15)),
    document.createTextNode("הפעלת ניפוי באגים"),
  ]);
  debugBtn.addEventListener("click", () => openDebuggingGuide());

  return el("div.actions-row", {}, [guideBtn, debugBtn]);
}

function pinnedWarning() {
  const banner = el("div.banner.banner--warn.banner--pinned", {}, [
    el("div.banner__content", {}, [
      el("div", { html: "⚠️ חובה לקרוא את <strong>פרטים ומשוב</strong> לפני השימוש!" }),
    ]),
  ]);
  banner.style.cursor = "pointer";
  banner.addEventListener("click", () => openAboutModal());
  return banner;
}

/* ==========================================================================
   הרכבה
   ========================================================================== */

function mount() {
  applyTheme(currentTheme());

  const app = $("#app");

  const cards = createMainCards();

  const { toolbar, results } = createToolbar({
    onScrollToCards: () => cards.scrollIntoView({ behavior: "smooth", block: "start" }),
  });

  const main = el("main.main", {}, [
    el("div.container", {}, [
      browserBanner(),
      toolbar,
      results,
      cards,
      actionsRow(),
      pinnedWarning(),
      createPavvSection(),
    ]),
  ]);

  const { panel } = createLogPanel();

  app.append(el("div.topbar"), createHeader(), main, createFooter(), panel);

  /* ---------- הודעות פתיחה ---------- */

  log.info("ברוך הבא למכשירוט — כלי ADB/Fastboot שרץ כולו בדפדפן.");

  if (!isWebUsbSupported()) {
    log.err(`${browserName()} לא תומך ב-WebUSB. יש לפתוח את האתר ב-Chrome, Edge או Opera.`);
  } else if (!isChromiumBased()) {
    log.warn("הדפדפן לא מזוהה כמבוסס Chromium — ייתכנו תקלות. מומלץ Chrome, Edge או Opera.");
  } else {
    log.ok(`${browserName()} תומך ב-WebUSB — מוכן לעבודה.`);
    log.info("חבר מכשיר בכבל נתונים, הפעל 'ניפוי באגים ב-USB', ולחץ על 'בדוק דרייברים'.");
  }

  /* ---------- חיבור אוטומטי למכשיר שכבר אושר ---------- */

  if (isWebUsbSupported()) {
    reconnectSilently();

    // חיבור/ניתוק פיזי של הכבל
    navigator.usb.addEventListener("connect", () => {
      log.info("מכשיר USB חובר.");
      if (!adbService.connected) reconnectSilently();
    });

    navigator.usb.addEventListener("disconnect", () => {
      log.warn("מכשיר USB נותק.");
      if (fastbootService.connected) fastbootService.disconnect();
    });
  }

  /* ---------- קיצורי מקלדת ---------- */

  document.addEventListener("keydown", (e) => {
    // Ctrl/Cmd+K — מיקוד בחיפוש
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      $(".search__input")?.focus();
    }
    // Ctrl/Cmd+L — מיקוד בשורת הפקודה
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
      e.preventDefault();
      $(".logpanel__input")?.focus();
    }
  });
}

/** מנסה להתחבר בשקט למכשיר שכבר אושר בעבר — בלי לפתוח חלון בחירה. */
async function reconnectSilently() {
  try {
    const manager = adbService.manager;
    if (!manager) return;
    const devices = await manager.getDevices();
    if (!devices.length) return;

    log.info(`נמצא מכשיר שאושר בעבר (${devices[0].name || devices[0].serial}) — מתחבר…`);
    await adbService.connect({ prompt: false });
  } catch {
    // אין מכשיר או שהוא תפוס — לא שגיאה, המשתמש יכול להתחבר ידנית
  }
}

mount();
