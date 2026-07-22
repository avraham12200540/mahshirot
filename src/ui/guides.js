/**
 * מדריכים — הפעלת ניפוי באגים, התקנת דרייברים, מדריך ומקורות, פרטים ומשוב.
 * כל התוכן בעברית, מוצג בתוך מודאלים מעוצבים בתוך האתר.
 */

import { el } from "../core/dom.js";
import { openModal } from "./modal.js";
import { log } from "../core/logger.js";
import { browserName, isChromiumBased, isWebUsbSupported } from "../core/usb.js";

const ZADIG_URL = "https://zadig.akeo.ie/";
const GOOGLE_USB_DRIVER_URL = "https://developer.android.com/studio/run/win-usb";
const PLATFORM_TOOLS_URL = "https://developer.android.com/tools/releases/platform-tools";
const YUME_CHAN_URL = "https://github.com/yume-chan/ya-webadb";
const FASTBOOT_JS_URL = "https://github.com/kdrag0n/fastboot.js";
const WEBUSB_URL = "https://developer.mozilla.org/en-US/docs/Web/API/WebUSB_API";

/** בונה רשימת שלבים ממוספרת. */
function steps(items) {
  return el(
    "div.steps",
    {},
    items.map((html) => el("div.step", {}, [el("div.step__num"), el("div.step__text", { html })])),
  );
}

/** קישור חיצוני בטוח. */
function link(href, text) {
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
}

/* ==========================================================================
   הפעלת ניפוי באגים ב-USB
   ========================================================================== */

export function openDebuggingGuide() {
  const body = el("div", {}, [
    el("p", {
      text: "כדי שהאתר יוכל לתקשר עם המכשיר, צריך להפעיל את מצב המפתחים ואת ניפוי הבאגים ב-USB. זה תהליך חד-פעמי:",
    }),
    steps([
      'פתח את <strong>הגדרות</strong> במכשיר ← <strong>אודות הטלפון</strong>.',
      'לחץ <strong>7 פעמים ברצף</strong> על <strong>מספר הבילד</strong> (Build number). תופיע הודעה "אתה עכשיו מפתח".',
      'חזור אחורה ← <strong>מערכת</strong> ← <strong>אפשרויות מפתחים</strong> (בחלק מהמכשירים זה ישירות בהגדרות).',
      'הפעל את <strong>ניפוי באגים ב-USB</strong> (USB debugging).',
      'מומלץ להפעיל גם <strong>ביטול נעילת OEM</strong> (OEM unlocking) — נדרש לפתיחת בוטלואדר.',
      'חבר את המכשיר למחשב בכבל <strong>שתומך בהעברת נתונים</strong> (לא כבל טעינה בלבד).',
      'במסך הטלפון יקפוץ חלון <strong>"לאפשר ניפוי באגים ב-USB?"</strong> — סמן "תמיד אפשר ממחשב זה" ולחץ <strong>אישור</strong>.',
      'חזור לאתר ולחץ על <strong>"בדוק דרייברים"</strong> — ובחר את המכשיר ברשימה שתיפתח.',
    ]),
    el("div.banner.banner--info", { style: { marginTop: "14px" } }, [
      el("div.banner__content", {}, [
        el("div", {
          html: "<strong>טיפ:</strong> אם חלון האישור לא קופץ בטלפון — נסה לנתק ולחבר מחדש את הכבל, או לבחור באפשרות 'העברת קבצים (MTP)' בהתראת ה-USB.",
        }),
      ]),
    ]),
  ]);

  return openModal({
    title: "הפעלת ניפוי באגים ב-USB",
    body,
    iconName: "smartphone",
    wide: true,
    buttons: [{ label: "הבנתי", value: null, variant: "primary", primary: true }],
  });
}

/* ==========================================================================
   התקנת דרייברים
   ========================================================================== */

