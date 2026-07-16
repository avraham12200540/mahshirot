/**
 * ארבע הכרטיסיות הראשיות — חיבור, בוטלואדר, צריבה ורוט, ניהול.
 * בדיוק לפי חלוקת העיצוב המקורי.
 */

import { el, svg } from "../core/dom.js";
import { icon } from "./icons.js";
import { log, describeError } from "../core/logger.js";
import { adbService } from "../core/adb-service.js";
import { fastbootService } from "../core/fastboot-service.js";
import * as ops from "../core/adb-ops.js";
import { riskModal, confirmModal } from "./modal.js";
import { toastErr, toastOk, toastWarn } from "./toast.js";
import { openDriversGuide } from "./guides.js";
import { openFileManager } from "./file-manager.js";
import { checkAdbDevices, checkFastbootDevices, checkDrivers } from "./connection-actions.js";
import { flashPartition, uninstallPackage, pickFiles } from "../data/commands.js";

/* ==========================================================================
   עזרים
   ========================================================================== */

/**
 * עוטף handler של כפתור: מצב טעינה, תפיסת שגיאות, ודיווח ללוג.
 * שום שגיאה לא בורחת לקונסול בלי שתופיע בלוג.
 */
function action(button, handler) {
  button.addEventListener("click", async () => {
    if (button.classList.contains("btn--busy")) return;
    button.classList.add("btn--busy");
    try {
      await handler();
    } catch (error) {
      const message = describeError(error);
      log.err(message);
      toastErr(message.length > 90 ? "הפעולה נכשלה — ראה את הלוג למטה." : message);
    } finally {
      button.classList.remove("btn--busy");
    }
  });
  return button;
}

/** כפתור עם אייקון, טולטיפ ווריאנט. */
function btn(label, { variant = "", iconName = "", tip = "", block = true } = {}) {
  return el(
    "button.btn",
    {
      class: [variant && `btn--${variant}`, block && "btn--block"].filter(Boolean).join(" "),
      "data-tip": tip || null,
    },
    [iconName && svg(icon(iconName, 14)), document.createTextNode(label)].filter(Boolean),
  );
}

/** שלד כרטיסייה עם כותרת וקו הדגשה אדום. */
function card(title, iconName, children) {
  return el("section.card", {}, [
    el("div.card__head", {}, [
      el("h2.card__title", {}, [svg(icon(iconName, 17)), document.createTextNode(title)]),
      el("div.card__rule"),
    ]),
    el("div.card__body", {}, children),
  ]);
}

/* ==========================================================================
   1. כרטיסיית חיבור
   ========================================================================== */

