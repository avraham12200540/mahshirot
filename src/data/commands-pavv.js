/**
 * קטלוג פקודות פב"ב הראשון — תרומת קהילה, משולב בעיצוב ובמנוע ההרצה של האתר.
 * כל פקודה כאן רצה דרך אותו מנוע WebUSB בדיוק כמו שאר הפקודות באתר.
 * פקודות שמייצגות מושגי adb-CLI/שרת שאין להם מקבילה ב-WebUSB (כמו adb connect,
 * adb pair, adb forward) מסומנות כפקודות "העתקה" בלבד — להרצה במחשב עם adb מותקן.
 */

import { adbService } from "../core/adb-service.js";
import { fastbootService } from "../core/fastboot-service.js";
import * as ops from "../core/adb-ops.js";
import { log } from "../core/logger.js";
import { promptModal, riskModal } from "../ui/modal.js";
import { shq } from "../core/dom.js";

const sh = (command) => () => adbService.shell(command);
const fb = (command) => () => fastbootService.runCommand(command);

/** בודק שהטקסט הוא בדיוק כתובת MAC בפורמט TT:TT:TT:TT:TT:TT — שער בטיחות לפני הזרקה ל-sed/setprop. */
function isMacAddress(value) {
  return /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/.test(value.trim());
}

/** בוחר קובץ אחד או יותר מהמחשב (זהה לעזר המקביל ב-data/commands.js). */
function pickFiles({ accept = "", multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = "none";

    input.addEventListener("change", () => {
      const files = [...(input.files ?? [])];
      input.remove();
      resolve(multiple ? files : (files[0] ?? null));
    });
    input.addEventListener("cancel", () => {
      input.remove();
      resolve(multiple ? [] : null);
    });

    document.body.append(input);
    input.click();
  });
}

/** צריבת קובץ לפרטישן ספציפי, כולל בחירת קובץ ואזהרת סיכון (זהה לעזר המקביל ב-data/commands.js). */
function flashRun(partition, extraNote = "") {
  return async () => {
    const file = await pickFiles({ accept: ".img,.bin" });
    if (!file) {
      log.warn("לא נבחר קובץ.");
      return;
    }

    const approved = await riskModal({
      title: `צריבת ${partition}`,
      what: `הקובץ '${file.name}' ייצרב לפרטישן '${partition}' במכשיר.${extraNote ? " " + extraNote : ""}`,
      risks: [
        "צריבת קובץ לא תואם למכשיר עלולה להשבית אותו לחלוטין (bricking).",
        "ודא שהקובץ מיועד בדיוק לדגם ולגרסה של המכשיר שלך.",
        "ודא שהבוטלואדר פתוח, אחרת הצריבה תיכשל.",
        "אל תנתק את הכבל במהלך הצריבה.",
      ],
      typeWord: "צרוב",
      confirmLabel: `צרוב ל-${partition}`,
    });
    if (!approved) {
      log.info("הצריבה בוטלה על ידי המשתמש.");
      return;
    }

    await fastbootService.flash(partition, file);
  };
}

function copyRun(text, note) {
  return async () => {
    try {
      await navigator.clipboard.writeText(text);
      log.ok(note);
    } catch {
      log.err("ההעתקה נכשלה — הדפדפן חסם גישה ללוח.");
    }
  };
}

/** פותח קישור למדריך חיצוני בטאב חדש. */
function openLinkRun(url, note) {
  return async () => {
    window.open(url, "_blank", "noopener,noreferrer");
    if (note) log.info(note);
  };
}

function shellRun(template, prompts) {
  return async () => {
    let command = template;
    for (const p of prompts) {
      const value = await promptModal({ title: p.title, label: p.label, hint: p.hint });
      if (!value) {
        log.warn("בוטל — לא הוזן ערך.");
        return;
      }
      command = command.split(p.token).join(shq(value));
    }
    log.cmd(`adb shell ${command}`);
    await adbService.shell(command);
  };
}

function fastbootRun(template, prompts) {
  return async () => {
    let command = template;
    for (const p of prompts) {
      const value = await promptModal({ title: p.title, label: p.label, hint: p.hint });
      if (!value) {
        log.warn("בוטל — לא הוזן ערך.");
        return;
      }
      command = command.split(p.token).join(shq(value));
    }
    log.cmd(`fastboot ${command}`);
    await fastbootService.runCommand(command);
  };
}

function pushRun() {
  return async () => {
    const file = await pickFiles();
    if (!file) {
      log.warn("לא נבחר קובץ.");
      return;
    }
    const remote = await promptModal({
      title: "נתיב יעד במכשיר",
      label: "נתיב מלא (כולל שם קובץ)",
      value: `/sdcard/${file.name}`,
      hint: "אפשר לערוך את הנתיב לפני ההעלאה.",
    });
    if (!remote) {
      log.warn("בוטל.");
      return;
    }
    await ops.pushFile(file, remote);
  };
}

function pullRun(defaultRemote) {
  return async () => {
    const remote = await promptModal({
      title: "נתיב מקור במכשיר",
      label: "נתיב מלא של הקובץ",
      value: defaultRemote,
      hint: "הקובץ יורד למחשב שלך.",
    });
    if (!remote) {
      log.warn("בוטל.");
      return;
    }
    await ops.pullToDisk(remote);
  };
}

function installRun() {
  return async () => {
    const file = await pickFiles({ accept: ".apk" });
    if (!file) {
      log.warn("לא נבחר קובץ.");
      return;
    }
    await ops.installApk(file);
  };
}

function installMultiRun() {
  return async () => {
    const files = await pickFiles({ accept: ".apk", multiple: true });
    if (!files.length) {
      log.warn("לא נבחרו קבצים.");
      return;
    }
    await ops.installMany(files);
  };
}

function restoreRun() {
  return async () => {
    const file = await pickFiles({ accept: ".ab" });
    if (!file) {
      log.warn("לא נבחר קובץ.");
      return;
    }
    await ops.restore(file);
  };
}