export function openDriversGuide() {
  log.info("נפתח מדריך התקנת הדרייברים.");

  const body = el("div", {}, [
    el("p", {
      html: `WebUSB יכול לדבר עם המכשיר רק אם ממשק ה-USB שלו רשום במערכת כ-<strong>WinUSB</strong>. ברוב מכשירי אנדרואיד זה עובד מיד; אם המכשיר לא מופיע ברשימת הבחירה של הדפדפן — צריך להחליף את הדרייבר.`,
    }),

    el("div.banner.banner--warn", { style: { margin: "12px 0" } }, [
      el("div.banner__content", {}, [
        el("div.banner__title", { text: "לפני שמתחילים" }),
        el("div", {
          text: "אם ADB מותקן אצלך במחשב ורץ ברקע — הוא תופס את המכשיר וחוסם את הדפדפן. סגור אותו לפני שממשיכים.",
        }),
      ]),
    ]),

    el("h3", { text: "אפשרות 1 — Zadig (מומלץ, ל-ADB ול-Fastboot)", style: { marginTop: "16px", fontSize: "15px" } }),
    steps([
      `הורד את ${link(ZADIG_URL, "Zadig")} — כלי חינמי וקטן, לא דורש התקנה.`,
      "חבר את המכשיר למחשב ווודא שניפוי באגים ב-USB מופעל.",
      'ב-Zadig: תפריט <strong>Options</strong> ← סמן <strong>List All Devices</strong>.',
      'ברשימה הנפתחת בחר את המכשיר — לרוב יופיע כ-<strong>"Android ADB Interface"</strong>, <strong>"Android Bootloader Interface"</strong> או בשם הדגם.',
      'בשדה הדרייבר (משמאל לחץ Replace Driver) בחר <strong>WinUSB</strong>.',
      'לחץ <strong>Replace Driver</strong> והמתן לסיום (יכול לקחת דקה).',
      'נתק וחבר מחדש את הכבל, ואז לחץ באתר על <strong>"בדוק דרייברים"</strong>.',
    ]),

    el("div.riskbox", {}, [
      el("div.riskbox__title", { text: "⚠️ זהירות ב-Zadig" }),
      el("ul", {}, [
        el("li", {
          text: "בחר אך ורק את הממשק של מכשיר האנדרואיד. החלפת דרייבר של מכשיר אחר (עכבר, מקלדת, דיסק) תשבית אותו.",
        }),
        el("li", {
          text: "אחרי החלפת הדרייבר, ADB הרגיל במחשב עלול להפסיק לזהות את המכשיר. אפשר לשחזר דרך מנהל ההתקנים ← עדכן דרייבר.",
        }),
      ]),
    ]),

    el("h3", { text: "אפשרות 2 — דרייבר USB של גוגל (למכשירי Pixel/Nexus)", style: { marginTop: "16px", fontSize: "15px" } }),
    steps([
      `הורד את ${link(GOOGLE_USB_DRIVER_URL, "Google USB Driver")} מהאתר הרשמי של אנדרואיד.`,
      "פתח את <strong>מנהל ההתקנים</strong> של Windows (לחיצה ימנית על תפריט התחל ← מנהל ההתקנים).",
      "מצא את המכשיר — לרוב תחת 'התקנים אחרים' עם סימן קריאה צהוב.",
      "לחיצה ימנית ← <strong>עדכן מנהל התקן</strong> ← <strong>בחר מתוך רשימה</strong> ← <strong>יש לי דיסק</strong>.",
      "נווט לתיקייה שחילצת ובחר את הקובץ <strong>android_winusb.inf</strong>.",
      "אשר את ההתקנה, נתק וחבר את הכבל, וחזור לאתר.",
    ]),

    el("h3", { text: "מכשיר במצב Fastboot לא מזוהה?", style: { marginTop: "16px", fontSize: "15px" } }),
    el("p", {
      text: "מצב Fastboot הוא ממשק USB נפרד לגמרי מ-ADB — הוא דורש דרייבר משלו. אם ADB עובד אבל Fastboot לא: אתחל את המכשיר לבוטלואדר, ואז הרץ שוב את Zadig ובחר את הממשק החדש שהופיע (Android Bootloader Interface).",
    }),
  ]);

  return openModal({
    title: "התקנת דרייברים",
    body,
    iconName: "settings",
    tone: "warn",
    wide: true,
    buttons: [
      { label: "פתח את Zadig", value: "zadig", variant: "violet" },
      { label: "סגור", value: null, variant: "ghost", primary: true },
    ],
  }).then((v) => {
    if (v === "zadig") {
      window.open(ZADIG_URL, "_blank", "noopener,noreferrer");
      log.info("נפתח דף ההורדה של Zadig בלשונית חדשה.");
    }
  });
}