function connectionCard() {
  const status = el("div.status", {}, [
    el("span.status__dot"),
    el("span.status__text", { text: "לא מחובר" }),
  ]);

  function refreshStatus() {
    const adbOn = adbService.connected;
    const fbOn = fastbootService.connected;

    status.classList.remove("status--online", "status--fastboot", "status--error");

    if (adbOn) {
      status.classList.add("status--online");
      status.querySelector(".status__text").textContent = `מחובר ב-ADB — ${adbService.serial}`;
    } else if (fbOn) {
      status.classList.add("status--fastboot");
      status.querySelector(".status__text").textContent = "מחובר במצב Fastboot";
    } else {
      status.querySelector(".status__text").textContent = "לא מחובר";
    }
  }

  adbService.subscribe(refreshStatus);
  fastbootService.subscribe(refreshStatus);
  refreshStatus();

  const installDrivers = btn("התקן דרייברים", {
    variant: "violet",
    iconName: "settings",
    tip: "הוראות להחלפת הדרייבר ל-WinUSB — נדרש כדי ש-WebUSB יזהה את המכשיר.",
  });
  action(installDrivers, () => openDriversGuide());

  const testDrivers = btn("בדוק דרייברים", {
    variant: "green",
    iconName: "check",
    tip: "מנסה להתחבר למכשיר דרך WebUSB ומדווח בלוג אם הזיהוי הצליח.",
  });
  action(testDrivers, () => checkDrivers());

  const adbCheck = btn("בדיקת ADB", {
    iconName: "smartphone",
    tip: "מקביל ל-adb devices — מציג את המכשירים במצב ADB ואת הסטטוס שלהם.",
  });
  action(adbCheck, () => checkAdbDevices());

  const recovery = btn("Recovery", {
    iconName: "refresh",
    tip: "מקביל ל-adb reboot recovery — מאתחל את המכשיר למצב שחזור.",
  });
  action(recovery, async () => {
    log.cmd("adb reboot recovery");
    await adbService.requireDevice().power.recovery();
    log.ok("המכשיר מאתחל ל-Recovery.");
    toastOk("המכשיר מאתחל ל-Recovery.");
  });

  const fastbootBtn = btn("Fastboot", {
    iconName: "flame",
    tip: "מקביל ל-adb reboot bootloader — מאתחל את המכשיר למצב Fastboot.",
  });
  action(fastbootBtn, async () => {
    log.cmd("adb reboot bootloader");
    await adbService.requireDevice().power.bootloader();
    log.ok("המכשיר מאתחל לבוטלואדר. המתן כ-10 שניות ואז לחץ 'בדיקת Fastboot'.");
    toastOk("המכשיר מאתחל לבוטלואדר.");
  });

  const fastbootCheck = btn("בדיקת Fastboot", {
    iconName: "search",
    tip: "מקביל ל-fastboot devices — בודק אם מזוהה מכשיר במצב Fastboot.",
  });
  action(fastbootCheck, () => checkFastbootDevices());

  return card("חיבור", "plug", [
    status,
    installDrivers,
    testDrivers,
    el("div.btn-row", {}, [adbCheck, fastbootCheck]),
    el("div.btn-row", {}, [recovery, fastbootBtn]),
    el("div.card__hint", {
      text: "חבר את המכשיר בכבל נתונים, הפעל 'ניפוי באגים ב-USB', ולחץ 'בדוק דרייברים'.",
    }),
  ]);
}

/* ==========================================================================
   2. כרטיסיית בוטלואדר
   ========================================================================== */