export const PAVV_CATEGORIES = [
  {
    id: "pavv-1",
    name: "בסיס וחיבור (פב״ב הראשון)",
    icon: "plug",
    commands: [
      {
        id: "pavv-1-1",
        label: "בדיקת מכשירים מחוברים",
        tip: "מציג את כל המכשירים שמחוברים כעת למחשב ומזוהים על ידי ה-ADB, כולל פרטים מזהים נוספים כמו דגם וחיבור. פקודת בדיקה בסיסית. טובה לאימות שהמחשב אכן מזהה את המכשיר.",
        cmd: "adb devices -l",
        mode: "adb",
        run: copyRun("adb devices -l", "פקודת adb CLI/שרת שרצה מול מחשב — אין לה מקבילה ב-WebUSB בדפדפן. הפקודה הועתקה ללוח, הרץ אותה בטרמינל עם adb מותקן."),
      },
      {
        id: "pavv-1-2",
        label: "רשימת מכשירים מהירה",
        tip: "מציג רשימת מכשירים מחוברים ללא פרטי הרחבה. טוב לבדיקה מהירה כאשר לא צריך פרטים נוספים.",
        cmd: "adb devices",
        mode: "adb",
        run: copyRun("adb devices", "פקודת adb CLI/שרת שרצה מול מחשב — אין לה מקבילה ב-WebUSB בדפדפן. הפקודה הועתקה ללוח, הרץ אותה בטרמינל עם adb מותקן."),
      },
      {
        id: "pavv-1-3",
        label: "הפעלה מחדש",
        tip: "מכבה ומפעיל את המכשיר מחדש למצב רגיל. שימושי כאשר המכשיר תקוע חלקית אך עדיין מגיב ל-ADB.",
        cmd: "adb reboot",
        mode: "adb",
        run: async () => {
      log.cmd("adb reboot");
      await adbService.requireDevice().power.reboot();
      log.ok("פקודת אתחול נשלחה.");
    },
      },
      {
        id: "pavv-1-4",
        label: "הפעלה למצב שחזור",
        tip: "מפעיל את המכשיר מחדש ישירות למצב Recovery. מיועד למצבים של תחזוקה, התקנה או שחזור, בהתאם ליכולות המכשיר.",
        cmd: "adb reboot recovery",
        mode: "adb",
        run: async () => {
      log.cmd("adb reboot recovery");
      await adbService.requireDevice().power.recovery();
      log.ok("המכשיר מאתחל ל-Recovery.");
    },
      },
      {
        id: "pavv-1-5",
        label: "הפעלה למצב Sideload",
        tip: "מאתחל ישירות למצב Sideload בתוך Recovery — מוכן לקבל קובץ OTA.zip דרך ADB. שימושי להתקנת עדכוני מערכת ידנית. לאחר האתחול יש להריץ adb sideload OTA.zip מהמחשב.",
        cmd: "adb reboot sideload",
        mode: "adb",
        run: async () => {
      log.cmd("adb reboot sideload");
      await adbService.requireDevice().power.sideload();
      log.ok("המכשיר מאתחל ל-Sideload.");
    },
      },
      {
        id: "pavv-1-6",
        label: "הפעלה למצב Bootloader",
        tip: "מפעיל את המכשיר מחדש למצב Bootloader או Fastboot. משמש בעיקר לצריבה, פתיחת Bootloader או תחזוקה מתקדמת.",
        cmd: "adb reboot bootloader",
        mode: "adb",
        run: async () => {
      log.cmd("adb reboot bootloader");
      await adbService.requireDevice().power.bootloader();
      log.ok("המכשיר מאתחל לבוטלואדר.");
    },
      },
      {
        id: "pavv-1-7",
        label: "הפעלת שרת ADB",
        tip: "מפעיל את שירות ADB במחשב המקומי. טוב כאשר השרת לא פועל או לאחר ניתוק/תקלה.",
        cmd: "adb start-server",
        mode: "adb",
        run: copyRun("adb start-server", "פקודת adb CLI/שרת שרצה מול מחשב — אין לה מקבילה ב-WebUSB בדפדפן. הפקודה הועתקה ללוח, הרץ אותה בטרמינל עם adb מותקן."),
      },
      {
        id: "pavv-1-8",
        label: "כיבוי שרת ADB",
        tip: "עוצר את שירות ADB במחשב. שימושי לפתרון תקלות זיהוי וחיבור, לפני הפעלה מחדש של השרת.",
        cmd: "adb kill-server",
        mode: "adb",
        run: copyRun("adb kill-server", "פקודת adb CLI/שרת שרצה מול מחשב — אין לה מקבילה ב-WebUSB בדפדפן. הפקודה הועתקה ללוח, הרץ אותה בטרמינל עם adb מותקן."),
      },
      {
        id: "pavv-1-9",
        label: "העברה למצב TCP/IP",
        tip: "מעביר את ADB במכשיר למצב האזנה דרך הרשת בפורט 5555. בדרך כלל מבצעים זאת כאשר המכשיר מחובר תחילה בכבל.",
        cmd: "adb tcpip 5555",
        mode: "adb",
        run: async () => {
      log.cmd("setprop service.adb.tcp.port 5555 && stop adbd && start adbd");
      await adbService.shell("setprop service.adb.tcp.port 5555 && stop adbd && start adbd", { quiet: true });
      log.ok("ה-ADB של המכשיר עבר למצב האזנה על פורט 5555 (Wi-Fi).");
    },
      },
      {
        id: "pavv-1-10",
        label: "מציאת כתובת IP של ממשק Wi-Fi",
        tip: "מציג פרטי רשת של הממשק wlan0 במכשירים שבהם ifconfig זמין במעטפת המכשיר. ⚠️ פקודה מיושנת — הוסרה מ-Android 6+. ב-Android 13 לא תעבוד. השתמש בפקודה 10 במקומה.",
        cmd: "adb shell ifconfig wlan0",
        mode: "adb",
        run: sh("ifconfig wlan0"),
      },
      {
        id: "pavv-1-11",
        label: "מציאת כתובת IP (השיטה המודרנית)",
        tip: "פקודה מודרנית ומומלצת יותר לאיתור כתובת ה‑IP של המכשיר ברשת.",
        cmd: "adb shell ip addr show wlan0",
        mode: "adb",
        run: sh("ip addr show wlan0"),
      },
      {
        id: "pavv-1-12",
        label: "התחברות אלחוטית עם מציין כללי",
        tip: "מתחבר למכשיר דרך הרשת. יש להחליף את XXX בכתובת ה-IP המתאימה. זו תבנית כפי שהופיעה במקור, ולכן נשמרה ללא שינוי.",
        cmd: "adb connect XXX:5555",
        mode: "adb",
        run: copyRun("adb connect XXX:5555", "פקודת adb CLI/שרת שרצה מול מחשב — אין לה מקבילה ב-WebUSB בדפדפן. הפקודה הועתקה ללוח, הרץ אותה בטרמינל עם adb מותקן."),
      },
      {
        id: "pavv-1-13",
        label: "התחברות אלחוטית עם Placeholder מפורש",
        tip: "מתחבר למכשיר דרך הרשת. יש להחליף את <IP_ADDRESS> בכתובת ה-IP של המכשיר. גם כאן נשמרה הנוסחה בדיוק כפי שהופיעה במקור.",
        cmd: "adb connect <IP_ADDRESS>:5555",
        mode: "adb",
        run: copyRun("adb connect <IP_ADDRESS>:5555", "פקודת adb CLI/שרת שרצה מול מחשב — אין לה מקבילה ב-WebUSB בדפדפן. הפקודה הועתקה ללוח, הרץ אותה בטרמינל עם adb מותקן."),
      },
      {
        id: "pavv-1-14",
        label: "צימוד לחיבור אלחוטי מאובטח",
        tip: "מצמד את המחשב למכשיר לצורך Wireless debugging מאובטח בדגמים וגרסאות שתומכים בכך. פקודה מודרנית ושימושית במיוחד במכשירים חדשים יותר.",
        cmd: "adb pair <HOST>:<PORT> <PAIRING_CODE>",
        mode: "adb",
        run: copyRun("adb pair <HOST>:<PORT> <PAIRING_CODE>", "פקודת adb CLI/שרת שרצה מול מחשב — אין לה מקבילה ב-WebUSB בדפדפן. הפקודה הועתקה ללוח, הרץ אותה בטרמינל עם adb מותקן."),
      },
      {
        id: "pavv-1-15",
        label: "שליפת מספר סידורי",
        tip: "מציג את המספר הסידורי של המכשיר שמחובר כעת. שימושי כאשר מחוברים כמה מכשירים וצריך לזהות מי הוא מי.",
        cmd: "adb get-serialno",
        mode: "adb",
        run: async () => {
      const serial = adbService.requireDevice().serial;
      log.ok(`מספר סידורי: ${serial}`);
    },
      },
      {
        id: "pavv-1-16",
        label: "כיבוי ADB דרך הגדרות מערכת",
        tip: "מנסה לכבות את מצב ניפוי הבאגים דרך ערך מערכת גלובלי. פקודה זו תלויה בהרשאות ובמדיניות המכשיר.",
        cmd: "adb shell settings put global adb_enabled 0",
        mode: "adb",
        run: sh("settings put global adb_enabled 0"),
      },
      {
        id: "pavv-1-17",
        label: "שליחת קובץ למכשיר עם מציין כללי",
        tip: "מעתיק קובץ מהמחשב אל המכשיר. יש להחליף את שני ה-XXX בנתיבים המתאימים. נשמרת התבנית המקורית כפי שהופיעה.",
        cmd: "adb push XXX /sdcard/XXX",
        mode: "adb",
        run: pushRun(),
      },
      {
        id: "pavv-1-18",
        label: "משיכת קובץ מהמכשיר",
        tip: "מעתיק קובץ מהמכשיר אל התיקייה הנוכחית במחשב. יש להחליף את XXX בשם או בנתיב המתאים. הנקודה בסוף מציינת את התיקייה הנוכחית במחשב.",
        cmd: "adb pull /sdcard/XXX .",
        mode: "adb",
        run: pullRun("/sdcard/"),
      },
      {
        id: "pavv-1-19",
        label: "בדיקת גרסת ADB",
        tip: "מציג את גרסת ADB שמותקנת במחשב. שימושי כאשר בודקים תאימות או חושדים בגרסה מיושנת.",
        cmd: "adb version",
        mode: "adb",
        run: copyRun("adb version", "פקודת adb CLI/שרת שרצה מול מחשב — אין לה מקבילה ב-WebUSB בדפדפן. הפקודה הועתקה ללוח, הרץ אותה בטרמינל עם adb מותקן."),
      },
      {
        id: "pavv-1-20",
        label: "הצגת עזרה כללית",
        tip: "מציג את רשימת האפשרויות והפקודות הנתמכות על ידי הכלי. מתאים כאשר צריך לרענן תחביר או לבדוק קיום של פקודה מסוימת.",
        cmd: "adb help",
        mode: "adb",
        run: copyRun("adb help", "פקודת adb CLI/שרת שרצה מול מחשב — אין לה מקבילה ב-WebUSB בדפדפן. הפקודה הועתקה ללוח, הרץ אותה בטרמינל עם adb מותקן."),
      },
      {
        id: "pavv-1-21",
        label: "המתנה למכשיר (Wait-for-device)",
        tip: "ממתין עד שמכשיר יהיה זמין לחיבור ADB. שימושי מאוד בסקריפטים אוטומטיים — מונע שגיאות \"device not found\".",
        cmd: "adb wait-for-device",
        mode: "adb",
        run: copyRun("adb wait-for-device", "פקודת adb CLI/שרת שרצה מול מחשב — אין לה מקבילה ב-WebUSB בדפדפן. הפקודה הועתקה ללוח, הרץ אותה בטרמינל עם adb מותקן."),
      },
      {
        id: "pavv-1-22",
        label: "בדיקת מצב החיבור",
        tip: "מציג את מצב החיבור הנוכחי של המכשיר, למשל device או offline. טוב לאבחון ראשוני כאשר adb devices לא נותן תמונה מספקת.",
        cmd: "adb get-state",
        mode: "adb",
        run: async () => {
      log.ok(adbService.connected ? "device" : "offline");
    },
      },
      {
        id: "pavv-1-23",
        label: "בדיקת נתיב התקן",
        tip: "מציג את נתיב ההתקן כפי ש-ADB רואה אותו במערכת. יותר שימושי לאבחון מתקדם ופחות לשימוש יומיומי.",
        cmd: "adb get-devpath",
        mode: "adb",
        run: copyRun("adb get-devpath", "פקודת adb CLI/שרת שרצה מול מחשב — אין לה מקבילה ב-WebUSB בדפדפן. הפקודה הועתקה ללוח, הרץ אותה בטרמינל עם adb מותקן."),
      },
      {
        id: "pavv-1-24",
        label: "החזרה לחיבור USB",
        tip: "מחזיר את daemon של ADB במכשיר לעבודה דרך USB במקום TCP/IP. שימושי אחרי חיבור אלחוטי כאשר רוצים לחזור לחיבור כבל רגיל.",
        cmd: "adb usb",
        mode: "adb",
        run: async () => {
      log.cmd("setprop service.adb.tcp.port -1 && stop adbd && start adbd");
      await adbService.shell("setprop service.adb.tcp.port -1 && stop adbd && start adbd", { quiet: true });
      log.ok("ה-ADB של המכשיר חזר למצב USB בלבד.");
    },
      },
      {
        id: "pavv-1-25",
        label: "ניתוק כל חיבורי הרשת",
        tip: "מנתק את כל חיבורי ה-ADB דרך הרשת. טוב לניקוי חיבורים תקועים או לא רצויים.",
        cmd: "adb disconnect",
        mode: "adb",
        run: copyRun("adb disconnect", "פקודת adb CLI/שרת שרצה מול מחשב — אין לה מקבילה ב-WebUSB בדפדפן. הפקודה הועתקה ללוח, הרץ אותה בטרמינל עם adb מותקן."),
      },
      {
        id: "pavv-1-26",
        label: "ניתוק חיבור רשת מסוים",
        tip: "מנתק חיבור רשת מסוים. יש להחליף את XXX בכתובת המתאימה. נשמרה התבנית המקורית בדיוק כפי שנכתבה.",
        cmd: "adb disconnect XXX:5555",
        mode: "adb",
        run: copyRun("adb disconnect XXX:5555", "פקודת adb CLI/שרת שרצה מול מחשב — אין לה מקבילה ב-WebUSB בדפדפן. הפקודה הועתקה ללוח, הרץ אותה בטרמינל עם adb מותקן."),
      },
      {
        id: "pavv-1-27",
        label: "חיבור מחדש כללי",
        tip: "מנסה לבצע חיבור מחדש ליעדי ADB. יכול לעזור במצבים של ניתוקים או מעבר מצב.",
        cmd: "adb reconnect",
        mode: "adb",
        run: copyRun("adb reconnect", "פקודת adb CLI/שרת שרצה מול מחשב — אין לה מקבילה ב-WebUSB בדפדפן. הפקודה הועתקה ללוח, הרץ אותה בטרמינל עם adb מותקן."),
      },
      {
        id: "pavv-1-28",
        label: "חיבור מחדש למכשיר",
        tip: "מנסה לבצע חיבור מחדש מצד המכשיר. שימושי באבחון מתקדם של ערוץ התקשורת.",
        cmd: "adb reconnect device",
        mode: "adb",
        run: copyRun("adb reconnect device", "פקודת adb CLI/שרת שרצה מול מחשב — אין לה מקבילה ב-WebUSB בדפדפן. הפקודה הועתקה ללוח, הרץ אותה בטרמינל עם adb מותקן."),
      },
      {
        id: "pavv-1-29",
        label: "חיבור מחדש למכשיר Offline",
        tip: "מנסה לחבר מחדש רק מכשירים שנמצאים במצב offline. מתאים כאשר המחשב מזהה את המכשיר אך החיבור אינו פעיל.",
        cmd: "adb reconnect offline",
        mode: "adb",
        run: copyRun("adb reconnect offline", "פקודת adb CLI/שרת שרצה מול מחשב — אין לה מקבילה ב-WebUSB בדפדפן. הפקודה הועתקה ללוח, הרץ אותה בטרמינל עם adb מותקן."),
      },
      {
        id: "pavv-1-30",
        label: "העברת פורט ממחשב למכשיר (Port Forward)",
        tip: "מעביר תעבורה מפורט מקומי במחשב לפורט במכשיר. שימושי לדיבוג אפליקציות ורשתות, חיבור לשרת שרץ במכשיר.",
        cmd: "adb forward tcp:PORT tcp:PORT",
        mode: "adb",
        run: copyRun("adb forward tcp:PORT tcp:PORT", "פקודת adb CLI/שרת שרצה מול מחשב — אין לה מקבילה ב-WebUSB בדפדפן. הפקודה הועתקה ללוח, הרץ אותה בטרמינל עם adb מותקן."),
      },
      {
        id: "pavv-1-31",
        label: "רשימת כל ה-Port Forwards הפעילים",
        tip: "מציג את כל הגשרים הפעילים בין פורטים במחשב לפורטים במכשיר.",
        cmd: "adb forward --list",
        mode: "adb",
        run: copyRun("adb forward --list", "פקודת adb CLI/שרת שרצה מול מחשב — אין לה מקבילה ב-WebUSB בדפדפן. הפקודה הועתקה ללוח, הרץ אותה בטרמינל עם adb מותקן."),
      },
      {
        id: "pavv-1-32",
        label: "מחיקת כל ה-Port Forwards",
        tip: "מסיר את כל הגשרים הפעילים של Port Forward בבת אחת.",
        cmd: "adb forward --remove-all",
        mode: "adb",
        run: copyRun("adb forward --remove-all", "פקודת adb CLI/שרת שרצה מול מחשב — אין לה מקבילה ב-WebUSB בדפדפן. הפקודה הועתקה ללוח, הרץ אותה בטרמינל עם adb מותקן."),
      },
      {
        id: "pavv-1-33",
        label: "העברת פורט הפוכה — ממכשיר למחשב (Reverse)",
        tip: "מאפשר למכשיר לגשת לשרת שרץ על המחשב. שימושי לפיתוח — האפליקציה במכשיר מתחברת ל-localhost:PORT ומגיעה לשרת הפיתוח על המחשב.",
        cmd: "adb reverse tcp:PORT tcp:PORT",
        mode: "adb",
        run: copyRun("adb reverse tcp:PORT tcp:PORT", "פקודת adb CLI/שרת שרצה מול מחשב — אין לה מקבילה ב-WebUSB בדפדפן. הפקודה הועתקה ללוח, הרץ אותה בטרמינל עם adb מותקן."),
      },
      {
        id: "pavv-1-34",
        label: "ניתוק USB ללא ניתוק פיזי (Detach)",
        tip: "מנתק את המכשיר מ-ADB ברמה הלוגית מבלי לנתק את כבל ה-USB פיזית. מאפשר לתוכנות אחרות להשתמש במכשיר. לחיבור מחדש השתמש ב-adb attach.",
        cmd: "adb detach",
        mode: "adb",
        run: copyRun("adb detach", "פקודת adb CLI/שרת שרצה מול מחשב — אין לה מקבילה ב-WebUSB בדפדפן. הפקודה הועתקה ללוח, הרץ אותה בטרמינל עם adb מותקן."),
      },
      {
        id: "pavv-1-35",
        label: "חיבור מחדש לאחר Detach (Attach)",
        tip: "מחבר מחדש מכשיר USB שנותק לוגית עם adb detach.",
        cmd: "adb attach",
        mode: "adb",
        run: copyRun("adb attach", "פקודת adb CLI/שרת שרצה מול מחשב — אין לה מקבילה ב-WebUSB בדפדפן. הפקודה הועתקה ללוח, הרץ אותה בטרמינל עם adb מותקן."),
      },
      {
        id: "pavv-1-36",
        label: "התקנת APK עם אישור כל ה-Permissions אוטומטית",
        tip: "מתקין APK ומאשר אוטומטית את כל הרשאות ה-runtime בלי שהמשתמש יצטרך לאשר ידנית. שימושי למכשירי ניהול ופריסה. מאשר רק הרשאות שהאפליקציה מגדירה ב-Manifest. לא מאשר הרשאות מיוחדות כמו WRITE_SECURE_SETTINGS.",
        cmd: "adb install -g XXX.apk",
        mode: "adb",
        run: installRun(),
      },
      {
        id: "pavv-1-37",
        label: "התקנת APK מפוצל (Split APK / install-multiple)",
        tip: "מתקין אפליקציה שמחולקת למספר קבצי APK (כגון base.apk + split_config.apk). שכיח ב-APKs שהורדו מ-APKPure, APKMirror ועוד.",
        cmd: "adb install-multiple base.apk split_config.apk",
        mode: "adb",
        run: installMultiRun(),
      },
      {
        id: "pavv-1-38",
        label: "Logcat — רק שגיאות (Error Level)",
        tip: "מציג רק הודעות ברמת Error ומעלה — מסנן את כל הרעש של DEBUG/INFO/WARN. שימושי לאיתור קריסות ושגיאות קריטיות. *:E = כל התגים, רמת Error בלבד. ניתן לשנות ל-*:W לכלול גם אזהרות.",
        cmd: "adb logcat *:E",
        mode: "adb",
        run: sh("logcat -d *:E"),
      },
      {
        id: "pavv-1-39",
        label: "הפעלת WiFi",
        tip: "הפעלת WiFi",
        cmd: "adb shell svc wifi enable",
        mode: "adb",
        run: sh("svc wifi enable"),
      },
      {
        id: "pavv-1-40",
        label: "כיבוי WiFi",
        tip: "כיבוי WiFi",
        cmd: "adb shell svc wifi disable",
        mode: "adb",
        run: sh("svc wifi disable"),
      },
      {
        id: "pavv-1-41",
        label: "הפעלת נתונים סלולריים",
        tip: "הפעלת נתונים סלולריים",
        cmd: "adb shell svc data enable",
        mode: "adb",
        run: sh("svc data enable"),
      },
      {
        id: "pavv-1-42",
        label: "כיבוי נתונים סלולריים",
        tip: "כיבוי נתונים סלולריים",
        cmd: "adb shell svc data disable",
        mode: "adb",
        run: sh("svc data disable"),
      },
      {
        id: "pavv-1-43",
        label: "כתובת IP נוכחית",
        tip: "כתובת IP נוכחית",
        cmd: "adb shell ip addr show wlan0",
        mode: "adb",
        run: sh("ip addr show wlan0"),
      },
      {
        id: "pavv-1-44",
        label: "מעבר למשתמש אחר",
        tip: "עובר למשתמש לפי ID. 0 = משתמש ראשי.",
        cmd: "adb shell am switch-user XXX",
        mode: "adb",
        run: shellRun("am switch-user XXX", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-1-45",
        label: "הפעלת משתמש (Start)",
        tip: "הפעלת משתמש (Start)",
        cmd: "adb shell am start-user XXX",
        mode: "adb",
        run: shellRun("am start-user XXX", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-1-46",
        label: "עצירת משתמש (Stop)",
        tip: "עצירת משתמש (Stop)",
        cmd: "adb shell am stop-user XXX",
        mode: "adb",
        run: shellRun("am stop-user XXX", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
    ],
  },
  {
    id: "pavv-2",
    name: "ניהול אפליקציות וחבילות (פב״ב הראשון)",
    icon: "package",
    commands: [
      {
        id: "pavv-2-1",
        label: "רשימת כל האפליקציות",
        tip: "מציג את כל שמות החבילות שמותקנות במכשיר.",
        cmd: "adb shell pm list packages",
        mode: "adb",
        run: sh("pm list packages"),
      },
      {
        id: "pavv-2-2",
        label: "רשימת אפליקציות מערכת בלבד",
        tip: "מציג רק את אפליקציות המערכת המובנות שהגיעו עם המכשיר או עם הרום.",
        cmd: "adb shell pm list packages -s",
        mode: "adb",
        run: sh("pm list packages -s"),
      },
      {
        id: "pavv-2-3",
        label: "רשימת אפליקציות משתמש בלבד",
        tip: "מציג רק אפליקציות שהותקנו על ידי המשתמש או מצד שלישי.",
        cmd: "adb shell pm list packages -3",
        mode: "adb",
        run: sh("pm list packages -3"),
      },
      {
        id: "pavv-2-4",
        label: "רשימת אפליקציות פעילות",
        tip: "מציג חבילות שמוגדרות כפעילות או זמינות לשימוש. תלוי גרסת Android; לא כל מכשיר מחזיר תוצאה זהה עם הדגל הזה.",
        cmd: "adb shell pm list packages -e",
        mode: "adb",
        run: sh("pm list packages -e"),
      },
      {
        id: "pavv-2-5",
        label: "רשימת אפליקציות מושבתות (מוקפאות)",
        tip: "מציג רק חבילות שהושבתו או הוקפאו בעבר.",
        cmd: "adb shell pm list packages -d",
        mode: "adb",
        run: sh("pm list packages -d"),
      },
      {
        id: "pavv-2-6",
        label: "הצגת נתיב התקנה (APK)",
        tip: "מציג לכל חבילה גם את הנתיב הפיזי של קובץ ה-APK במכשיר.",
        cmd: "adb shell pm list packages -f",
        mode: "adb",
        run: sh("pm list packages -f"),
      },
      {
        id: "pavv-2-7",
        label: "הצגת מקור ההתקנה (Installer)",
        tip: "מציג מאיזה מתקין או חנות הותקנה כל אפליקציה.",
        cmd: "adb shell pm list packages -i",
        mode: "adb",
        run: sh("pm list packages -i"),
      },
      {
        id: "pavv-2-8",
        label: "חיפוש אפליקציה לפי שם",
        tip: "מחפש חבילות לפי מילת מפתח. יש להחליף XXX במחרוזת הרצויה. ב-Windows בלי grep ייתכן שתצטרך כלי חלופי.",
        cmd: "adb shell pm list packages | grep XXX",
        mode: "adb",
        run: shellRun("pm list packages | grep XXX", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-2-9",
        label: "מציאת מיקום פיזי של אפליקציה ספציפית",
        tip: "מציג את הנתיב של חבילה מסוימת. יש להחליף XXX בשם החבילה המלא.",
        cmd: "adb shell pm path XXX",
        mode: "adb",
        run: shellRun("pm path XXX", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-2-10",
        label: "דוח טכני מלא על אפליקציה",
        tip: "שולף מידע טכני רחב על החבילה, רכיבים, הרשאות ופרטים נוספים. יש להחליף XXX בשם החבילה. הפלט עלול להיות ארוך מאוד.",
        cmd: "adb shell pm dump XXX",
        mode: "adb",
        run: shellRun("pm dump XXX", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-2-11",
        label: "התקנת אפליקציה (APK)",
        tip: "מתקין קובץ APK מהמחשב. יש להחליף XXX.apk בשם או בנתיב הקובץ.",
        cmd: "adb install XXX.apk",
        mode: "adb",
        run: installRun(),
      },
      {
        id: "pavv-2-12",
        label: "עדכון אפליקציה קיימת",
        tip: "מתקין APK על גבי אפליקציה קיימת ושומר בדרך כלל על נתוני המשתמש.",
        cmd: "adb install -r XXX.apk",
        mode: "adb",
        run: installRun(),
      },
      {
        id: "pavv-2-13",
        label: "הסרת אפליקציה מהמשתמש",
        tip: "מסיר את האפליקציה עבור המשתמש הראשי בלי למחוק בהכרח את קבצי המערכת המקוריים. פעולה זו עלולה להשפיע על יציבות אם מסירים רכיב חשוב.",
        cmd: "adb shell pm uninstall -k --user 0 XXX",
        mode: "adb",
        run: shellRun("pm uninstall -k --user 0 XXX", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-2-14",
        label: "איפוס אפליקציה וניקוי נתונים/מטמון",
        tip: "מוחק את נתוני האפליקציה ומחזיר אותה כמעט למצב של התקנה חדשה. מוחק הגדרות, מטמון ולעיתים גם התחברויות.",
        cmd: "adb shell pm clear XXX",
        mode: "adb",
        run: shellRun("pm clear XXX", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-2-15",
        label: "השבתת אפליקציה (הקפאה/Disable)",
        tip: "משבית את האפליקציה עבור המשתמש הראשי בלי למחוק אותה. מתאים להקפאה במקום הסרה.",
        cmd: "adb shell pm disable-user --user 0 XXX",
        mode: "adb",
        run: shellRun("pm disable-user --user 0 XXX", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-2-16",
        label: "הפעלת אפליקציה מוקפאת (Enable)",
        tip: "מבטל השבתה ומחזיר את האפליקציה לפעילות.",
        cmd: "adb shell pm enable XXX",
        mode: "adb",
        run: shellRun("pm enable XXX", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-2-17",
        label: "עצירה כפויה של אפליקציה (Force Stop)",
        tip: "סוגר את תהליך האפליקציה באופן מיידי. שימושי בעת תקיעה או לפני בדיקה מחדש.",
        cmd: "adb shell am force-stop XXX",
        mode: "adb",
        run: shellRun("am force-stop XXX", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-2-18",
        label: "פתיחת אפליקציה מרחוק",
        tip: "מנסה להפעיל אפליקציה לפי שם חבילה דרך קטגוריית ה-LAUNCHER. נדרש שם חבילה מדויק; בחלק מהאפליקציות אין פעילות ניתנת להפעלה בדרך זו.",
        cmd: "adb shell monkey -p XXX -c android.intent.category.LAUNCHER 1",
        mode: "adb",
        run: shellRun("monkey -p XXX -c android.intent.category.LAUNCHER 1", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-2-19",
        label: "הענקת הרשאה ידנית (Grant)",
        tip: "מעניק לאפליקציה הרשאה מסוימת ידנית דרך ADB. יש להחליף XXX בשם החבילה ו-YYY בשם ההרשאה. לא כל הרשאה ניתנת למתן ידני.",
        cmd: "adb shell pm grant XXX YYY",
        mode: "adb",
        run: shellRun("pm grant XXX YYY", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."},{"token":"YYY","title":"הזנת YYY","label":"YYY","hint":"יחליף את YYY בפקודה."}]),
      },
      {
        id: "pavv-2-20",
        label: "ביטול הרשאה קיימת (Revoke)",
        tip: "שולל הרשאה שניתנה לאפליקציה. יש להחליף XXX בשם החבילה ו-YYY בשם ההרשאה.",
        cmd: "adb shell pm revoke XXX YYY",
        mode: "adb",
        run: shellRun("pm revoke XXX YYY", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."},{"token":"YYY","title":"הזנת YYY","label":"YYY","hint":"יחליף את YYY בפקודה."}]),
      },
      {
        id: "pavv-2-21",
        label: "שחזור אפליקציה שהוסרה (Android 13)",
        tip: "משחזר אפליקציה שהוסרה עם pm uninstall --user 0 ללא factory reset. עובד ב-Android 8+.",
        cmd: "adb shell cmd package install-existing XXX",
        mode: "adb",
        run: shellRun("cmd package install-existing XXX", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-2-22",
        label: "רשימת כל האפליקציות כולל מוסרות",
        tip: "מציג את כל החבילות כולל אלו שהוסרו עם uninstall --user 0. שימושי לזיהוי מה ניתן לשחזור. חבילות עם הערת uninstalled ניתנות לשחזור עם install-existing.",
        cmd: "adb shell pm list packages -u",
        mode: "adb",
        run: sh("pm list packages -u"),
      },
      {
        id: "pavv-2-23",
        label: "פתיחת אפליקציה — שיטה מודרנית (Android 13)",
        tip: "הדרך המועדפת ב-Android 13 להפעלת אפליקציה לפי שם חבילה ו-Activity. מדויק יותר מ-monkey. יש להחליף XXX בשם החבילה ו-YYY בשם ה-Activity (למשל .MainActivity). ניתן לברר Activity עם pm dump XXX | grep -i activity.",
        cmd: "adb shell am start -n XXX/XXX.YYY",
        mode: "adb",
        run: shellRun("am start -n XXX/XXX.YYY", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."},{"token":"YYY","title":"הזנת YYY","label":"YYY","hint":"יחליף את YYY בפקודה."}]),
      },
      {
        id: "pavv-2-24",
        label: "רשימת כל המשתמשים",
        tip: "רשימת כל המשתמשים",
        cmd: "adb shell pm list users",
        mode: "adb",
        run: sh("pm list users"),
      },
      {
        id: "pavv-2-25",
        label: "יצירת משתמש חדש",
        tip: "יוצר משתמש חדש עם שם שתבחר. החלף XXX בשם הרצוי.",
        cmd: "adb shell pm create-user XXX",
        mode: "adb",
        run: shellRun("pm create-user XXX", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-2-26",
        label: "מחיקת משתמש",
        tip: "מוחק משתמש לפי מזהה (ID). קבל את ה-ID מרשימת המשתמשים.",
        cmd: "adb shell pm remove-user XXX",
        mode: "adb",
        run: shellRun("pm remove-user XXX", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-2-27",
        label: "מספר המשתמשים המקסימלי",
        tip: "מספר המשתמשים המקסימלי",
        cmd: "adb shell pm get-max-users",
        mode: "adb",
        run: sh("pm get-max-users"),
      },
      {
        id: "pavv-2-28",
        label: "ניקוי קאש מצלמה",
        tip: "מנקה את המטמון של אפליקציית המצלמה — פותר בעיות קריסה ואיטיות.",
        cmd: "adb shell pm clear com.android.camera2",
        mode: "adb",
        run: sh("pm clear com.android.camera2"),
      },
    ],
  },
  {
    id: "pavv-3",
    name: "הגדרות מערכת, תצוגה ו-DNS (פב״ב הראשון)",
    icon: "settings",
    commands: [
      {
        id: "pavv-3-1",
        label: "קריאת ערך הגדרה קיימת (Get)",
        tip: "קורא את הערך הנוכחי של הגדרה גלובלית. יש להחליף XXX בשם ההגדרה הרצויה. אם שם ההגדרה שגוי, ייתכן שיוחזר ערך ריק.",
        cmd: "adb shell settings get global XXX",
        mode: "adb",
        run: shellRun("settings get global XXX", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-3-2",
        label: "שינוי ערך הגדרה (Put)",
        tip: "כותב ערך חדש להגדרה גלובלית. יש להחליף XXX בשם ההגדרה ו-YYY בערך החדש. בחלק מהמכשירים או בגרסאות מסוימות השינוי לא תמיד ישפיע בפועל.",
        cmd: "adb shell settings put global XXX YYY",
        mode: "adb",
        run: shellRun("settings put global XXX YYY", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."},{"token":"YYY","title":"הזנת YYY","label":"YYY","hint":"יחליף את YYY בפקודה."}]),
      },
      {
        id: "pavv-3-3",
        label: "מחיקת הגדרת מערכת (Delete)",
        tip: "מוחק מפתח הגדרה גלובלי קיים. יש להחליף XXX בשם ההגדרה שרוצים למחוק. מחיקה של מפתח שגוי עלולה לשנות התנהגות מערכת.",
        cmd: "adb shell settings delete global XXX",
        mode: "adb",
        run: shellRun("settings delete global XXX", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-3-4",
        label: "מתן הרשאת כתיבה להגדרות מערכת",
        tip: "מעניק לאפליקציה הרשאת WRITE_SECURE_SETTINGS. יש להחליף XXX בשם החבילה. לא כל אפליקציה יודעת להשתמש בהרשאה הזאת נכון.",
        cmd: "adb shell pm grant XXX android.permission.WRITE_SECURE_SETTINGS",
        mode: "adb",
        run: shellRun("pm grant XXX android.permission.WRITE_SECURE_SETTINGS", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-3-5",
        label: "אימות הגדרת DNS",
        tip: "מאמת שה-DNS הוגדר נכון — מציג את המצב הנוכחי של ה-Private DNS.",
        cmd: "adb shell settings get global private_dns_mode",
        mode: "adb",
        run: sh("settings get global private_dns_mode"),
      },
      {
        id: "pavv-3-6",
        label: "הצגת רזולוציית מסך נוכחית",
        tip: "מדפיס את מידות המסך כפי שהמערכת מזהה כרגע.",
        cmd: "adb shell wm size",
        mode: "adb",
        run: sh("wm size"),
      },
      {
        id: "pavv-3-7",
        label: "שינוי רזולוציית מסך",
        tip: "כפיית רזולוציה חדשה. להחליף XXX במידות מתאימות, למשל 1080x1920. בחירה בערכים לא מתאימים עלולה לפגוע בתצוגה עד איפוס.",
        cmd: "adb shell wm size XXX",
        mode: "adb",
        run: shellRun("wm size XXX", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-3-8",
        label: "איפוס רזולוציה",
        tip: "מחזיר את הרזולוציה לברירת המחדל של היצרן.",
        cmd: "adb shell wm size reset",
        mode: "adb",
        run: sh("wm size reset"),
      },
      {
        id: "pavv-3-9",
        label: "שינוי DPI (צפיפות תצוגה)",
        tip: "משנה את גודל האלמנטים על המסך. להחליף XXX במספר, למשל 240. ערך קיצוני עלול לגרום לממשק להיראות לא תקין.",
        cmd: "adb shell wm density XXX",
        mode: "adb",
        run: shellRun("wm density XXX", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-3-10",
        label: "איפוס DPI",
        tip: "מחזיר את צפיפות המסך לברירת המחדל.",
        cmd: "adb shell wm density reset",
        mode: "adb",
        run: sh("wm density reset"),
      },
      {
        id: "pavv-3-11",
        label: "תיקון תצוגה בשוליים (Overscan)",
        tip: "מיועד במיוחד למסכים שבורים או חתוכים. להחליף XXX בערכים left,top,right,bottom. ⚠️ הוסרה ב-Android 11+ — לא עובדת ב-Android 13. לשימוש רק על Android 10 ומטה.",
        cmd: "adb shell wm overscan XXX",
        mode: "adb",
        run: shellRun("wm overscan XXX", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-3-12",
        label: "האצת אנימציות מערכת",
        tip: "גורם למכשיר להרגיש מהיר יותר על ידי קיצור זמני האנימציות.",
        cmd: "adb shell settings put global window_animation_scale 0.5",
        mode: "adb",
        run: sh("settings put global window_animation_scale 0.5"),
      },
      {
        id: "pavv-3-13",
        label: "כיבוי אנימציות לגמרי (מהירות מקסימלית)",
        tip: "מכבה את כל שלושת סוגי האנימציות — חלון, מעבר, ומשך אנימטור. נותן תחושת מכשיר מהיר מאוד.",
        cmd: "adb shell settings put global window_animation_scale 0",
        mode: "adb",
        run: sh("settings put global window_animation_scale 0"),
      },
      {
        id: "pavv-3-14",
        label: "סיבוב מסך מלא",
        tip: "כופה סיבוב תצוגה ב-90 מעלות. בדרך כלל נדרש גם לכבות סיבוב אוטומטי כדי שהשינוי יורגש.",
        cmd: "adb shell settings put system user_rotation 1",
        mode: "adb",
        run: sh("settings put system user_rotation 1"),
      },
      {
        id: "pavv-3-15",
        label: "הפעלת מצב טיסה מלא",
        tip: "מכבה Wi‑Fi, Bluetooth ורשת סלולרית בבת אחת, בשורת פקודה משולבת. ⚠️ ב-Android 13 לא עובד בלי הרשאת NETWORK_SETTINGS. נדרש Root או Device Owner.",
        cmd: "adb shell \"settings put global airplane_mode_on 1 && am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true && svc wifi disable && svc bluetooth disable\"",
        mode: "adb",
        run: sh("\"settings put global airplane_mode_on 1 && am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true && svc wifi disable && svc bluetooth disable\""),
      },
      {
        id: "pavv-3-16",
        label: "כיבוי מצב טיסה",
        tip: "מחזיר את המכשיר למצב קליטה רגיל. ⚠️ ב-Android 13 לא עובד בלי הרשאת NETWORK_SETTINGS. נדרש Root או Device Owner.",
        cmd: "adb shell \"settings put global airplane_mode_on 0 && am broadcast -a android.intent.action.AIRPLANE_MODE --ez state false\"",
        mode: "adb",
        run: sh("\"settings put global airplane_mode_on 0 && am broadcast -a android.intent.action.AIRPLANE_MODE --ez state false\""),
      },
      {
        id: "pavv-3-17",
        label: "הוספת טקסט במסך הנעילה",
        tip: "מציג הודעה מותאמת אישית על מסך הנעילה (למשל פרטי קשר במקרה של אובדן). יש להחליף את YOUR_TEXT בטקסט הרצוי.",
        cmd: "adb shell settings put secure lock_screen_owner_info \"YOUR_TEXT\" && adb shell settings put secure lock_screen_owner_info_enabled 1",
        mode: "adb",
        run: sh("settings put secure lock_screen_owner_info \"YOUR_TEXT\" && adb shell settings put secure lock_screen_owner_info_enabled 1"),
      },
      {
        id: "pavv-3-18",
        label: "הפעלת Dark Mode (מצב כהה) — Android 10+",
        tip: "מפעיל מצב כהה מערכתי ב-Android 10 ומעלה. עובד ב-Android 13 ללא Root.",
        cmd: "adb shell cmd uimode night yes",
        mode: "adb",
        run: sh("cmd uimode night yes"),
      },
      {
        id: "pavv-3-19",
        label: "שינוי גודל גופן (Font Scale)",
        tip: "משנה את גודל הטקסט במערכת. ערך 1.0 = רגיל, 1.3 = גדול, 0.85 = קטן.",
        cmd: "adb shell settings put system font_scale 1.3",
        mode: "adb",
        run: sh("settings put system font_scale 1.3"),
      },
      {
        id: "pavv-3-20",
        label: "שינוי בהירות מסך ידנית (0–255)",
        tip: "מגדיר בהירות מסך ידנית. 0 = כהה לחלוטין, 255 = בהיר מקסימום. מבטל בהירות אוטומטית. לשחזור בהירות אוטומטית: adb shell settings put system screen_brightness_mode 1",
        cmd: "adb shell settings put system screen_brightness 128",
        mode: "adb",
        run: sh("settings put system screen_brightness 128"),
      },
      {
        id: "pavv-3-21",
        label: "שינוי זמן כיבוי מסך",
        tip: "מגדיר את הזמן (במילישניות) עד שהמסך נכבה אוטומטית. דוגמאות: 30000=30 שניות, 60000=דקה, 300000=5 דקות, 1800000=30 דקות.",
        cmd: "adb shell settings put system screen_off_timeout 300000",
        mode: "adb",
        run: sh("settings put system screen_off_timeout 300000"),
      },
      {
        id: "pavv-3-22",
        label: "איפוס מסך + DPI בפקודה אחת",
        tip: "מחזיר רזולוציה וצפיפות תצוגה לברירות מחדל של המכשיר בפקודה משולבת אחת.",
        cmd: "adb shell wm size reset && adb shell wm density reset",
        mode: "adb",
        run: sh("wm size reset && adb shell wm density reset"),
      },
      {
        id: "pavv-3-23",
        label: "בדיקת מצב DNS הנוכחי",
        tip: "מציג את מצב ה-Private DNS המוגדר כרגע: off = כבוי, opportunistic = אוטומטי, hostname = שרת ספציפי.",
        cmd: "adb shell settings get global private_dns_mode",
        mode: "adb",
        run: sh("settings get global private_dns_mode"),
      },
      {
        id: "pavv-3-24",
        label: "בדיקת שרת DNS המוגדר",
        tip: "מציג את שם שרת ה-DNS הספציפי שהוגדר (למשל family.adguard-dns.com). ריק = לא הוגדר שרת ספציפי.",
        cmd: "adb shell settings get global private_dns_specifier",
        mode: "adb",
        run: sh("settings get global private_dns_specifier"),
      },
      {
        id: "pavv-3-25",
        label: "כיבוי Private DNS לחלוטין",
        tip: "מבטל לחלוטין את הגדרת ה-Private DNS — המכשיר יחזור להשתמש ב-DNS של הרשת (נתב/ספק). מבטל סינון AdGuard ודומיו.",
        cmd: "adb shell settings put global private_dns_mode off",
        mode: "adb",
        run: sh("settings put global private_dns_mode off"),
      },
      {
        id: "pavv-3-26",
        label: "החזרת DNS למצב אוטומטי (Opportunistic)",
        tip: "מחזיר את ה-DNS למצב אוטומטי — ינסה להשתמש ב-DNS מוצפן אם הרשת תומכת, אחרת יחזור ל-DNS רגיל.",
        cmd: "adb shell settings put global private_dns_mode opportunistic",
        mode: "adb",
        run: sh("settings put global private_dns_mode opportunistic"),
      },
      {
        id: "pavv-3-27",
        label: "מחיקת שרת DNS הספציפי",
        tip: "מוחק את שם שרת ה-DNS שהוגדר ידנית (כמו AdGuard). יש להפעיל לאחר פקודה 26 או 27 לאיפוס מלא.",
        cmd: "adb shell settings delete global private_dns_specifier",
        mode: "adb",
        run: sh("settings delete global private_dns_specifier"),
      },
      {
        id: "pavv-3-28",
        label: "ביטול סינון DNS — איפוס מלא בפקודה אחת",
        tip: "מכבה את ה-Private DNS ומוחק את שרת הסינון המוגדר — שתי הפעולות יחד בפקודה אחת.",
        cmd: "adb shell settings put global private_dns_mode off && adb shell settings delete global private_dns_specifier",
        mode: "adb",
        run: sh("settings put global private_dns_mode off && adb shell settings delete global private_dns_specifier"),
      },
      {
        id: "pavv-3-29",
        label: "בדיקת מצב WiFi",
        tip: "מציג אם ה-WiFi מופעל או כבוי.",
        cmd: "adb shell settings get global wifi_on",
        mode: "adb",
        run: sh("settings get global wifi_on"),
      },
      {
        id: "pavv-3-30",
        label: "ניקוי כל ההתראות",
        tip: "מנקה את כל ההתראות הפעילות — כאילו החלקת את לוח ההתראות.",
        cmd: "adb shell service call notification 1",
        mode: "adb",
        run: sh("service call notification 1"),
      },
      {
        id: "pavv-3-31",
        label: "הפעלת מצב שקט מלא (DND)",
        tip: "מפעיל Do Not Disturb — אין קולות, אין רטט, אין הפרעות.",
        cmd: "adb shell cmd notification set_dnd on",
        mode: "adb",
        run: sh("cmd notification set_dnd on"),
      },
      {
        id: "pavv-3-32",
        label: "כיבוי מצב שקט (DND)",
        tip: "כיבוי מצב שקט (DND)",
        cmd: "adb shell cmd notification set_dnd off",
        mode: "adb",
        run: sh("cmd notification set_dnd off"),
      },
      {
        id: "pavv-3-33",
        label: "השתקת כל הצלילים",
        tip: "השתקת כל הצלילים",
        cmd: "adb shell cmd media_session volume --set 0",
        mode: "adb",
        run: sh("cmd media_session volume --set 0"),
      },
      {
        id: "pavv-3-34",
        label: "בדיקת מצב DND הנוכחי",
        tip: "בדיקת מצב DND הנוכחי",
        cmd: "adb shell settings get global zen_mode",
        mode: "adb",
        run: sh("settings get global zen_mode"),
      },
      {
        id: "pavv-3-35",
        label: "עוצמת קול מדיה נוכחית",
        tip: "עוצמת קול מדיה נוכחית",
        cmd: "adb shell settings get system volume_music_speaker",
        mode: "adb",
        run: sh("settings get system volume_music_speaker"),
      },
      {
        id: "pavv-3-36",
        label: "השתקת רינגטון",
        tip: "השתקת רינגטון",
        cmd: "adb shell settings put system volume_ring 0",
        mode: "adb",
        run: sh("settings put system volume_ring 0"),
      },
    ],
  },
  {
    id: "pavv-4",
    name: "אבחון, תחזוקה וניהול קבצים (פב״ב הראשון)",
    icon: "folder",
    commands: [
      {
        id: "pavv-4-1",
        label: "נתוני יצרן ומערכת (Getprop)",
        tip: "הצגת כל מאפייני המערכת: דגם, חומרה, וגרסאות.",
        cmd: "adb shell getprop",
        mode: "adb",
        run: sh("getprop"),
      },
      {
        id: "pavv-4-2",
        label: "זמן פעולה (Uptime)",
        tip: "כמה זמן המכשיר פועל רצוף מאז ההדלקה האחרונה.",
        cmd: "adb shell uptime",
        mode: "adb",
        run: sh("uptime"),
      },
      {
        id: "pavv-4-3",
        label: "סטטוס סוללה",
        tip: "מציג מצב טעינה, בריאות, מתח וטמפרטורה של הסוללה.",
        cmd: "adb shell dumpsys battery",
        mode: "adb",
        run: sh("dumpsys battery"),
      },
      {
        id: "pavv-4-4",
        label: "דוח סוללה מורחב",
        tip: "מידע טכני עמוק על היסטוריית צריכת החשמל.",
        cmd: "adb shell dumpsys batterystats",
        mode: "adb",
        run: sh("dumpsys batterystats"),
      },
      {
        id: "pavv-4-5",
        label: "סטטוס רשתות אלחוטיות (WiFi)",
        tip: "מציג את נתוני החיבור לאינטרנט אלחוטי.",
        cmd: "adb shell dumpsys wifi",
        mode: "adb",
        run: sh("dumpsys wifi"),
      },
      {
        id: "pavv-4-6",
        label: "דוח פעילות וחלונות (Activity)",
        tip: "מידע על האפליקציות שרצות ברקע והחלונות הפתוחים.",
        cmd: "adb shell dumpsys activity",
        mode: "adb",
        run: sh("dumpsys activity"),
      },
      {
        id: "pavv-4-7",
        label: "פרטים טכניים על התצוגה (Displays)",
        tip: "דוח על המסך הפיזי ונתוני התצוגה.",
        cmd: "adb shell dumpsys window displays",
        mode: "adb",
        run: sh("dumpsys window displays"),
      },
      {
        id: "pavv-4-8",
        label: "ניצול מעבד בזמן אמת (CPU Info)",
        tip: "מציג עומס נוכחי על המעבד (CPU).",
        cmd: "adb shell dumpsys cpuinfo",
        mode: "adb",
        run: sh("dumpsys cpuinfo"),
      },
      {
        id: "pavv-4-9",
        label: "מנהל משימות בלייב (Top)",
        tip: "מראה את עשרת התהליכים שלוקחים הכי הרבה כוח כרגע.",
        cmd: "adb shell top -m 10 -n 1",
        mode: "adb",
        run: sh("top -m 10 -n 1"),
      },
      {
        id: "pavv-4-10",
        label: "שליפת יומן המערכת (Logcat)",
        tip: "שולף snapshot של הלוגים הקיימים בלי להישאר פתוח. ⚠️ כפילות חלקית — ראה גם קטגוריה 1 פקודות 34-35. הפקודה כאן שולפת snapshot בלבד (-d).",
        cmd: "adb shell logcat -d",
        mode: "adb",
        run: sh("logcat -d"),
      },
      {
        id: "pavv-4-11",
        label: "ניקוי יומן מערכת",
        tip: "מוחק את היסטוריית ה-Logcat כדי להתחיל תיעוד חדש. ⚠️ כפילות — קיים גם בקטגוריה 1 כפקודה 35.",
        cmd: "adb logcat -c",
        mode: "adb",
        run: sh("logcat -c"),
      },
      {
        id: "pavv-4-12",
        label: "חיבורי רשת ופורטים פעילים",
        tip: "בדיקת אילו תוכנות מאזינות לאילו פורטים ברשת. ⚠️ ב-Android 13 הפלאג -p (שם תהליך) חסום ללא Root. השתמש ב-netstat -tu לחלופה.",
        cmd: "adb shell netstat -tulpn",
        mode: "adb",
        run: sh("netstat -tulpn"),
      },
      {
        id: "pavv-4-13",
        label: "שאילתת מאפיין מערכת ספציפי (Getprop)",
        tip: "מציג מאפיין מערכת אחד ספציפי — שימושי לבדיקת גרסת Android, שם דגם, סטטוס Build ועוד.",
        cmd: "adb shell getprop ro.build.version.release",
        mode: "adb",
        run: sh("getprop ro.build.version.release"),
      },
      {
        id: "pavv-4-14",
        label: "ניתוח שימוש בזיכרון של אפליקציה (Meminfo)",
        tip: "מציג כמה RAM צורכת אפליקציה ספציפית — שימושי לאבחון בעיות ביצועים.",
        cmd: "adb shell dumpsys meminfo XXX",
        mode: "adb",
        run: shellRun("dumpsys meminfo XXX", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-4-15",
        label: "סימולציית אחוז סוללה (לבדיקות)",
        tip: "מכריח את המערכת לדווח על אחוז סוללה מסוים — שימושי לבדיקת התנהגות אפליקציות בסוללה נמוכה. לאיפוס: adb shell cmd battery reset החלף XXX ב-0-100.",
        cmd: "adb shell cmd battery set level XXX",
        mode: "adb",
        run: shellRun("cmd battery set level XXX", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-4-16",
        label: "מה פתוח כרגע על המסך (Focus)",
        tip: "מציג את שם החבילה וה-Activity שפעילים כרגע בחזית — שימושי לזיהוי Activity מדויק לפני am start.",
        cmd: "adb shell dumpsys window windows | grep -E \"mCurrentFocus|mFocusedApp\"",
        mode: "adb",
        run: sh("dumpsys window windows | grep -E \"mCurrentFocus|mFocusedApp\""),
      },
      {
        id: "pavv-4-17",
        label: "Activity פעיל כרגע (Top Activity)",
        tip: "מציג את ה-Activity הפעיל בחלק העליון של ה-back stack — שם החבילה, שם ה-Activity, ומצבו.",
        cmd: "adb shell dumpsys activity top",
        mode: "adb",
        run: sh("dumpsys activity top"),
      },
      {
        id: "pavv-4-18",
        label: "ניהול הרשאות התראות (Android 13+)",
        tip: "מאפשר לאפליקציה ספציפית להאזין להתראות. ב-Android 13 נוספה הרשאת POST_NOTIFICATIONS. לאישור הרשאה ישירות: adb shell pm grant XXX android.permission.POST_NOTIFICATIONS",
        cmd: "adb shell cmd notification allow_listener XXX",
        mode: "adb",
        run: shellRun("cmd notification allow_listener XXX", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-4-19",
        label: "כיבוי התראות קופצות (Heads-Up)",
        tip: "מכבה את ההתראות הקופצות בחלק העליון של המסך.",
        cmd: "adb shell settings put global heads_up_notifications_enabled 0",
        mode: "adb",
        run: sh("settings put global heads_up_notifications_enabled 0"),
      },
      {
        id: "pavv-4-20",
        label: "רשימת Overlays פעילים (Substratum וכד')",
        tip: "מציג את כל ה-overlays הפעילים במערכת — שכבות עיצוב, תמות, ו-Substratum.",
        cmd: "adb shell cmd overlay list",
        mode: "adb",
        run: sh("cmd overlay list"),
      },
      {
        id: "pavv-4-21",
        label: "בדיקת שטח אחסון",
        tip: "מראה כמה זיכרון פנוי נשאר בכל מחיצה.",
        cmd: "adb shell df -h",
        mode: "adb",
        run: sh("df -h"),
      },
      {
        id: "pavv-4-22",
        label: "רשימת קבצים מפורטת באחסון",
        tip: "מציג את כל הקבצים בזיכרון הפנימי (ניתן לשנות את הנתיב במקום /sdcard/).",
        cmd: "adb shell ls -alR /sdcard/",
        mode: "adb",
        run: sh("ls -alR /sdcard/"),
      },
      {
        id: "pavv-4-23",
        label: "יצירת תיקייה חדשה",
        tip: "יוצר תיקייה בנתיב שצוין.",
        cmd: "adb shell mkdir /sdcard/NewFolder",
        mode: "adb",
        run: sh("mkdir /sdcard/NewFolder"),
      },
      {
        id: "pavv-4-24",
        label: "מחיקת תיקיות ריקות",
        tip: "מנקה מהזיכרון הפנימי תיקיות שאין בהן כלום.",
        cmd: "adb shell find /sdcard -type d -empty -delete",
        mode: "adb",
        run: sh("find /sdcard -type d -empty -delete"),
      },
      {
        id: "pavv-4-25",
        label: "ניקוי קאש כללי",
        tip: "מנסה לפנות שטח אחסון על ידי ניקוי קבצים זמניים של המערכת.",
        cmd: "adb shell pm trim-caches 999G",
        mode: "adb",
        run: sh("pm trim-caches 999G"),
      },
      {
        id: "pavv-4-26",
        label: "ניקוי זיכרון ראם (RAM) עמוק (דורש Root)",
        tip: "מנקה את המטמון בזיכרון הראם של הלינוקס.",
        cmd: "adb shell su -c 'echo 3 > /proc/sys/vm/drop_caches'",
        mode: "adb",
        run: sh("su -c 'echo 3 > /proc/sys/vm/drop_caches'"),
      },
      {
        id: "pavv-4-27",
        label: "סגירת כל תהליכי הרקע",
        tip: "סוגר תהליכים מיותרים בראם (RAM) כדי להאיץ את המכשיר.",
        cmd: "adb shell am kill-all",
        mode: "adb",
        run: sh("am kill-all"),
      },
      {
        id: "pavv-4-28",
        label: "צילום מסך",
        tip: "מצלם ושומר בזיכרון המכשיר (ניתן להחליף את נתיב השמירה XXX במקום s.png).",
        cmd: "adb shell screencap -p /sdcard/XXX",
        mode: "adb",
        run: shellRun("screencap -p /sdcard/XXX", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-4-29",
        label: "הקלטת מסך",
        tip: "מקליט וידאו ושומר בזיכרון (יש להקיש Ctrl+C לעצירה, להחליף XXX בשם הקובץ).",
        cmd: "adb shell screenrecord /sdcard/XXX",
        mode: "adb",
        run: shellRun("screenrecord /sdcard/XXX", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-4-30",
        label: "צילום מסך ישיר למחשב (Screenshot to PC)",
        tip: "מצלם מסך, שומר למכשיר, ומיד מעתיק למחשב — שני שלבים בפקודה אחת.",
        cmd: "adb shell screencap -p /sdcard/screen.png && adb pull /sdcard/screen.png",
        mode: "adb",
        run: sh("screencap -p /sdcard/screen.png && adb pull /sdcard/screen.png"),
      },
      {
        id: "pavv-4-31",
        label: "גיבוי כל האפליקציות (ADB Backup)",
        tip: "יוצר קובץ גיבוי של כל האפליקציות והנתונים שלהן לקובץ backup.ab על המחשב. המכשיר יציג אזהרה ויבקש אישור ידני. חלק מהאפליקציות חוסמות גיבוי (FLAG_ALLOW_BACKUP=false).",
        cmd: "adb backup -apk -all -f backup.ab",
        mode: "adb",
        run: async () => { await ops.backup("-apk -all"); },
      },
      {
        id: "pavv-4-32",
        label: "שחזור מגיבוי ADB",
        tip: "משחזר אפליקציות ונתונים מקובץ גיבוי שנוצר עם adb backup. המכשיר יציג מסך אישור — יש לאשר ידנית. ודא שגרסת האנדרואיד תואמת.",
        cmd: "adb restore backup.ab",
        mode: "adb",
        run: restoreRun(),
      },
      {
        id: "pavv-4-33",
        label: "העברת קובץ למכשיר",
        tip: "מעתיק קובץ מהמחשב לתיקיית /sdcard/ במכשיר.",
        cmd: "adb push XXX /sdcard/",
        mode: "adb",
        run: pushRun(),
      },
      {
        id: "pavv-4-34",
        label: "משיכת קובץ מהמכשיר",
        tip: "מעתיק קובץ מהמכשיר לתיקייה הנוכחית במחשב.",
        cmd: "adb pull /sdcard/XXX .",
        mode: "adb",
        run: pullRun("/sdcard/"),
      },
      {
        id: "pavv-4-35",
        label: "שמירת צילום מסך ישירות למחשב",
        tip: "מצלם מסך, שומר למכשיר ואז מושך למחשב בפקודה אחת משורשרת. מהיר יותר מצילום ידני.",
        cmd: "adb shell screencap -p /sdcard/screen.png && adb pull /sdcard/screen.png",
        mode: "adb",
        run: sh("screencap -p /sdcard/screen.png && adb pull /sdcard/screen.png"),
      },
      {
        id: "pavv-4-36",
        label: "רשימת כל ההרשאות לפי קבוצות",
        tip: "מציג את כל ההרשאות המוגדרות במכשיר מאורגנות לפי קבוצות (CONTACTS, CAMERA, LOCATION וכד').",
        cmd: "adb shell pm list permissions -g",
        mode: "adb",
        run: sh("pm list permissions -g"),
      },
      {
        id: "pavv-4-37",
        label: "הרשאות של אפליקציה ספציפית",
        tip: "מציג אילו הרשאות מוגדרות לאפליקציה ספציפית — מה מאושר ומה מסורב.",
        cmd: "adb shell dumpsys package XXX | grep -i permission",
        mode: "adb",
        run: shellRun("dumpsys package XXX | grep -i permission", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-4-38",
        label: "בדיקת עוצמת אות WiFi",
        tip: "מציג מידע על חיבור ה-WiFi הנוכחי כולל SSID ועוצמת אות.",
        cmd: "adb shell dumpsys wifi | grep -E 'SSID|RSSI|linkSpeed'",
        mode: "adb",
        run: sh("dumpsys wifi | grep -E 'SSID|RSSI|linkSpeed'"),
      },
      {
        id: "pavv-4-39",
        label: "רשימת רשתות WiFi שמורות",
        tip: "רשימת רשתות WiFi שמורות",
        cmd: "adb shell dumpsys wifi | grep SSID",
        mode: "adb",
        run: sh("dumpsys wifi | grep SSID"),
      },
      {
        id: "pavv-4-40",
        label: "הצגת כל ההתראות הפעילות",
        tip: "הצגת כל ההתראות הפעילות",
        cmd: "adb shell dumpsys notification | grep 'pkg='",
        mode: "adb",
        run: sh("dumpsys notification | grep 'pkg='"),
      },
      {
        id: "pavv-4-41",
        label: "הצגת זמן מערכת נוכחי",
        tip: "הצגת זמן מערכת נוכחי",
        cmd: "adb shell date",
        mode: "adb",
        run: sh("date"),
      },
      {
        id: "pavv-4-42",
        label: "סריקת ספריית מדיה מחדש",
        tip: "מאלץ את המכשיר לסרוק מחדש את כל קבצי המדיה — שימושי אחרי העברת קבצים.",
        cmd: "adb shell am broadcast -a android.intent.action.MEDIA_MOUNTED -d file:///sdcard",
        mode: "adb",
        run: sh("am broadcast -a android.intent.action.MEDIA_MOUNTED -d file:///sdcard"),
      },
    ],
  },
  {
    id: "pavv-5",
    name: "קלט, מקשים ושליטה (פב״ב הראשון)",
    icon: "terminal",
    commands: [
      {
        id: "pavv-5-1",
        label: "לחיצה על נקודה במסך (Tap)",
        tip: "מדמה מגע מדויק במסך. יש להחליף את XXX ו-YYY בקואורדינטות המתאימות.",
        cmd: "adb shell input tap XXX YYY",
        mode: "adb",
        run: shellRun("input tap XXX YYY", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."},{"token":"YYY","title":"הזנת YYY","label":"YYY","hint":"יחליף את YYY בפקודה."}]),
      },
      {
        id: "pavv-5-2",
        label: "גרירה / החלקה (Swipe)",
        tip: "מדמה החלקה בין נקודת התחלה לנקודת סיום. יש להחליף את ארבעת הערכים ואת משך הזמן ZZZ במילישניות.",
        cmd: "adb shell input swipe XXX YYY XXX YYY ZZZ",
        mode: "adb",
        run: shellRun("input swipe XXX YYY XXX YYY ZZZ", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."},{"token":"YYY","title":"הזנת YYY","label":"YYY","hint":"יחליף את YYY בפקודה."},{"token":"ZZZ","title":"הזנת ZZZ","label":"ZZZ","hint":"יחליף את ZZZ בפקודה."}]),
      },
      {
        id: "pavv-5-3",
        label: "לחיצה ארוכה על המסך",
        tip: "דימוי לחיצה ארוכה באמצעות swipe על אותה נקודה. יש להחליף את XXX ו-YYY.",
        cmd: "adb shell input swipe XXX YYY XXX YYY 1000",
        mode: "adb",
        run: shellRun("input swipe XXX YYY XXX YYY 1000", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."},{"token":"YYY","title":"הזנת YYY","label":"YYY","hint":"יחליף את YYY בפקודה."}]),
      },
      {
        id: "pavv-5-4",
        label: "הקלדת טקסט לשדה מסומן",
        tip: "מקליד טקסט ישירות לשדה הפעיל. החלף את YOUR_TEXT בטקסט הרצוי. השארת המירכאות מסייעת כאשר יש רווחים.",
        cmd: "adb shell input text \"YOUR_TEXT\"",
        mode: "adb",
        run: sh("input text \"YOUR_TEXT\""),
      },
      {
        id: "pavv-5-5",
        label: "מקש Home",
        tip: "סימולציית לחיצה קצרה על מקש הבית.",
        cmd: "adb shell input keyevent 3",
        mode: "adb",
        run: sh("input keyevent 3"),
      },
      {
        id: "pavv-5-6",
        label: "מקש Home בלחיצה ארוכה",
        tip: "לרוב פותח חיפוש מערכת או עוזרת קולית, אם המכשיר תומך בכך.",
        cmd: "adb shell input keyevent --longpress 3",
        mode: "adb",
        run: sh("input keyevent --longpress 3"),
      },
      {
        id: "pavv-5-7",
        label: "מקש Back",
        tip: "סימולציית לחיצה קצרה על מקש חזור.",
        cmd: "adb shell input keyevent 4",
        mode: "adb",
        run: sh("input keyevent 4"),
      },
      {
        id: "pavv-5-8",
        label: "מקש Back בלחיצה ארוכה",
        tip: "לעיתים פותח תפריט או מבצע פעולה מורחבת, לפי המכשיר והאפליקציה.",
        cmd: "adb shell input keyevent --longpress 4",
        mode: "adb",
        run: sh("input keyevent --longpress 4"),
      },
      {
        id: "pavv-5-9",
        label: "מקש Call",
        tip: "סימולציית לחיצה על מקש חיוג/מענה פיזי.",
        cmd: "adb shell input keyevent 5",
        mode: "adb",
        run: sh("input keyevent 5"),
      },
      {
        id: "pavv-5-10",
        label: "מקש End Call",
        tip: "סימולציית לחיצה על מקש ניתוק שיחה.",
        cmd: "adb shell input keyevent 6",
        mode: "adb",
        run: sh("input keyevent 6"),
      },
      {
        id: "pavv-5-11",
        label: "מקש Power",
        tip: "לחיצה קצרה על כפתור ההפעלה/כיבוי המסך.",
        cmd: "adb shell input keyevent 26",
        mode: "adb",
        run: sh("input keyevent 26"),
      },
      {
        id: "pavv-5-12",
        label: "מקש Power בלחיצה ארוכה",
        tip: "לרוב פותח את תפריט הכיבוי/הפעלה מחדש.",
        cmd: "adb shell input keyevent --longpress 26",
        mode: "adb",
        run: sh("input keyevent --longpress 26"),
      },
      {
        id: "pavv-5-13",
        label: "הגברת ווליום",
        tip: "מעלה את עוצמת הקול.",
        cmd: "adb shell input keyevent 24",
        mode: "adb",
        run: sh("input keyevent 24"),
      },
      {
        id: "pavv-5-14",
        label: "הנמכת ווליום",
        tip: "מוריד את עוצמת הקול.",
        cmd: "adb shell input keyevent 25",
        mode: "adb",
        run: sh("input keyevent 25"),
      },
      {
        id: "pavv-5-15",
        label: "Mute",
        tip: "משתיק את השמע.",
        cmd: "adb shell input keyevent 164",
        mode: "adb",
        run: sh("input keyevent 164"),
      },
      {
        id: "pavv-5-16",
        label: "העלאת בהירות",
        tip: "מנסה להעלות את בהירות המסך באמצעות keyevent ייעודי.",
        cmd: "adb shell input keyevent 221",
        mode: "adb",
        run: sh("input keyevent 221"),
      },
      {
        id: "pavv-5-17",
        label: "הורדת בהירות",
        tip: "מנסה להוריד את בהירות המסך באמצעות keyevent ייעודי.",
        cmd: "adb shell input keyevent 220",
        mode: "adb",
        run: sh("input keyevent 220"),
      },
      {
        id: "pavv-5-18",
        label: "DPAD Center / אישור פיזי",
        tip: "כפתור אישור אמצעי, נפוץ בג׳ויסטיקים, שלטים ומכשירים כשרים. קריטי לאישורי פעולות.",
        cmd: "adb shell input keyevent 23",
        mode: "adb",
        run: sh("input keyevent 23"),
      },
      {
        id: "pavv-5-19",
        label: "DPAD Center בלחיצה ארוכה",
        tip: "לרוב מסמן טקסט או פותח אפשרויות על אובייקט מסומן.",
        cmd: "adb shell input keyevent --longpress 23",
        mode: "adb",
        run: sh("input keyevent --longpress 23"),
      },
      {
        id: "pavv-5-20",
        label: "DPAD Up",
        tip: "ניווט עם חץ למעלה.",
        cmd: "adb shell input keyevent 19",
        mode: "adb",
        run: sh("input keyevent 19"),
      },
      {
        id: "pavv-5-21",
        label: "DPAD Down",
        tip: "ניווט עם חץ למטה.",
        cmd: "adb shell input keyevent 20",
        mode: "adb",
        run: sh("input keyevent 20"),
      },
      {
        id: "pavv-5-22",
        label: "DPAD Left",
        tip: "ניווט עם חץ שמאלה.",
        cmd: "adb shell input keyevent 21",
        mode: "adb",
        run: sh("input keyevent 21"),
      },
      {
        id: "pavv-5-23",
        label: "DPAD Right",
        tip: "ניווט עם חץ ימינה.",
        cmd: "adb shell input keyevent 22",
        mode: "adb",
        run: sh("input keyevent 22"),
      },
      {
        id: "pavv-5-24",
        label: "Enter",
        tip: "מקש אנטר / אישור מתוך המקלדת - מבצע שורה חדשה או מאשר הזנת טקסט.",
        cmd: "adb shell input keyevent 66",
        mode: "adb",
        run: sh("input keyevent 66"),
      },
      {
        id: "pavv-5-25",
        label: "Space",
        tip: "מקש רווח.",
        cmd: "adb shell input keyevent 62",
        mode: "adb",
        run: sh("input keyevent 62"),
      },
      {
        id: "pavv-5-26",
        label: "Tab",
        tip: "מקש טאב, שימושי למעבר בין שדות.",
        cmd: "adb shell input keyevent 61",
        mode: "adb",
        run: sh("input keyevent 61"),
      },
      {
        id: "pavv-5-27",
        label: "Escape",
        tip: "מקש ביטול / יציאה.",
        cmd: "adb shell input keyevent 111",
        mode: "adb",
        run: sh("input keyevent 111"),
      },
      {
        id: "pavv-5-28",
        label: "Delete / Backspace",
        tip: "מחיקה אחורה.",
        cmd: "adb shell input keyevent 67",
        mode: "adb",
        run: sh("input keyevent 67"),
      },
      {
        id: "pavv-5-29",
        label: "Forward Delete",
        tip: "מחיקה קדימה.",
        cmd: "adb shell input keyevent 112",
        mode: "adb",
        run: sh("input keyevent 112"),
      },
      {
        id: "pavv-5-30",
        label: "Search",
        tip: "מקש חיפוש פיזי.",
        cmd: "adb shell input keyevent 84",
        mode: "adb",
        run: sh("input keyevent 84"),
      },
      {
        id: "pavv-5-31",
        label: "Camera",
        tip: "מקש מצלמה לצילום כאשר המצלמה פתוחה.",
        cmd: "adb shell input keyevent 27",
        mode: "adb",
        run: sh("input keyevent 27"),
      },
      {
        id: "pavv-5-32",
        label: "Camera בלחיצה ארוכה",
        tip: "לרוב פוקוס/מיקוד לפני הצילום.",
        cmd: "adb shell input keyevent --longpress 27",
        mode: "adb",
        run: sh("input keyevent --longpress 27"),
      },
      {
        id: "pavv-5-33",
        label: "Menu",
        tip: "מקש תפריט פיזי.",
        cmd: "adb shell input keyevent 82",
        mode: "adb",
        run: sh("input keyevent 82"),
      },
      {
        id: "pavv-5-34",
        label: "Recent Apps",
        tip: "מקש יישומים אחרונים.",
        cmd: "adb shell input keyevent 187",
        mode: "adb",
        run: sh("input keyevent 187"),
      },
      {
        id: "pavv-5-35",
        label: "Play/Pause",
        tip: "ניגון והשהייה למדיה.",
        cmd: "adb shell input keyevent 85",
        mode: "adb",
        run: sh("input keyevent 85"),
      },
      {
        id: "pavv-5-36",
        label: "Next",
        tip: "מעבר למדיה הבאה.",
        cmd: "adb shell input keyevent 87",
        mode: "adb",
        run: sh("input keyevent 87"),
      },
      {
        id: "pavv-5-37",
        label: "Previous",
        tip: "חזרה למדיה הקודמת.",
        cmd: "adb shell input keyevent 88",
        mode: "adb",
        run: sh("input keyevent 88"),
      },
      {
        id: "pavv-5-38",
        label: "Move Home",
        tip: "קפיצה לתחילת שורת הטקסט הנוכחית.",
        cmd: "adb shell input keyevent 122",
        mode: "adb",
        run: sh("input keyevent 122"),
      },
      {
        id: "pavv-5-39",
        label: "Move End",
        tip: "קפיצה לסוף שורת הטקסט הנוכחית.",
        cmd: "adb shell input keyevent 123",
        mode: "adb",
        run: sh("input keyevent 123"),
      },
      {
        id: "pavv-5-40",
        label: "הקשת מספרים 0–9",
        tip: "תבנית כללית: במקום <keycode> יש להזין 7 עבור 0 ועד 16 עבור 9.",
        cmd: "adb shell input keyevent <keycode>",
        mode: "adb",
        run: sh("input keyevent <keycode>"),
      },
      {
        id: "pavv-5-41",
        label: "הקשת אותיות A–Z",
        tip: "תבנית כללית: במקום <keycode> יש להזין 29 עבור A ועד 54 עבור Z.",
        cmd: "adb shell input keyevent <keycode>",
        mode: "adb",
        run: sh("input keyevent <keycode>"),
      },
      {
        id: "pavv-5-42",
        label: "צילום תמונה עם מצלמה אחורית",
        tip: "מפעיל את אפליקציית המצלמה ומצלם תמונה מיידית (Android 7+).",
        cmd: "adb shell am start -a android.media.action.IMAGE_CAPTURE",
        mode: "adb",
        run: sh("am start -a android.media.action.IMAGE_CAPTURE"),
      },
      {
        id: "pavv-5-43",
        label: "פתיחת נגן מוזיקה",
        tip: "פתיחת נגן מוזיקה",
        cmd: "adb shell am start -a android.intent.action.MUSIC_PLAYER",
        mode: "adb",
        run: sh("am start -a android.intent.action.MUSIC_PLAYER"),
      },
    ],
  },
  {
    id: "pavv-7",
    name: "Root ומתקדמים (פב״ב הראשון)",
    icon: "key",
    commands: [
      {
        id: "pavv-7-5",
        label: "כניסה ל-shell עם su",
        tip: "פותח מעטפת shell ולאחר מכן מריץ su כדי לעלות למשתמש root בתוך המכשיר.",
        cmd: "adb shell su",
        mode: "adb",
        run: sh("su"),
      },
      {
        id: "pavv-7-6",
        label: "בדיקת גישת Root בסיסית",
        tip: "מריץ פקודת בדיקה פשוטה עם su ישירות מהמחשב.",
        cmd: "adb shell su -c \"echo Root Access Granted\"",
        mode: "adb",
        run: sh("su -c \"echo Root Access Granted\""),
      },
      {
        id: "pavv-7-7",
        label: "בדיקת uid עם Root",
        tip: "בודק ומוודא קבלת הרשאות Root מלאות.",
        cmd: "adb shell su -c \"id\"",
        mode: "adb",
        run: sh("su -c \"id\""),
      },
      {
        id: "pavv-7-8",
        label: "חסימת הוספת משתמשים חדשים",
        tip: "מפעיל הגבלת משתמש שמונעת הוספת משתמשים חדשים במשתמש 0. מתאים גם ל-Android 13 כאשר יש גישת Root.",
        cmd: "adb shell su -c \"pm set-user-restriction --user 0 no_add_user 1\"",
        mode: "adb",
        run: sh("su -c \"pm set-user-restriction --user 0 no_add_user 1\""),
      },
      {
        id: "pavv-7-9",
        label: "חסימת הגדרת VPN למשתמש",
        tip: "מפעיל הגבלת משתמש שחוסמת הגדרה והפעלה של VPN רגיל למשתמש 0. ב-Android 12 ומעלה ההגבלה גם מנקה VPN פעיל שהוגדר על ידי המשתמש.",
        cmd: "adb shell su -c \"pm set-user-restriction --user 0 no_config_vpn 1\"",
        mode: "adb",
        run: sh("su -c \"pm set-user-restriction --user 0 no_config_vpn 1\""),
      },
      {
        id: "pavv-7-10",
        label: "פתיחת system לכתיבה",
        tip: "פותח את מחיצת המערכת לכתיבה.",
        cmd: "adb shell su -c \"mount -o rw,remount /system\"",
        mode: "adb",
        run: sh("su -c \"mount -o rw,remount /system\""),
      },
      {
        id: "pavv-7-11",
        label: "העתקת APK אל מחיצת המערכת",
        tip: "מעתיק APK אל תוך מחיצת המערכת.",
        cmd: "adb shell su -c \"cp /sdcard/<app.apk> /system/app/<folder_name>/\"",
        mode: "adb",
        run: sh("su -c \"cp /sdcard/<app.apk> /system/app/<folder_name>/\""),
      },
      {
        id: "pavv-7-12",
        label: "הגדרת הרשאות לקובץ מערכת",
        tip: "מגדיר הרשאות 644 לקובץ מערכת.",
        cmd: "adb shell su -c \"chmod 644 /system/app/<folder_name>/<app.apk>\"",
        mode: "adb",
        run: sh("su -c \"chmod 644 /system/app/<folder_name>/<app.apk>\""),
      },
      {
        id: "pavv-7-13",
        label: "שינוי בעלות ל-root",
        tip: "משנה בעלות ל-root על הנתיב שנבחר.",
        cmd: "adb shell su -c \"chown root:root /system/app/<folder_name>\"",
        mode: "adb",
        run: sh("su -c \"chown root:root /system/app/<folder_name>\""),
      },
      {
        id: "pavv-7-14",
        label: "מחיקה מוחלטת של תיקיית מערכת",
        tip: "מוחק תיקייה מתוך /system בצורה אלימה.",
        cmd: "adb shell su -c \"rm -rf /system/app/<folder_name>\"",
        mode: "adb",
        run: sh("su -c \"rm -rf /system/app/<folder_name>\""),
      },
      {
        id: "pavv-7-15",
        label: "שלב 1 — כניסה ל-Bootloader",
        tip: "מאתחל את המכשיר למצב Bootloader (Fastboot) לצורך צריבת הקובץ.",
        cmd: "adb reboot bootloader",
        mode: "adb",
        run: async () => {
      log.cmd("adb reboot bootloader");
      await adbService.requireDevice().power.bootloader();
      log.ok("המכשיר מאתחל לבוטלואדר.");
    },
      },
      {
        id: "pavv-7-16",
        label: "שלב 2 — צריבת boot.img המתוקן (עם Magisk)",
        tip: "צורב את קובץ boot.img המתוקן על ידי Magisk אל מחיצת boot_a. קובץ זה מכיל את ה-Root. יש להחליף את שם הקובץ לשם שקיבלתם.",
        cmd: "fastboot flash boot_a boot.img",
        mode: "fastboot",
        run: flashRun("boot_a"),
      },
      {
        id: "pavv-7-17",
        label: "שלב 3 — צריבת vbmeta (אם יש)",
        tip: "אם יש לכם קובץ vbmeta.img — צרבו גם אותו כדי למנוע בעיות אימות מחיצה (Verified Boot). אם אין — דלגו לשלב הבא.",
        cmd: "fastboot --disable-verity --disable-verification flash vbmeta vbmeta.img",
        mode: "fastboot",
        run: flashRun("vbmeta", "המשך גם אם ההרכבה כוללת דגלי disable-verity/disable-verification — אלה נשלטים על ידי תוכן הקובץ, לא על ידי דגלים נפרדים בכלי הזה."),
      },
      {
        id: "pavv-7-18",
        label: "שלב 4 — אתחול מחדש לאחר הצריבה",
        tip: "מאתחל את המכשיר חזרה למערכת לאחר הצריבה. אם הכל בוצע נכון — Root יהיה פעיל.",
        cmd: "fastboot reboot",
        mode: "fastboot",
        run: fb("reboot"),
      },
      {
        id: "pavv-7-19",
        label: "קישור לחיץ — מדריך רוט מלא לכל מכשיר אנדרואיד",
        tip: "מדריך מפורט לצריבת Root על כל מכשיר אנדרואיד — כולל הורדת הקבצים, פתיחת Bootloader, עבודה עם MTK ועוד. לחצו על הקישור לפתיחה. זהו קישור חיצוני לאתר מתמחים — נפתח בלשונית חדשה.",
        cmd: "https://mitmachim.top/topic/87084/מדריך-איך-לצרוב-רוט-כמעת-לכל-מכשיר-אנדרואיד",
        mode: "adb",
        run: async () => {
      window.open("https://mitmachim.top/topic/87084/מדריך-איך-לצרוב-רוט-כמעת-לכל-מכשיר-אנדרואיד", "_blank", "noopener,noreferrer");
    },
      },
      {
        id: "pavv-7-20",
        label: "שליפת כל מידע ה-Bootloader (Getvar)",
        tip: "מציג את כל המשתנים הזמינים של ה-Bootloader — גרסה, שם מוצר, סטטוס נעילה, slot פעיל, גרסת firmware ועוד.",
        cmd: "fastboot getvar all",
        mode: "fastboot",
        run: fb("getvar all"),
      },
      {
        id: "pavv-7-21",
        label: "בדיקת האם Bootloader פתוח",
        tip: "מציג אם ה-Bootloader פתוח (1) או נעול (0). תנאי הכרחי לפני כל ניסיון צריבה.",
        cmd: "fastboot flashing get_unlock_ability",
        mode: "fastboot",
        run: fb("flashing get_unlock_ability"),
      },
      {
        id: "pavv-7-22",
        label: "פתיחת Bootloader (Unlock)",
        tip: "פותח את ה-Bootloader ומאפשר צריבת קבצים מותאמים. המכשיר יציג אזהרה ויבקש אישור ידני על המסך.",
        cmd: "fastboot flashing unlock",
        mode: "fastboot",
        run: fb("flashing unlock"),
      },
      {
        id: "pavv-7-23",
        label: "נעילת Bootloader מחדש (Lock)",
        tip: "נועל מחדש את ה-Bootloader לאחר חזרה לפריימוור מקורי מלא. לשימוש רק כשהמכשיר רץ על firmware מקורי תקין.",
        cmd: "fastboot flashing lock",
        mode: "fastboot",
        run: fb("flashing lock"),
      },
      {
        id: "pavv-7-24",
        label: "צריבת System",
        tip: "צורב את מחיצת המערכת הראשית. משמש להתקנת ROM מלא או firmware חדש.",
        cmd: "fastboot flash system system.img",
        mode: "fastboot",
        run: flashRun("system"),
      },
      {
        id: "pavv-7-25",
        label: "צריבת Super (Android 10+ — Dynamic Partitions)",
        tip: "ב-Android 10 ומעלה, מחיצות system/vendor/product מוכלות בתוך מחיצת Super. צריבת super.img מחליפה את כולן בבת אחת. נדרש מצב fastbootd (לא bootloader רגיל). ראה כרטיס 35 להכנסה ל-fastbootd.",
        cmd: "fastboot flash super super.img",
        mode: "fastboot",
        run: flashRun("super"),
      },
      {
        id: "pavv-7-26",
        label: "צריבת Vendor",
        tip: "צורב את מחיצת ה-vendor — מכילה דרייברים ספציפיים ליצרן. במכשירים עם Dynamic Partitions יש להשתמש בפקודה דרך fastbootd.",
        cmd: "fastboot flash vendor vendor.img",
        mode: "fastboot",
        run: flashRun("vendor"),
      },
      {
        id: "pavv-7-27",
        label: "כניסה ל-Fastbootd (למכשירי Android 10+ עם Dynamic Partitions)",
        tip: "מאתחל ל-Fastbootd — מצב מיוחד שמאפשר צריבת מחיצות דינמיות (super, system, vendor, product). נדרש לצריבת super ב-Android 10+.",
        cmd: "fastboot reboot fastboot",
        mode: "fastboot",
        run: fb("reboot fastboot"),
      },
      {
        id: "pavv-7-28",
        label: "ניגוב מחיצת Super (Wipe Super)",
        tip: "מוחק לחלוטין את מחיצת ה-super ומחזיר אותה לברירת מחדל ריקה. שימושי לפני התקנת ROM חדש נקי. נדרש מצב fastbootd. הרץ כרטיס 35 תחילה.",
        cmd: "fastboot wipe-super super_empty.img",
        mode: "fastboot",
        run: flashRun("super", "זהו קובץ super_empty.img ריק — הפעולה מנגבת את כל מחיצות ה-Dynamic Partitions."),
      },
      {
        id: "pavv-7-29",
        label: "בדיקת Slot פעיל (A/B)",
        tip: "מציג איזה slot פעיל כרגע (a או b). רלוונטי למכשירים עם מחיצות כפולות (A/B).",
        cmd: "fastboot getvar current-slot",
        mode: "fastboot",
        run: fb("getvar current-slot"),
      },
      {
        id: "pavv-7-30",
        label: "החלפת Slot פעיל",
        tip: "מחליף ל-slot הלא פעיל. שימושי לאחר צריבה ל-slot_b כדי להפעיל ממנו. החלף a ב-b לפי הצורך.",
        cmd: "fastboot set_active a",
        mode: "fastboot",
        run: fb("set_active a"),
      },
      {
        id: "pavv-7-31",
        label: "אתחול מ-Fastboot לתוך Recovery",
        tip: "מאתחל ישירות למצב Recovery מבלי לצרוב כלום. שימושי להפעלת TWRP לאחר צריבתו.",
        cmd: "fastboot reboot recovery",
        mode: "fastboot",
        run: fb("reboot recovery"),
      },
      {
        id: "pavv-7-32",
        label: "המשך אתחול רגיל מ-Fastboot",
        tip: "יוצא ממצב Fastboot ומאתחל לאנדרואיד רגיל. שקול ל-fastboot reboot אך ממתין לאישור המכשיר.",
        cmd: "fastboot continue",
        mode: "fastboot",
        run: fb("continue"),
      },
      {
        id: "pavv-7-33",
        label: "חזרה ל-Bootloader מתוך Fastbootd",
        tip: "כשנמצאים במצב Fastbootd (מצב דינמי ל-Android 10+) — פקודה זו מאתחלת חזרה ל-Bootloader הרגיל. נדרש למעבר בין מצבי Fastboot השונים. שונה מ-fastboot reboot — זה חוזר ל-bootloader ולא לאנדרואיד.",
        cmd: "fastboot reboot bootloader",
        mode: "fastboot",
        run: fb("reboot bootloader"),
      },
    ],
  },
  {
    id: "pavv-8",
    name: "שינוי כתובת Bluetooth (MAC) (פב״ב הראשון)",
    icon: "wifi",
    commands: [
      {
        id: "pavv-8-1",
        label: "שלב 0 — כניסה ל-Root Shell",
        tip: "פתח ADB Shell ואז הפעל Root. כל שאר הפקודות במדריך מורצות בתוך ה-Shell הזה. Magisk יציג popup במכשיר לאישור Root — אשר אותו.",
        cmd: "adb shell",
        mode: "adb",
        run: copyRun("adb shell", "פתיחת מעטפת אינטראקטיבית — אי אפשר להריץ כפקודה בודדת כאן. הועתקה ללוח."),
      },
      {
        id: "pavv-8-2",
        label: "שלב 1 — גיבוי קובץ הבלוטוס",
        tip: "מעתיק את קובץ הגדרות הבלוטוס ל-sdcard לפני כל שינוי. מאפשר שחזור מלא אם משהו ישתבש. אם מופיע No such file or directory — הפעל ובטל בלוטוס פעם אחת מהמכשיר ונסה שוב.",
        cmd: "cp /data/misc/bluedroid/bt_config.bak /sdcard/bt_config.bak.backup",
        mode: "adb",
        run: sh("cp /data/misc/bluedroid/bt_config.bak /sdcard/bt_config.bak.backup"),
      },
      {
        id: "pavv-8-3",
        label: "שלב 2 — קריאת הכתובת הנוכחית",
        tip: "מציג את כתובת ה-Bluetooth הנוכחית מתוך קובץ ההגדרות. חובה לרשום את הכתובת לשימוש בשלב הבא. רשום את הכתובת — תצטרך אותה לפקודת ה-sed בשלב 4.",
        cmd: "grep -i address /data/misc/bluedroid/bt_config.bak",
        mode: "adb",
        run: sh("grep -i address /data/misc/bluedroid/bt_config.bak"),
      },
      {
        id: "pavv-8-4",
        label: "שלב 3 — כיבוי שירות הבלוטוס",
        tip: "עוצר את שירות הבלוטוס לפני שינוי הקובץ. חובה לכבות לפני עריכה.",
        cmd: "svc bluetooth disable",
        mode: "adb",
        run: sh("svc bluetooth disable"),
      },
      {
        id: "pavv-8-5",
        label: "שלב 4 — שינוי הכתובת בקובץ (sed)",
        tip: "מחליף את הכתובת הישנה בכתובת החדשה ישירות בתוך קובץ ההגדרות. זהו השינוי הקבוע שישרוד גם אחרי אתחול. החלף כתובת_ישנה בכתובת שקיבלת בשלב 2, ו-כתובת_חדשה בכתובת הרצויה.",
        cmd: "sed -i 's/כתובת_ישנה/כתובת_חדשה/' /data/misc/bluedroid/bt_config.bak",
        mode: "adb",
        run: async () => {
      const oldMac = await promptModal({ title: "כתובת MAC ישנה", label: "הכתובת הנוכחית בקובץ", hint: "פורמט MAC בלבד, לדוגמה: 02:A7:3F:9C:1B:E4" });
      if (!oldMac) { log.warn("בוטל — לא הוזן ערך."); return; }
      const newMac = await promptModal({ title: "כתובת MAC חדשה", label: "הכתובת להחליף אליה", hint: "פורמט MAC בלבד, לדוגמה: 02:00:00:00:00:01" });
      if (!newMac) { log.warn("בוטל — לא הוזן ערך."); return; }
      if (!isMacAddress(oldMac) || !isMacAddress(newMac)) {
        log.err("כתובת ה-MAC חייבת להיות בפורמט TT:TT:TT:TT:TT:TT (הקסדצימלי).");
        return;
      }
      const command = `sed -i 's/${oldMac.trim()}/${newMac.trim()}/' /data/misc/bluedroid/bt_config.bak`;
      log.cmd(`adb shell ${command}`);
      await adbService.shell(command);
    },
      },
      {
        id: "pavv-8-6",
        label: "שלב 5 — setprop קבוע (persist)",
        tip: "מגדיר את הכתובת החדשה כ-system property קבוע עם קידומת persist — נשמר גם אחרי כיבוי והדלקה. שינוי זה בשילוב עם שלב 4 מבטיח שהכתובת תישאר קבועה לחלוטין.",
        cmd: "setprop persist.service.bdroid.bdaddr 02:A7:3F:9C:1B:E4",
        mode: "adb",
        run: async () => {
      const mac = await promptModal({ title: "כתובת MAC חדשה", label: "הכתובת שתוגדר קבוע במכשיר", hint: "פורמט MAC בלבד, לדוגמה: 02:A7:3F:9C:1B:E4" });
      if (!mac) { log.warn("בוטל — לא הוזן ערך."); return; }
      if (!isMacAddress(mac)) {
        log.err("כתובת ה-MAC חייבת להיות בפורמט TT:TT:TT:TT:TT:TT (הקסדצימלי).");
        return;
      }
      const command = `setprop persist.service.bdroid.bdaddr ${mac.trim()}`;
      log.cmd(`adb shell ${command}`);
      await adbService.shell(command);
    },
      },
      {
        id: "pavv-8-7",
        label: "שלב 6 — הפעלה מחדש ואימות",
        tip: "מפעיל מחדש את שירות הבלוטוס ואז מאמת שהכתובת החדשה נקלטה בקובץ.",
        cmd: "svc bluetooth enable",
        mode: "adb",
        run: sh("svc bluetooth enable"),
      },
      {
        id: "pavv-8-8",
        label: "↩ שחזור חירום — אם הבלוטוס לא עובד",
        tip: "משחזר את קובץ הגדרות הבלוטוס המקורי מהגיבוי שנשמר בשלב 1. לשימוש רק אם הבלוטוס לא עובד אחרי השינוי.",
        cmd: "cp /sdcard/bt_config.bak.backup /data/misc/bluedroid/bt_config.bak",
        mode: "adb",
        run: sh("cp /sdcard/bt_config.bak.backup /data/misc/bluedroid/bt_config.bak"),
      },
    ],
  },
  {
    id: "pavv-10",
    name: "סוללה ואבחון (פב״ב הראשון)",
    icon: "battery",
    commands: [
      {
        id: "pavv-10-1",
        label: "מצב סוללה כללי (בזמן אמת)",
        tip: "הצגת מידע כללי על מצב הסוללה כרגע - אחוז טעינה, טמפרטורה, מתח וריאות.",
        cmd: "adb shell dumpsys battery",
        mode: "adb",
        run: sh("dumpsys battery"),
      },
      {
        id: "pavv-10-2",
        label: "קיבולת אמיתית ומחזורי טעינה",
        tip: "קריאת נתוני חומרה מפורטים מקובצי המערכת - קיבולת מלאה, קיבולת עיצוב וכמה מחזורי טעינה עברה הסוללה.",
        cmd: "adb shell cat /sys/class/power_supply/battery/uevent",
        mode: "adb",
        run: sh("cat /sys/class/power_supply/battery/uevent"),
      },
      {
        id: "pavv-10-3",
        label: "דוח מלא של צריכת סוללה לפי אפליקציות",
        tip: "יצירת קובץ דוח מקיף עם סטטיסטיקות שימוש - איזו אפליקציה צרכה כמה סוללה, כמה זמן המסך היה דלוק וזמן עומד.",
        cmd: "adb shell dumpsys batterystats > battery_report.txt",
        mode: "adb",
        run: sh("dumpsys batterystats > battery_report.txt"),
      },
      {
        id: "pavv-10-4",
        label: "זיוף מצב סוללה (למפתחים)",
        tip: "תרגול איך המכשיר מגיב לסוללה חלשה מבלי לרוקן אותה באמת. שימושי לבדיקת אפליקציות.",
        cmd: "adb shell dumpsys battery set level 5",
        mode: "adb",
        run: sh("dumpsys battery set level 5"),
      },
      {
        id: "pavv-10-5",
        label: "הפעלת מצב חיסכון בסוללה (Power Saving)",
        tip: "הפעלה או כיבוי של מצב חיסכון בסוללה מרחוק - מגביל ביצועים כדי לחסוך חשמל.",
        cmd: "adb shell settings put global low_power 1",
        mode: "adb",
        run: sh("settings put global low_power 1"),
      },
      {
        id: "pavv-10-6",
        label: "איפוס נתוני הסוללה (Calibration)",
        tip: "ניקוי ההיסטוריה של דוח הסוללה ותחילת מדידה חדשה - הרץ אחרי טעינה ל-100%.",
        cmd: "adb shell dumpsys batterystats --reset",
        mode: "adb",
        run: sh("dumpsys batterystats --reset"),
      },
    ],
  },
  {
    id: "pavv-11",
    name: "חסימות MDM (פב״ב הראשון)",
    icon: "book",
    commands: [
      {
        id: "pavv-11-1",
        label: "A Bloq (אייבלוק) — מדריך מלא",
        tip: "אפליקציית חסימה מבוססת Device Owner (MDM), חבילה: com.secureguard.mdm. לחיצה פותחת את המדריך המלא להורדה, התקנה והגדרה באתר מתמחים טופ.",
        cmd: "com.secureguard.mdm",
        mode: "adb",
        variant: "outline",
        run: openLinkRun(
          "https://mitmachim.top/topic/84759/%D7%9C%D7%94%D7%95%D7%A8%D7%93%D7%94-%D7%90%D7%A4%D7%9C%D7%99%D7%A7%D7%A6%D7%99%D7%AA-%D7%97%D7%A1%D7%99%D7%9E%D7%94-%D7%9C%D7%90%D7%A0%D7%93%D7%A8%D7%95%D7%90%D7%99%D7%93-%D7%90%D7%99%D7%99%D7%91%D7%9C%D7%95%D7%A7-abloq-%D7%9E%D7%91%D7%95%D7%A1%D7%A1-%D7%A2%D7%9C-mdm-%D7%91%D7%98%D7%90-0.5/3220",
          "נפתח מדריך ה-A Bloq באתר מתמחים טופ.",
        ),
      },
      {
        id: "pavv-11-2",
        label: "התקנת A Bloq (אייבלוק)",
        tip: "פקודת התקנה נפרדת לאחר שהקובץ הורד למחשב או שונה שמו ל-abloq.apk.",
        cmd: "adb install abloq.apk",
        mode: "adb",
        run: installRun(),
      },
      {
        id: "pavv-11-3",
        label: "הפעלת A Bloq (אייבלוק) כמנהל מכשיר",
        tip: "מגדיר את A Bloq (אייבלוק) כ״מנהל מכשיר״. זה השם הפשוט כאן למה שנקרא באנגלית Device Owner.",
        cmd: "adb shell dpm set-device-owner com.secureguard.mdm/.SecureGuardDeviceAdminReceiver",
        mode: "adb",
        run: sh("dpm set-device-owner com.secureguard.mdm/.SecureGuardDeviceAdminReceiver"),
      },
      {
        id: "pavv-11-4",
        label: "K-Droid (קיידרואיד) — מדריך מלא",
        tip: "אפליקציית חסימה נוספת מבוססת Device Owner (MDM), חבילה: com.kdroid.filter. לחיצה פותחת את פוסט השחרור הציבורי באתר מתמחים טופ.",
        cmd: "com.kdroid.filter",
        mode: "adb",
        variant: "outline",
        run: openLinkRun(
          "https://mitmachim.top/topic/63309/%D7%A9%D7%99%D7%AA%D7%95%D7%A3-%D7%9C%D7%94%D7%9B%D7%A9%D7%99%D7%A8-%D7%9B%D7%9E%D7%A2%D7%98-%D7%9B%D7%9C-%D7%90%D7%A0%D7%93%D7%A8%D7%95%D7%90%D7%99%D7%93-%D7%9C%D7%95%D7%95%D7%99%D7%96-%D7%95%D7%9E%D7%99%D7%99%D7%9C-%D7%91%D7%9C%D7%91%D7%93-%D7%A7%D7%99%D7%99%D7%93%D7%A8%D7%95%D7%90%D7%99%D7%93-0.9.8-%D7%92%D7%A8%D7%A1%D7%AA-%D7%91%D7%98%D7%90-%D7%A6%D7%99%D7%91%D7%95%D7%A8%D7%99%D7%AA",
          "נפתח מדריך ה-K-Droid באתר מתמחים טופ.",
        ),
      },
      {
        id: "pavv-11-5",
        label: "התקנת K-Droid (קיידרואיד)",
        tip: "פקודת התקנה נפרדת לאחר שהקובץ הורד למחשב או שונה שמו ל-kdroid.apk.",
        cmd: "adb install kdroid.apk",
        mode: "adb",
        run: installRun(),
      },
      {
        id: "pavv-11-6",
        label: "הפעלת K-Droid (קיידרואיד) כמנהל מכשיר",
        tip: "מגדיר את K-Droid (קיידרואיד) כ״מנהל מכשיר״. זה השם הפשוט כאן למה שנקרא באנגלית Device Owner.",
        cmd: "adb shell dpm set-device-owner com.kdroid.filter/.listener.AdminListener",
        mode: "adb",
        run: sh("dpm set-device-owner com.kdroid.filter/.listener.AdminListener"),
      },
      {
        id: "pavv-11-7",
        label: "SystemLock — חסימה מובנית במכשירים סיניים",
        tip: "אפליקציית חסימה שמגיעה מותקנת מראש בחלק מהמכשירים הסיניים הזולים ('כשרים'). לא נמצא פוסט ייעודי לה במתמחים טופ — שם החבילה הועתק ללוח.",
        cmd: "com.android.systemlock",
        mode: "adb",
        variant: "outline",
        run: copyRun("com.android.systemlock", "שם החבילה של SystemLock הועתק ללוח."),
      },
      {
        id: "pavv-11-8",
        label: "איתור קובץ SystemLock במכשיר סיני",
        tip: "זהו הנתיב של אפליקציית SystemLock. המטרה כאן היא לאפשר חיבור מכשיר סיני לאינטרנט מסונן כאשר האפליקציה הזאת חוסמת או מגבילה את השימוש.",
        cmd: "system/priv-app/SystemLock/SystemLock.apk",
        mode: "adb",
        run: copyRun("system/priv-app/SystemLock/SystemLock.apk", "זהו נתיב ייחוס בלבד (לא פקודה להרצה) — הועתק ללוח."),
      },
      {
        id: "pavv-11-9",
        label: "השבתת SystemLock למשתמש הראשי",
        tip: "משבית את אפליקציית SystemLock עבור משתמש 0 כדי לאפשר שימוש תקין יותר במכשיר לצורך חיבור לאינטרנט מסונן.",
        cmd: "adb shell pm disable-user --user 0 com.android.systemlock",
        mode: "adb",
        run: sh("pm disable-user --user 0 com.android.systemlock"),
      },
      {
        id: "pavv-11-10",
        label: "הסרת SystemLock למשתמש הראשי",
        tip: "מסיר את SystemLock עבור משתמש 0, תוך שמירה על נתוני החבילה ככל האפשר. נועד כשלב נוסף אם ההשבתה לבדה לא מספיקה.",
        cmd: "adb shell pm uninstall -k --user 0 com.android.systemlock",
        mode: "adb",
        run: sh("pm uninstall -k --user 0 com.android.systemlock"),
      },
      {
        id: "pavv-11-11",
        label: "מחיקה אלימה של תיקיית SystemLock עם Root",
        tip: "מוחק את תיקיית SystemLock ממחיצת המערכת עם Root. נועד רק למצבים שבהם ההשבתה או ההסרה למשתמש 0 לא הספיקו.",
        cmd: "adb shell su -c \"rm -rf /system/priv-app/SystemLock\"",
        mode: "adb",
        run: sh("su -c \"rm -rf /system/priv-app/SystemLock\""),
      },
      {
        id: "pavv-11-12",
        label: "הפעלת Outernet (אאוטנט) כמנהל מכשיר",
        tip: "מגדיר את Outernet (אאוטנט) כ-Device Owner בשני שלבים — תחילה Active Admin ואחר כך Device Owner.",
        cmd: "adb shell dpm set-active-admin com.javiv.outernet/eu.faircode.netguard.receivers.DevAdmRec",
        mode: "adb",
        run: sh("dpm set-active-admin com.javiv.outernet/eu.faircode.netguard.receivers.DevAdmRec"),
      },
      {
        id: "pavv-11-13",
        label: "השבתת Google Play Store",
        tip: "משבית את חנות Google Play למשתמש הראשי בלי לגעת ברכיבי ליבה אחרים.",
        cmd: "adb shell pm disable-user --user 0 com.android.vending",
        mode: "adb",
        run: sh("pm disable-user --user 0 com.android.vending"),
      },
      {
        id: "pavv-11-14",
        label: "הסרת Google Play Store למשתמש הראשי",
        tip: "מסיר את חנות Google Play למשתמש 0 בלבד.",
        cmd: "adb shell pm uninstall --user 0 com.android.vending",
        mode: "adb",
        run: sh("pm uninstall --user 0 com.android.vending"),
      },
      {
        id: "pavv-11-15",
        label: "השבתת Chrome",
        tip: "משבית את דפדפן Chrome למשתמש הראשי.",
        cmd: "adb shell pm disable-user --user 0 com.android.chrome",
        mode: "adb",
        run: sh("pm disable-user --user 0 com.android.chrome"),
      },
      {
        id: "pavv-11-16",
        label: "הסרת Chrome למשתמש הראשי",
        tip: "מסיר את דפדפן Chrome למשתמש 0 בלבד.",
        cmd: "adb shell pm uninstall --user 0 com.android.chrome",
        mode: "adb",
        run: sh("pm uninstall --user 0 com.android.chrome"),
      },
      {
        id: "pavv-11-17",
        label: "השבתת YouTube",
        tip: "משבית את אפליקציית YouTube למשתמש הראשי.",
        cmd: "adb shell pm disable-user --user 0 com.google.android.youtube",
        mode: "adb",
        run: sh("pm disable-user --user 0 com.google.android.youtube"),
      },
      {
        id: "pavv-11-18",
        label: "הסרת YouTube למשתמש הראשי",
        tip: "מסיר את אפליקציית YouTube למשתמש 0 בלבד.",
        cmd: "adb shell pm uninstall --user 0 com.google.android.youtube",
        mode: "adb",
        run: sh("pm uninstall --user 0 com.google.android.youtube"),
      },
      {
        id: "pavv-11-19",
        label: "השבתת Google app",
        tip: "משבית את אפליקציית Google / Search.",
        cmd: "adb shell pm disable-user --user 0 com.google.android.googlequicksearchbox",
        mode: "adb",
        run: sh("pm disable-user --user 0 com.google.android.googlequicksearchbox"),
      },
      {
        id: "pavv-11-20",
        label: "הסרת Google app למשתמש הראשי",
        tip: "מסיר את אפליקציית Google / Search למשתמש 0 בלבד.",
        cmd: "adb shell pm uninstall --user 0 com.google.android.googlequicksearchbox",
        mode: "adb",
        run: sh("pm uninstall --user 0 com.google.android.googlequicksearchbox"),
      },
      {
        id: "pavv-11-21",
        label: "השבתת Gmail",
        tip: "משבית את Gmail למשתמש הראשי.",
        cmd: "adb shell pm disable-user --user 0 com.google.android.gm",
        mode: "adb",
        run: sh("pm disable-user --user 0 com.google.android.gm"),
      },
      {
        id: "pavv-11-22",
        label: "הסרת Gmail למשתמש הראשי",
        tip: "מסיר את Gmail למשתמש 0 בלבד.",
        cmd: "adb shell pm uninstall --user 0 com.google.android.gm",
        mode: "adb",
        run: sh("pm uninstall --user 0 com.google.android.gm"),
      },
      {
        id: "pavv-11-23",
        label: "השבתת Google Maps",
        tip: "משבית את Google Maps למשתמש הראשי.",
        cmd: "adb shell pm disable-user --user 0 com.google.android.apps.maps",
        mode: "adb",
        run: sh("pm disable-user --user 0 com.google.android.apps.maps"),
      },
      {
        id: "pavv-11-24",
        label: "הסרת Google Maps למשתמש הראשי",
        tip: "מסיר את Google Maps למשתמש 0 בלבד.",
        cmd: "adb shell pm uninstall --user 0 com.google.android.apps.maps",
        mode: "adb",
        run: sh("pm uninstall --user 0 com.google.android.apps.maps"),
      },
      {
        id: "pavv-11-25",
        label: "הגדרת Device Owner (כללי)",
        tip: "מגדיר אפליקציה כ-Device Owner — מעניק לה שליטה מלאה על המכשיר. פעולה חד-פעמית שלא ניתן לבטל בקלות. החלף XXX בשם החבילה ו-YYY בשם ה-Receiver. למשל: com.kdroid.filter/.listener.AdminListener",
        cmd: "adb shell dpm set-device-owner XXX/YYY",
        mode: "adb",
        run: shellRun("dpm set-device-owner XXX/YYY", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."},{"token":"YYY","title":"הזנת YYY","label":"YYY","hint":"יחליף את YYY בפקודה."}]),
      },
      {
        id: "pavv-11-26",
        label: "הסרת Device Owner (כללי)",
        tip: "מסיר Device Owner מהמכשיר — מחזיר אותו למצב רגיל. ניתן לבצע רק אם האפליקציה עצמה מאפשרת זאת, או דרך Root. החלף XXX בשם החבילה של ה-Device Owner הנוכחי.",
        cmd: "adb shell dpm remove-active-admin XXX/XXX.AdminReceiver",
        mode: "adb",
        run: shellRun("dpm remove-active-admin XXX/XXX.AdminReceiver", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-11-27",
        label: "בדיקת Device Owner נוכחי",
        tip: "מציג מי מוגדר כרגע כ-Device Owner במכשיר.",
        cmd: "adb shell dpm list-owners",
        mode: "adb",
        run: sh("dpm list-owners"),
      },
      {
        id: "pavv-11-28",
        label: "נעילת מסך מרחוק",
        tip: "נועל את המסך מיידית — שימושי לאכיפת מדיניות אבטחה. דורש Device Owner פעיל.",
        cmd: "adb shell dpm force-lock",
        mode: "adb",
        run: sh("dpm force-lock"),
      },
      {
        id: "pavv-11-29",
        label: "ניגוב מכשיר מרחוק (Wipe)",
        tip: "מבצע Factory Reset מרחוק — מוחק את כל הנתונים.",
        cmd: "adb shell dpm wipe-data 0",
        mode: "adb",
        run: sh("dpm wipe-data 0"),
      },
      {
        id: "pavv-11-30",
        label: "קביעת סיסמת מינימום",
        tip: "כופה על המכשיר דרישת סיסמה באורך מינימלי. החלף XXX במספר התווים הנדרש.",
        cmd: "adb shell dpm set-minimum-password-length XXX",
        mode: "adb",
        run: shellRun("dpm set-minimum-password-length XXX", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-11-31",
        label: "חסימת התקנת אפליקציות",
        tip: "מונע התקנת אפליקציות חדשות מחוץ לחנות מורשית. true = חסום, false = מותר.",
        cmd: "adb shell dpm set-user-restriction XXX no_install_unknown_sources",
        mode: "adb",
        run: shellRun("dpm set-user-restriction XXX no_install_unknown_sources", [{"token":"XXX","title":"הזנת ערך","label":"ערך","hint":"יחליף את XXX בפקודה."}]),
      },
      {
        id: "pavv-11-32",
        label: "פתיחת OEM ביצרנים ישנים (Motorola / OnePlus)",
        tip: "בצרנים ישנים (לפני Android 8) פתיחת ה-Bootloader בוצעה דרך פקודה זו במקום fastboot flashing unlock. פקודה זו עדיין שימושית על Motorola / OnePlus ישנים.",
        cmd: "fastboot oem unlock",
        mode: "fastboot",
        run: fb("oem unlock"),
      },
      {
        id: "pavv-11-33",
        label: "הצגת נתוני OEM",
        tip: "מציג משתנים OEM ספציפיים ליצרן. שימושי לבדיקת מצב Bootloader ב-Motorola ומכשירים ישנים אחרים.",
        cmd: "fastboot oem device-info",
        mode: "fastboot",
        run: fb("oem device-info"),
      },
    ],
  },
];