/* ==========================================================================
   מדריך ומקורות
   ========================================================================== */

export function openSourcesGuide() {
  const supported = isWebUsbSupported() && isChromiumBased();

  const body = el("div", {}, [
    el("h3", { text: "איך זה עובד?", style: { fontSize: "15px", marginBottom: "6px" } }),
    el("p", {
      html: `האתר משתמש ב-${link(WEBUSB_URL, "WebUSB API")} של הדפדפן כדי לדבר <strong>ישירות</strong> עם המכשיר דרך כבל ה-USB. פרוטוקול ADB ופרוטוקול Fastboot ממומשים במלואם ב-JavaScript שרץ בדפדפן — <strong>לא צריך להתקין ADB במחשב, ואין שום חלון CMD</strong>. כל פקודה ופלט מוצגים בפאנל הלוג למטה בלבד.`,
    }),

    el("h3", { text: "דרישות", style: { fontSize: "15px", marginTop: "14px", marginBottom: "6px" } }),
    el("ul", {}, [
      el("li", { html: "דפדפן מבוסס <strong>Chromium</strong>: Chrome, Edge או Opera. (Safari ו-Firefox לא תומכים ב-WebUSB.)" }),
      el("li", { text: "כבל USB שתומך בהעברת נתונים." }),
      el("li", { text: "'ניפוי באגים ב-USB' מופעל במכשיר." }),
      el("li", { text: "ב-Windows: דרייבר WinUSB לממשק המכשיר." }),
    ]),

    el("div", { class: supported ? "banner banner--ok" : "banner banner--danger", style: { margin: "12px 0" } }, [
      el("div.banner__content", {}, [
        el("div", {
          text: supported
            ? `✅ ${browserName()} תומך ב-WebUSB — הכל מוכן לעבודה.`
            : `❌ ${browserName()} לא תומך ב-WebUSB. עבור ל-Chrome, Edge או Opera.`,
        }),
      ]),
    ]),

    el("h3", { text: "מקורות וקוד פתוח", style: { fontSize: "15px", marginTop: "14px", marginBottom: "6px" } }),
    el("p", { text: "האתר נבנה על גבי הפרויקטים הבאים:" }),
    el("ul", {}, [
      el("li", { html: `${link(YUME_CHAN_URL, "@yume-chan/ya-webadb")} — מימוש פרוטוקול ADB ב-JavaScript (הבסיס ל-ADB באתר).` }),
      el("li", { html: `${link(FASTBOOT_JS_URL, "kdrag0n/fastboot.js")} — מימוש פרוטוקול Fastboot ב-JavaScript (אותה ספרייה שמריצה את flash.android.com).` }),
      el("li", { html: `${link(PLATFORM_TOOLS_URL, "Android Platform Tools")} — התיעוד הרשמי של ADB ו-Fastboot.` }),
      el("li", { html: `${link(ZADIG_URL, "Zadig")} — כלי החלפת דרייברים ל-WinUSB.` }),
    ]),

    el("h3", { text: "מונחים", style: { fontSize: "15px", marginTop: "14px", marginBottom: "6px" } }),
    el("ul", {}, [
      el("li", { html: "<strong>ADB</strong> — Android Debug Bridge. מדבר עם המכשיר כשהמערכת פועלת." }),
      el("li", { html: "<strong>Fastboot</strong> — מדבר עם הבוטלואדר לפני שהמערכת עולה. משמש לצריבה." }),
      el("li", { html: "<strong>בוטלואדר</strong> — התוכנה שמעלה את מערכת ההפעלה. כשהוא נעול, אי אפשר לצרוב." }),
      el("li", { html: "<strong>Recovery</strong> — מצב שחזור לאיפוס והתקנת עדכונים." }),
      el("li", { html: "<strong>boot.img</strong> — קובץ הקרנל. הרוט מושתל בו בדרך כלל." }),
      el("li", { html: "<strong>vbmeta</strong> — אימות שלמות המערכת. לרוב צריך להשבית אותו כשמשתילים רוט." }),
    ]),
  ]);

  return openModal({
    title: "מדריך ומקורות",
    body,
    iconName: "book",
    wide: true,
    buttons: [{ label: "סגור", value: null, variant: "primary", primary: true }],
  });
}