function bootloaderCard() {
  const statusBox = el("div.status", {}, [
    el("span.status__dot"),
    el("span.status__text", { text: "סטטוס לא ידוע" }),
  ]);

  const checkBtn = btn("בדוק סטטוס", {
    variant: "primary",
    iconName: "search",
    tip: "בודק אם הבוטלואדר נעול או פתוח (fastboot getvar unlocked / oem device-info).",
  });

  action(checkBtn, async () => {
    statusBox.classList.remove("status--online", "status--error", "status--fastboot");
    statusBox.classList.add("status--busy");
    statusBox.querySelector(".status__text").textContent = "בודק…";

    try {
      const unlocked = await fastbootService.getVariable("unlocked");
      let isUnlocked = null;

      if (unlocked === "yes") isUnlocked = true;
      else if (unlocked === "no") isUnlocked = false;

      // לא כל יצרן חושף את 'unlocked' — נופלים ל-oem device-info
      if (isUnlocked === null) {
        log.info("המשתנה 'unlocked' לא נתמך — מנסה 'fastboot oem device-info'…");
        try {
          const info = await fastbootService.runCommand("oem device-info");
          if (/unlocked:\s*true/i.test(info)) isUnlocked = true;
          else if (/unlocked:\s*false/i.test(info)) isUnlocked = false;
        } catch {
          log.warn("גם 'oem device-info' לא נתמך במכשיר הזה.");
        }
      }

      statusBox.classList.remove("status--busy");

      if (isUnlocked === true) {
        statusBox.classList.add("status--fastboot");
        statusBox.querySelector(".status__text").textContent = "🔓 הבוטלואדר פתוח";
        log.ok("הבוטלואדר פתוח (unlocked).");
      } else if (isUnlocked === false) {
        statusBox.classList.add("status--online");
        statusBox.querySelector(".status__text").textContent = "🔒 הבוטלואדר נעול";
        log.ok("הבוטלואדר נעול (locked).");
      } else {
        statusBox.classList.add("status--error");
        statusBox.querySelector(".status__text").textContent = "לא ניתן לקבוע";
        log.warn("לא ניתן לקבוע את מצב הבוטלואדר במכשיר הזה.");
      }
    } catch (error) {
      statusBox.classList.remove("status--busy");
      statusBox.classList.add("status--error");
      statusBox.querySelector(".status__text").textContent = "שגיאה בבדיקה";
      throw error;
    }
  });

  const unlockBtn = btn("פתיחה", {
    variant: "orange",
    iconName: "unlock",
    tip: "פותח את הבוטלואדר. מוחק את כל נתוני המכשיר!",
  });

  action(unlockBtn, async () => {
    const ok = await riskModal({
      title: "פתיחת בוטלואדר",
      what: "פתיחת הבוטלואדר מאפשרת לצרוב קבצים למכשיר — אבל המחיר כבד.",
      risks: [
        "כל הנתונים במכשיר יימחקו לחלוטין — תמונות, אפליקציות, חשבונות והכל.",
        "האחריות של היצרן עלולה להתבטל.",
        "שירותי תשלום ובנקאות (Google Pay, אפליקציות בנק) עלולים להפסיק לעבוד.",
        "המכשיר יציג אזהרה בכל אתחול.",
        "יש להפעיל קודם 'ביטול נעילת OEM' באפשרויות מפתחים.",
      ],
      typeWord: "פתח",
      confirmLabel: "פתח את הבוטלואדר",
    });

    if (!ok) return log.info("פתיחת הבוטלואדר בוטלה.");

    log.info("שולח פקודת פתיחה… אשר את הפעולה במסך המכשיר בעזרת מקשי הווליום וההפעלה.");

    // יצרנים שונים מממשים את זה אחרת — מנסים את שתי הגרסאות
    try {
      await fastbootService.runCommand("flashing unlock");
    } catch (error) {
      log.warn(`'flashing unlock' נכשל (${describeError(error)}) — מנסה 'oem unlock'…`);
      await fastbootService.runCommand("oem unlock");
    }

    toastWarn("אשר את הפתיחה במסך המכשיר.");
  });

  const lockBtn = btn("נעילה", {
    variant: "danger",
    iconName: "lock",
    tip: "נועל בחזרה את הבוטלואדר. מוחק את כל נתוני המכשיר!",
  });

  action(lockBtn, async () => {
    const ok = await riskModal({
      title: "נעילת בוטלואדר",
      what: "נעילת הבוטלואדר מחזירה את המכשיר למצב מוגן.",
      risks: [
        "כל הנתונים במכשיר יימחקו לחלוטין.",
        "אם מותקנת במכשיר מערכת מותאמת (custom ROM) או רוט — הנעילה עלולה להשבית את המכשיר לצמיתות!",
        "נעל רק אם המכשיר מריץ מערכת מקורית לגמרי של היצרן.",
      ],
      typeWord: "נעל",
      confirmLabel: "נעל את הבוטלואדר",
    });

    if (!ok) return log.info("נעילת הבוטלואדר בוטלה.");

    log.info("שולח פקודת נעילה… אשר את הפעולה במסך המכשיר.");

    try {
      await fastbootService.runCommand("flashing lock");
    } catch (error) {
      log.warn(`'flashing lock' נכשל (${describeError(error)}) — מנסה 'oem lock'…`);
      await fastbootService.runCommand("oem lock");
    }

    toastWarn("אשר את הנעילה במסך המכשיר.");
  });

  return card("בוטלואדר", "lock", [
    statusBox,
    checkBtn,
    el("div.btn-row", {}, [unlockBtn, lockBtn]),
    el("div.card__hint", {
      text: "פעולות אלו דורשות שהמכשיר יהיה במצב Fastboot. הן מוחקות את כל הנתונים.",
    }),
  ]);
}

/* ==========================================================================
   3. כרטיסיית צריבה ורוט
   ========================================================================== */