/* ==========================================================================
   פרטים ומשוב
   ========================================================================== */

export function openAboutModal() {
  const body = el("div", {}, [
    el("div.riskbox", {}, [
      el("div.riskbox__title", { text: "⚠️ חובה לקרוא לפני השימוש" }),
      el("ul", {}, [
        el("li", { text: "פתיחת בוטלואדר מוחקת את כל הנתונים במכשיר. גבה הכל לפני." }),
        el("li", { text: "צריבת קובץ לא תואם עלולה להפוך את המכשיר ללבנה (brick)." }),
        el("li", { text: "פתיחת בוטלואדר עלולה לבטל את האחריות ולהשבית שירותים כמו תשלומים ובנקאות." }),
        el("li", { text: "כל פעולה באתר מתבצעת באחריותך הבלעדית. המפתח לא אחראי לנזק כלשהו." }),
        el("li", { text: "אל תנתק את הכבל באמצע צריבה — זה הדרך הכי מהירה להשבית מכשיר." }),
      ]),
    ]),

    el("h3", { text: "על האתר", style: { fontSize: "15px", marginTop: "14px", marginBottom: "6px" } }),
    el("p", {
      html: "<strong>מכשירוט</strong> הוא כלי חינמי שמאפשר לשלוט במכשירי אנדרואיד דרך ADB ו-Fastboot ישירות מהדפדפן — בלי להתקין כלום ובלי חלון CMD שחור. הכל רץ מקומית במחשב שלך; שום נתון לא נשלח לשום שרת.",
    }),

    el("h3", { text: "פרטיות", style: { fontSize: "15px", marginTop: "14px", marginBottom: "6px" } }),
    el("p", {
      text: "האתר הוא אתר סטטי לחלוטין. אין שרת, אין מסד נתונים, ואין איסוף נתונים. מפתח ה-ADB שנוצר לאימות המכשיר נשמר רק ב-IndexedDB של הדפדפן שלך.",
    }),

    el("h3", { text: "יצירת קשר ומשוב", style: { fontSize: "15px", marginTop: "14px", marginBottom: "6px" } }),
    el("p", {
      html: `נבנה על ידי <strong>${link("https://shlomoraviv.github.io/Raviv-Digital/", "שלמה רביב — רביב דיגיטל")}</strong> — מפתח תוכנות ואפליקציות. מבצע צריבות גרסאות למכשירים ונגנים בתשלום ועוד.<br>
      מייל: ${link("mailto:0556798858b@gmail.com", "0556798858b@gmail.com")}<br>
      אתר: ${link("https://shlomoraviv.github.io/Raviv-Digital/", "shlomoraviv.github.io/Raviv-Digital")}`,
    }),

    el("h3", { text: "קרדיטים", style: { fontSize: "15px", marginTop: "14px", marginBottom: "6px" } }),
    el("p", {
      html: `תודה מיוחדת ל<strong>פב״ב הראשון</strong>, ולעוד הרבה משתמשים שתרמו פקודות, תיקונים ומשוב שעזרו לאתר להגיע למקום שהוא נמצא בו היום. את מדריך הפקודות המלא שלו אפשר לראות בהמשך העמוד, בקטע ${link("#pavv-guide", "״מדריך הפקודות המלא״")}.`,
    }),
  ]);

  return openModal({
    title: "פרטים ומשוב",
    body,
    iconName: "info",
    tone: "warn",
    wide: true,
    buttons: [{ label: "קראתי והבנתי", value: null, variant: "primary", primary: true }],
  });
}