/** אזור העלאה לפרטישן — גרירה או לחיצה. */
function partitionZone(name, partition, { tip, extraNote } = {}) {
  const fileLabel = el("span.dropzone__file", { text: "לא נבחר קובץ" });

  const zone = el(
    "div.dropzone",
    {
      "data-tip": tip,
      role: "button",
      tabindex: "0",
    },
    [
      el("div.dropzone__label", {}, [el("span.dropzone__name", { text: name }), fileLabel]),
      el("span.btn.btn--sm.btn--outline", {}, [svg(icon("upload", 12))]),
    ],
  );

  let picked = null;

  async function doFlash(file) {
    if (!file) return;
    picked = file;
    fileLabel.textContent = file.name;
    zone.classList.add("dropzone--loaded");

    const ok = await riskModal({
      title: `צריבת ${partition}`,
      what: `הקובץ '${file.name}' ייצרב לפרטישן '${partition}'.${extraNote ? " " + extraNote : ""}`,
      risks: [
        "צריבת קובץ שלא מתאים בדיוק לדגם ולגרסה שלך עלולה להשבית את המכשיר לצמיתות.",
        "הבוטלואדר חייב להיות פתוח, אחרת הצריבה תיכשל.",
        "אל תנתק את הכבל במהלך הצריבה.",
        "ודא שיש למכשיר סוללה מספקת.",
      ],
      typeWord: "צרוב",
      confirmLabel: `צרוב ל-${partition}`,
    });

    if (!ok) {
      log.info("הצריבה בוטלה על ידי המשתמש.");
      return;
    }

    try {
      await fastbootService.flash(partition, file);
      toastOk(`'${partition}' נצרב בהצלחה.`);
    } catch (error) {
      const message = describeError(error);
      log.err(`הצריבה נכשלה: ${message}`);
      toastErr("הצריבה נכשלה — ראה את הלוג.");
    }
  }

  zone.addEventListener("click", async () => {
    const file = await pickFiles({ accept: ".img" });
    await doFlash(file);
  });

  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      zone.click();
    }
  });

  // גרירה ושחרור
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("dropzone--over");
  });

  zone.addEventListener("dragleave", () => zone.classList.remove("dropzone--over"));

  zone.addEventListener("drop", async (e) => {
    e.preventDefault();
    zone.classList.remove("dropzone--over");
    const file = e.dataTransfer?.files?.[0];
    if (file) await doFlash(file);
  });

  return zone;
}

function flashCard() {
  const rebootBtn = btn("הפעלה מחדש", {
    variant: "primary",
    iconName: "power",
    tip: "בחר לאיזה מצב לאתחל את המכשיר.",
  });

  const menu = el("div.dropdown__menu.hidden", {}, [
    menuItem("מערכת (רגיל)", "power", "", "מאתחל את המכשיר למערכת ההפעלה הרגילה."),
    menuItem("בוטלואדר", "flame", "bootloader", "מאתחל למצב Fastboot/בוטלואדר."),
    menuItem("Recovery", "refresh", "recovery", "מאתחל למצב שחזור."),
    menuItem("Fastbootd", "zap", "fastboot", "מאתחל ל-Fastboot של המערכת (userspace)."),
  ]);

  function menuItem(label, iconName, target, tip) {
    const item = el("button.dropdown__item", { "data-tip": tip }, [
      svg(icon(iconName, 13)),
      document.createTextNode(label),
    ]);

    item.addEventListener("click", async () => {
      menu.classList.add("hidden");
      try {
        // אם יש חיבור fastboot פעיל — משתמשים בו; אחרת דרך ADB
        if (fastbootService.connected) {
          await fastbootService.reboot(target);
        } else if (adbService.connected) {
          const power = adbService.requireDevice().power;
          log.cmd(`adb reboot${target ? " " + target : ""}`);
          if (!target) await power.reboot();
          else if (target === "recovery") await power.recovery();
          else if (target === "bootloader") await power.bootloader();
          else if (target === "fastboot") await power.fastboot();
          log.ok("פקודת האתחול נשלחה.");
        } else {
          throw new Error("אין מכשיר מחובר — לא ב-ADB ולא ב-Fastboot.");
        }
        toastOk("פקודת האתחול נשלחה.");
      } catch (error) {
        const message = describeError(error);
        log.err(message);
        toastErr(message.length > 90 ? "האתחול נכשל — ראה את הלוג." : message);
      }
    });

    return item;
  }

  const dropdown = el("div.dropdown", {}, [rebootBtn, menu]);

  rebootBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target)) menu.classList.add("hidden");
  });

  return card("צריבה ורוט", "flame", [
    partitionZone("boot.img", "boot", {
      tip: "צורב את קובץ הקרנל. כאן מושתל הרוט (Magisk) ברוב המקרים.",
    }),
    partitionZone("vbmeta.img", "vbmeta", {
      tip: "צורב את vbmeta — אימות שלמות המערכת. נדרש להשתלת רוט.",
      extraNote: "מומלץ להשתמש בקובץ vbmeta ריק כדי לנטרל את האימות.",
    }),
    partitionZone("ik.img (init_boot)", "init_boot", {
      tip: "צורב את init_boot — באנדרואיד 13+ הרוט מושתל כאן במקום ב-boot.",
    }),
    partitionZone("dtbo.img", "dtbo", {
      tip: "צורב את dtbo — עץ ההתקנים. נדרש בחלק ממכשירים לאחר צריבת קרנל.",
    }),
    dropdown,
    el("div.card__hint", {
      text: "גרור קובץ או לחץ לבחירה. כל צריבה דורשת אישור מפורש.",
    }),
  ]);
}

/* ==========================================================================
   4. כרטיסיית ניהול
   ========================================================================== */

function manageCard() {
  const managerBtn = btn("מנהל", {
    variant: "orange",
    iconName: "folder",
    tip: "פותח מנהל קבצים לניווט, הורדה והעלאה של קבצים במכשיר.",
  });
  action(managerBtn, () => openFileManager());

  const pkgInput = el("input.field__input", {
    type: "text",
    placeholder: "com.whatsapp",
    spellcheck: "false",
    autocomplete: "off",
    "aria-label": "שם חבילה",
    style: { direction: "ltr", textAlign: "start" },
  });

  const deleteBtn = btn("מחק", {
    variant: "danger",
    iconName: "trash",
    tip: "מקביל ל-adb uninstall — מוחק את האפליקציה ששמה הוקלד בשדה.",
  });

  action(deleteBtn, async () => {
    const pkg = pkgInput.value.trim();
    if (!pkg) {
      log.err("לא הוזן שם חבילה. הקלד למשל com.whatsapp בשדה 'שם חבילה'.");
      toastErr("הזן שם חבילה קודם.");
      pkgInput.focus();
      return;
    }
    await uninstallPackage(pkg);
  });

  pkgInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") deleteBtn.click();
  });

  const listBtn = btn("רשימת אפליקציות", {
    iconName: "list",
    tip: "מציג את כל האפליקציות שהמשתמש התקין — כדי למצוא שם חבילה.",
  });
  action(listBtn, () => adbService.shell("pm list packages -3"));

  const batchBtn = btn("התקנה מרובה", {
    variant: "green",
    iconName: "package",
    tip: "בחר כמה קבצי APK בבת אחת — כולם יותקנו בזה אחר זה.",
  });

  action(batchBtn, async () => {
    const files = await pickFiles({ accept: ".apk", multiple: true });
    if (!files.length) return log.warn("לא נבחרו קבצים.");

    const ok = await confirmModal({
      title: "התקנה מרובה",
      message: `להתקין ${files.length} קבצי APK במכשיר? ההתקנה תתבצע אחד אחרי השני, וההתקדמות תוצג בלוג.`,
      confirmLabel: `התקן ${files.length} קבצים`,
      iconName: "package",
    });

    if (!ok) return log.info("ההתקנה המרובה בוטלה.");

    const { ok: succeeded, failed } = await ops.installMany(files);
    failed === 0
      ? toastOk(`כל ${succeeded} הקבצים הותקנו.`)
      : toastWarn(`${succeeded} הותקנו, ${failed} נכשלו — ראה את הלוג.`);
  });

  return card("ניהול", "settings", [
    managerBtn,
    el("div.field", {}, [el("label.field__label", { text: "שם חבילה" }), pkgInput]),
    el("div.btn-row", {}, [deleteBtn, listBtn]),
    batchBtn,
    el("div.card__hint", {
      text: "לא יודע את שם החבילה? לחץ 'רשימת אפליקציות' וחפש אותה בלוג.",
    }),
  ]);
}

/* ==========================================================================
   ייצוא
   ========================================================================== */

export function createMainCards() {
  return el("div.cards-grid", { id: "cards" }, [
    connectionCard(),
    bootloaderCard(),
    flashCard(),
    manageCard(),
  ]);
}
