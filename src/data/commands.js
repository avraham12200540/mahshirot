/**
 * קטלוג הפקודות המלא — ADB ו-Fastboot.
 *
 * כל פקודה: שם בעברית, טולטיפ הסבר, והרצה אמיתית מול המכשיר.
 * כל הרצה מתועדת בפאנל הלוג — אין מסלול אחר ואין חלון CMD.
 *
 * מודל הפקודה:
 *   id      — מזהה ייחודי
 *   label   — שם בעברית (מה שמופיע על הכפתור)
 *   tip     — טולטיפ הסבר קצר
 *   cmd     — הפקודה הטכנית (מוצגת בחיפוש, לא בהכרח מה שנשלח)
 *   mode    — "adb" | "fastboot"
 *   danger  — האם דורש מודאל אישור סיכון
 *   variant — צבע הכפתור
 *   run     — הפונקציה שמריצה בפועל
 */

import { adbService } from "../core/adb-service.js";
import { fastbootService } from "../core/fastboot-service.js";
import * as ops from "../core/adb-ops.js";
import { log } from "../core/logger.js";
import { promptModal, riskModal, confirmModal } from "../ui/modal.js";
import { SplitStringStream, TextDecoderStream } from "@yume-chan/stream-extra";

/* ==========================================================================
   עזרים
   ========================================================================== */

/** יוצר run שמריץ פקודת adb shell פשוטה. */
const sh = (command) => () => adbService.shell(command);

/** יוצר run שמריץ פקודת fastboot גולמית. */
const fb = (command) => () => fastbootService.runCommand(command);

/** שואל שם חבילה. */
async function askPackage(title = "שם חבילה") {
  return promptModal({
    title,
    label: "שם חבילה (package name)",
    placeholder: "com.whatsapp",
    hint: "אפשר למצוא את השם המדויק דרך 'רשימת אפליקציות משתמש'.",
  });
}

/** בוחר קובץ אחד או יותר מהמחשב. */
export function pickFiles({ accept = "", multiple = false } = {}) {
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

    // אם המשתמש סוגר את הדיאלוג בלי לבחור — משחררים את ההבטחה
    input.addEventListener("cancel", () => {
      input.remove();
      resolve(multiple ? [] : null);
    });

    document.body.append(input);
    input.click();
  });
}

/* ==========================================================================
   logcat בזמן אמת
   ========================================================================== */

let logcatProcess = null;

export function isLogcatRunning() {
  return logcatProcess !== null;
}

/** מתחיל זרימת logcat אל פאנל הלוג. */
async function startLogcat(filter = "") {
  if (logcatProcess) {
    log.warn("logcat כבר רץ. עצור אותו קודם.");
    return;
  }

  const adb = adbService.requireDevice();
  const command = `logcat -v brief ${filter}`.trim();
  log.cmd(`adb ${command}`);
  log.info("logcat פועל בזמן אמת. לחץ שוב על הכפתור כדי לעצור.");

  const process = await adb.subprocess.noneProtocol.spawn(command);
  logcatProcess = process;

  // זורם שורה-שורה ישירות ללוג
  process.output
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new SplitStringStream("\n"))
    .pipeTo(
      new WritableStream({
        write(line) {
          const text = line.trimEnd();
          if (text) log.out(text);
        },
      }),
    )
    .catch(() => {
      /* הזרם נסגר כשעוצרים — זו לא שגיאה */
    })
    .finally(() => {
      if (logcatProcess === process) {
        logcatProcess = null;
        log.info("logcat נעצר.");
      }
    });
}

/** עוצר את זרימת ה-logcat. */
async function stopLogcat() {
  if (!logcatProcess) {
    log.warn("logcat לא פועל כרגע.");
    return;
  }
  await logcatProcess.kill();
  logcatProcess = null;
}

/** מתג הפעלה/עצירה של logcat. */
async function toggleLogcat() {
  logcatProcess ? await stopLogcat() : await startLogcat();
}

/* ==========================================================================
   פעולות מורכבות
   ========================================================================== */

/** צריבת קובץ לפרטישן, כולל בחירת קובץ ואזהרה. */
async function flashPartition(partition, { accept = ".img", extraNote = "" } = {}) {
  const file = await pickFiles({ accept });
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
}

/** מחיקת אפליקציה לפי שם חבילה. */
async function uninstallPackage(packageName) {
  const name = packageName?.trim();
  if (!name) {
    log.err("לא הוזן שם חבילה.");
    return;
  }

  const approved = await confirmModal({
    title: "מחיקת אפליקציה",
    message: `האם למחוק את האפליקציה '${name}' מהמכשיר? כל הנתונים שלה יימחקו ולא ניתן לשחזר אותם.`,
    confirmLabel: "מחק",
    tone: "danger",
    iconName: "trash",
  });

  if (!approved) {
    log.info("המחיקה בוטלה.");
    return;
  }

  log.cmd(`adb uninstall ${name}`);
  const output = await adbService.shell(`pm uninstall ${name}`, { quiet: true });
  const text = output.trim();

  if (/^Success/im.test(text)) {
    log.ok(`האפליקציה '${name}' נמחקה.`);
    return;
  }

  // אפליקציות מערכת לא נמחקות לגמרי — מציעים הסרה למשתמש הנוכחי
  log.warn(`המחיקה הרגילה נכשלה: ${text}`);
  const tryUser0 = await confirmModal({
    title: "מחיקה נכשלה",
    message: `ייתכן שזו אפליקציית מערכת. לנסות להסיר אותה עבור המשתמש הנוכחי בלבד (pm uninstall -k --user 0)? זו הדרך היחידה להסיר אפליקציות מערכת בלי רוט.`,
    confirmLabel: "נסה",
    tone: "warn",
  });

  if (!tryUser0) return;

  log.cmd(`adb shell pm uninstall -k --user 0 ${name}`);
  const out2 = await adbService.shell(`pm uninstall -k --user 0 ${name}`, { quiet: true });
  if (/^Success/im.test(out2.trim())) log.ok(`'${name}' הוסרה עבור המשתמש הנוכחי.`);
  else log.err(`ההסרה נכשלה: ${out2.trim()}`);
}

/* ==========================================================================
   קטגוריות ופקודות
   ========================================================================== */

/**
 * @typedef {object} Command
 * @property {string} id
 * @property {string} label
 * @property {string} tip
 * @property {string} cmd
 * @property {"adb"|"fastboot"} mode
 * @property {boolean} [danger]
 * @property {string} [variant]
 * @property {Function} run
 */

/** @type {Array<{id:string, name:string, icon:string, core?:boolean, commands:Command[]}>} */
export const CATEGORIES = [
  /* ---------- מידע מכשיר / אנדרואיד ---------- */
  {
    id: "device",
    name: "אנדרואיד ומידע מכשיר",
    icon: "smartphone",
    commands: [
      {
        id: "dev-model",
        label: "דגם המכשיר",
        tip: "מציג את שם הדגם המסחרי של המכשיר.",
        cmd: "adb shell getprop ro.product.model",
        mode: "adb",
        run: sh("getprop ro.product.model"),
      },
      {
        id: "dev-manufacturer",
        label: "יצרן",
        tip: "מציג את שם היצרן (Samsung, Xiaomi וכו').",
        cmd: "adb shell getprop ro.product.manufacturer",
        mode: "adb",
        run: sh("getprop ro.product.manufacturer"),
      },
      {
        id: "dev-codename",
        label: "שם קוד",
        tip: "שם הקוד הפנימי של המכשיר — חשוב לבחירת ROM/רוט נכון.",
        cmd: "adb shell getprop ro.product.device",
        mode: "adb",
        run: sh("getprop ro.product.device"),
      },
      {
        id: "dev-serial",
        label: "מספר סידורי",
        tip: "המספר הסידורי הייחודי של המכשיר.",
        cmd: "adb shell getprop ro.serialno",
        mode: "adb",
        run: sh("getprop ro.serialno"),
      },
      {
        id: "dev-android",
        label: "גרסת אנדרואיד",
        tip: "גרסת האנדרואיד המותקנת (למשל 14).",
        cmd: "adb shell getprop ro.build.version.release",
        mode: "adb",
        run: sh("getprop ro.build.version.release"),
      },
      {
        id: "dev-sdk",
        label: "רמת API",
        tip: "מספר ה-SDK של אנדרואיד (למשל 34 = אנדרואיד 14).",
        cmd: "adb shell getprop ro.build.version.sdk",
        mode: "adb",
        run: sh("getprop ro.build.version.sdk"),
      },
      {
        id: "dev-build",
        label: "מספר בילד",
        tip: "מזהה גרסת הבילד המלא של המערכת.",
        cmd: "adb shell getprop ro.build.display.id",
        mode: "adb",
        run: sh("getprop ro.build.display.id"),
      },
      {
        id: "dev-fingerprint",
        label: "טביעת אצבע של בילד",
        tip: "מחרוזת הזיהוי המלאה של הבילד — שימושי לאיתור ROM מקורי.",
        cmd: "adb shell getprop ro.build.fingerprint",
        mode: "adb",
        run: sh("getprop ro.build.fingerprint"),
      },
      {
        id: "dev-patch",
        label: "עדכון אבטחה",
        tip: "תאריך עדכון האבטחה האחרון שהותקן.",
        cmd: "adb shell getprop ro.build.version.security_patch",
        mode: "adb",
        run: sh("getprop ro.build.version.security_patch"),
      },
      {
        id: "dev-builddate",
        label: "תאריך בילד",
        tip: "מתי נבנתה גרסת המערכת המותקנת.",
        cmd: "adb shell getprop ro.build.date",
        mode: "adb",
        run: sh("getprop ro.build.date"),
      },
      {
        id: "dev-uptime",
        label: "זמן פעילות",
        tip: "כמה זמן עבר מאז האתחול האחרון.",
        cmd: "adb shell uptime",
        mode: "adb",
        run: sh("uptime"),
      },
      {
        id: "dev-kernel",
        label: "גרסת קרנל",
        tip: "פרטי הקרנל (Linux) של המכשיר.",
        cmd: "adb shell uname -a",
        mode: "adb",
        run: sh("uname -a"),
      },
      {
        id: "dev-allprops",
        label: "כל מאפייני המערכת",
        tip: "מציג את כל ה-getprop — פלט ארוך מאוד.",
        cmd: "adb shell getprop",
        mode: "adb",
        run: sh("getprop"),
      },
      {
        id: "dev-features",
        label: "יכולות חומרה",
        tip: "רשימת יכולות החומרה שהמכשיר מצהיר עליהן.",
        cmd: "adb shell pm list features",
        mode: "adb",
        run: sh("pm list features"),
      },
    ],
  },

  /* ---------- מעבד וחומרה ---------- */
  {
    id: "cpu",
    name: "מעבד וחומרה",
    icon: "cpu",
    commands: [
      {
        id: "cpu-abi",
        label: "ארכיטקטורת מעבד",
        tip: "סוג המעבד (arm64-v8a וכו') — קובע אילו קבצים מתאימים למכשיר.",
        cmd: "adb shell getprop ro.product.cpu.abi",
        mode: "adb",
        run: sh("getprop ro.product.cpu.abi"),
      },
      {
        id: "cpu-abilist",
        label: "כל הארכיטקטורות הנתמכות",
        tip: "רשימת כל ה-ABI שהמכשיר יודע להריץ.",
        cmd: "adb shell getprop ro.product.cpu.abilist",
        mode: "adb",
        run: sh("getprop ro.product.cpu.abilist"),
      },
      {
        id: "cpu-info",
        label: "פרטי מעבד מלאים",
        tip: "תוכן /proc/cpuinfo — כל הליבות והמאפיינים.",
        cmd: "adb shell cat /proc/cpuinfo",
        mode: "adb",
        run: sh("cat /proc/cpuinfo"),
      },
      {
        id: "cpu-platform",
        label: "שבב (SoC)",
        tip: "פלטפורמת החומרה — Snapdragon, MediaTek, Exynos וכו'.",
        cmd: "adb shell getprop ro.board.platform",
        mode: "adb",
        run: sh("getprop ro.board.platform"),
      },
      {
        id: "cpu-cores",
        label: "מספר ליבות",
        tip: "כמה ליבות מעבד יש במכשיר.",
        cmd: "adb shell cat /proc/cpuinfo | grep -c processor",
        mode: "adb",
        run: sh("cat /proc/cpuinfo | grep -c processor"),
      },
      {
        id: "cpu-mem",
        label: "זיכרון RAM",
        tip: "נתוני הזיכרון של המכשיר (/proc/meminfo).",
        cmd: "adb shell cat /proc/meminfo",
        mode: "adb",
        run: sh("cat /proc/meminfo"),
      },
      {
        id: "cpu-temp",
        label: "טמפרטורת מעבד",
        tip: "קורא את חיישני הטמפרטורה. לא כל מכשיר חושף אותם.",
        cmd: "adb shell dumpsys thermalservice",
        mode: "adb",
        run: sh("dumpsys thermalservice"),
      },
      {
        id: "cpu-top",
        label: "תהליכים פעילים",
        tip: "מציג את התהליכים שצורכים הכי הרבה מעבד.",
        cmd: "adb shell top -n 1 -b -m 15",
        mode: "adb",
        run: sh("top -n 1 -b -m 15"),
      },
      {
        id: "cpu-gpu",
        label: "מידע מסך וגרפיקה",
        tip: "פרטי תת-מערכת התצוגה והגרפיקה.",
        cmd: "adb shell dumpsys SurfaceFlinger --display-id",
        mode: "adb",
        run: sh("dumpsys SurfaceFlinger --display-id"),
      },
    ],
  },

  /* ---------- אפליקציות ---------- */
  {
    id: "apps",
    name: "אפליקציות",
    icon: "package",
    commands: [
      {
        id: "app-list-user",
        label: "אפליקציות שהותקנו",
        tip: "רשימת האפליקציות שהמשתמש התקין (לא של המערכת).",
        cmd: "adb shell pm list packages -3",
        mode: "adb",
        run: sh("pm list packages -3"),
      },
      {
        id: "app-list-system",
        label: "אפליקציות מערכת",
        tip: "רשימת אפליקציות המערכת המובנות.",
        cmd: "adb shell pm list packages -s",
        mode: "adb",
        run: sh("pm list packages -s"),
      },
      {
        id: "app-list-all",
        label: "כל האפליקציות",
        tip: "רשימת כל החבילות המותקנות במכשיר.",
        cmd: "adb shell pm list packages",
        mode: "adb",
        run: sh("pm list packages"),
      },
      {
        id: "app-list-disabled",
        label: "אפליקציות מושבתות",
        tip: "רשימת האפליקציות שהושבתו.",
        cmd: "adb shell pm list packages -d",
        mode: "adb",
        run: sh("pm list packages -d"),
      },
      {
        id: "app-current",
        label: "האפליקציה שפתוחה כרגע",
        tip: "מזהה איזו אפליקציה נמצאת כרגע על המסך.",
        cmd: "adb shell dumpsys window | grep mCurrentFocus",
        mode: "adb",
        run: sh("dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'"),
      },
      {
        id: "app-install",
        label: "התקן APK",
        tip: "בחירת קובץ APK אחד והתקנתו במכשיר.",
        cmd: "adb install <file.apk>",
        mode: "adb",
        variant: "green",
        run: async () => {
          const file = await pickFiles({ accept: ".apk" });
          if (!file) return log.warn("לא נבחר קובץ.");
          await ops.installApk(file);
        },
      },
      {
        id: "app-info",
        label: "מידע על אפליקציה",
        tip: "מציג פרטים מלאים על חבילה: גרסה, הרשאות, נתיב.",
        cmd: "adb shell dumpsys package <pkg>",
        mode: "adb",
        run: async () => {
          const pkg = await askPackage("מידע על אפליקציה");
          if (pkg) await adbService.shell(`dumpsys package ${pkg}`);
        },
      },
      {
        id: "app-path",
        label: "נתיב ה-APK",
        tip: "מציג היכן נמצא קובץ ה-APK של החבילה במכשיר.",
        cmd: "adb shell pm path <pkg>",
        mode: "adb",
        run: async () => {
          const pkg = await askPackage("נתיב APK");
          if (pkg) await adbService.shell(`pm path ${pkg}`);
        },
      },
      {
        id: "app-extract",
        label: "ייצא APK למחשב",
        tip: "מוריד את קובץ ה-APK של אפליקציה מותקנת אל המחשב.",
        cmd: "adb pull <apk-path>",
        mode: "adb",
        run: async () => {
          const pkg = await askPackage("ייצוא APK");
          if (pkg) await ops.extractApk(pkg);
        },
      },
      {
        id: "app-launch",
        label: "הפעל אפליקציה",
        tip: "פותח אפליקציה על המכשיר לפי שם החבילה.",
        cmd: "adb shell monkey -p <pkg> 1",
        mode: "adb",
        run: async () => {
          const pkg = await askPackage("הפעלת אפליקציה");
          if (pkg) await adbService.shell(`monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`);
        },
      },
      {
        id: "app-stop",
        label: "עצור אפליקציה",
        tip: "סוגר בכוח אפליקציה שרצה.",
        cmd: "adb shell am force-stop <pkg>",
        mode: "adb",
        run: async () => {
          const pkg = await askPackage("עצירת אפליקציה");
          if (pkg) await adbService.shell(`am force-stop ${pkg}`);
        },
      },
      {
        id: "app-clear",
        label: "נקה נתוני אפליקציה",
        tip: "מוחק את כל הנתונים והמטמון של האפליקציה (כמו איפוס).",
        cmd: "adb shell pm clear <pkg>",
        mode: "adb",
        danger: true,
        run: async () => {
          const pkg = await askPackage("ניקוי נתוני אפליקציה");
          if (!pkg) return;
          const ok = await riskModal({
            title: "ניקוי נתוני אפליקציה",
            what: `כל הנתונים של '${pkg}' יימחקו מהמכשיר.`,
            risks: [
              "המשתמש ייצא מהחשבון באפליקציה.",
              "כל ההגדרות והקבצים המקומיים של האפליקציה יימחקו.",
              "לא ניתן לשחזר את הנתונים.",
            ],
            typeWord: "נקה",
            confirmLabel: "נקה נתונים",
          });
          if (ok) await adbService.shell(`pm clear ${pkg}`);
        },
      },
      {
        id: "app-disable",
        label: "השבת אפליקציה",
        tip: "משבית אפליקציה בלי למחוק אותה (עובד גם על אפליקציות מערכת).",
        cmd: "adb shell pm disable-user <pkg>",
        mode: "adb",
        run: async () => {
          const pkg = await askPackage("השבתת אפליקציה");
          if (pkg) await adbService.shell(`pm disable-user --user 0 ${pkg}`);
        },
      },
      {
        id: "app-enable",
        label: "הפעל אפליקציה מושבתת",
        tip: "מחזיר לפעולה אפליקציה שהושבתה.",
        cmd: "adb shell pm enable <pkg>",
        mode: "adb",
        run: async () => {
          const pkg = await askPackage("הפעלת אפליקציה מושבתת");
          if (pkg) await adbService.shell(`pm enable ${pkg}`);
        },
      },
      {
        id: "app-uninstall",
        label: "מחק אפליקציה",
        tip: "מסיר אפליקציה מהמכשיר לפי שם חבילה.",
        cmd: "adb uninstall <pkg>",
        mode: "adb",
        danger: true,
        variant: "danger",
        run: async () => {
          const pkg = await askPackage("מחיקת אפליקציה");
          if (pkg) await uninstallPackage(pkg);
        },
      },
      {
        id: "app-permissions",
        label: "הרשאות אפליקציה",
        tip: "מציג אילו הרשאות ניתנו לאפליקציה.",
        cmd: "adb shell dumpsys package <pkg> | grep permission",
        mode: "adb",
        run: async () => {
          const pkg = await askPackage("הרשאות אפליקציה");
          if (pkg) await adbService.shell(`dumpsys package ${pkg} | grep -i permission`);
        },
      },
    ],
  },

  /* ---------- קבצים ואחסון ---------- */
  {
    id: "files",
    name: "קבצים ואחסון",
    icon: "hdd",
    commands: [
      {
        id: "file-df",
        label: "שטח אחסון פנוי",
        tip: "מציג כמה מקום פנוי בכל אזור אחסון.",
        cmd: "adb shell df -h",
        mode: "adb",
        run: sh("df -h"),
      },
      {
        id: "file-ls-sdcard",
        label: "תוכן הזיכרון הפנימי",
        tip: "רשימת הקבצים ב-/sdcard.",
        cmd: "adb shell ls -la /sdcard",
        mode: "adb",
        run: sh("ls -la /sdcard"),
      },
      {
        id: "file-du",
        label: "גודל תיקיות",
        tip: "מציג את הגודל של כל תיקייה בזיכרון הפנימי.",
        cmd: "adb shell du -sh /sdcard/*",
        mode: "adb",
        run: sh("du -sh /sdcard/* 2>/dev/null"),
      },
      {
        id: "file-push",
        label: "העלה קובץ למכשיר",
        tip: "בוחר קובץ מהמחשב ומעלה אותו אל /sdcard/Download.",
        cmd: "adb push <file> /sdcard/Download/",
        mode: "adb",
        run: async () => {
          const file = await pickFiles();
          if (!file) return log.warn("לא נבחר קובץ.");
          await ops.pushFile(file, `/sdcard/Download/${file.name}`);
        },
      },
      {
        id: "file-pull",
        label: "הורד קובץ מהמכשיר",
        tip: "מוריד קובץ מנתיב שתזין אל המחשב.",
        cmd: "adb pull <remote-path>",
        mode: "adb",
        run: async () => {
          const path = await promptModal({
            title: "הורדת קובץ מהמכשיר",
            label: "נתיב מלא במכשיר",
            placeholder: "/sdcard/Download/file.txt",
          });
          if (path) await ops.pullToDisk(path);
        },
      },
      {
        id: "file-ls",
        label: "הצג תיקייה",
        tip: "מציג את תוכן התיקייה שתזין.",
        cmd: "adb shell ls -la <path>",
        mode: "adb",
        run: async () => {
          const path = await promptModal({
            title: "הצגת תיקייה",
            label: "נתיב תיקייה",
            placeholder: "/sdcard",
            value: "/sdcard",
          });
          if (path) await adbService.shell(`ls -la "${path}"`);
        },
      },
      {
        id: "file-mkdir",
        label: "צור תיקייה",
        tip: "יוצר תיקייה חדשה במכשיר.",
        cmd: "adb shell mkdir -p <path>",
        mode: "adb",
        run: async () => {
          const path = await promptModal({
            title: "יצירת תיקייה",
            label: "נתיב התיקייה החדשה",
            placeholder: "/sdcard/MyFolder",
          });
          if (path) await adbService.shell(`mkdir -p "${path}"`);
        },
      },
      {
        id: "file-rm",
        label: "מחק קובץ",
        tip: "מוחק קובץ או תיקייה מהמכשיר — בלתי הפיך.",
        cmd: "adb shell rm -rf <path>",
        mode: "adb",
        danger: true,
        variant: "danger",
        run: async () => {
          const path = await promptModal({
            title: "מחיקת קובץ",
            label: "נתיב מלא למחיקה",
            placeholder: "/sdcard/Download/file.txt",
          });
          if (!path) return;
          const ok = await riskModal({
            title: "מחיקת קובץ",
            what: `הנתיב '${path}' יימחק מהמכשיר לצמיתות.`,
            risks: [
              "המחיקה בלתי הפיכה — אין סל מיחזור.",
              "מחיקת תיקיית מערכת עלולה להשבית את המכשיר.",
              "ודא שהנתיב מדויק לפני האישור.",
            ],
            typeWord: "מחק",
            confirmLabel: "מחק לצמיתות",
          });
          if (ok) await adbService.shell(`rm -rf "${path}"`);
        },
      },
      {
        id: "file-cat",
        label: "הצג תוכן קובץ",
        tip: "מדפיס את תוכן קובץ טקסט אל הלוג.",
        cmd: "adb shell cat <path>",
        mode: "adb",
        run: async () => {
          const path = await promptModal({
            title: "הצגת תוכן קובץ",
            label: "נתיב הקובץ",
            placeholder: "/sdcard/file.txt",
          });
          if (path) await adbService.shell(`cat "${path}"`);
        },
      },
      {
        id: "file-mount",
        label: "רשימת התקני אחסון",
        tip: "מציג את כל נקודות העגינה (mount points).",
        cmd: "adb shell mount",
        mode: "adb",
        run: sh("mount"),
      },
    ],
  },

  /* ---------- מסך וקלט ---------- */
  {
    id: "screen",
    name: "מסך וקלט",
    icon: "monitor",
    commands: [
      {
        id: "scr-shot",
        label: "צילום מסך",
        tip: "מצלם את מסך המכשיר ומוריד את התמונה למחשב.",
        cmd: "adb shell screencap -p",
        mode: "adb",
        variant: "primary",
        run: () => ops.screenshot(),
      },
      {
        id: "scr-record",
        label: "הקלטת מסך",
        tip: "מקליט את מסך המכשיר ומוריד קובץ MP4.",
        cmd: "adb shell screenrecord",
        mode: "adb",
        run: async () => {
          const secs = await promptModal({
            title: "הקלטת מסך",
            label: "משך ההקלטה בשניות (עד 180)",
            placeholder: "10",
            value: "10",
          });
          if (!secs) return;
          const n = Math.min(180, Math.max(1, parseInt(secs, 10) || 10));
          await ops.screenRecord(n);
        },
      },
      {
        id: "scr-size",
        label: "רזולוציית מסך",
        tip: "מציג את רזולוציית המסך הנוכחית.",
        cmd: "adb shell wm size",
        mode: "adb",
        run: sh("wm size"),
      },
      {
        id: "scr-density",
        label: "צפיפות מסך (DPI)",
        tip: "מציג את צפיפות הפיקסלים של המסך.",
        cmd: "adb shell wm density",
        mode: "adb",
        run: sh("wm density"),
      },
      {
        id: "scr-set-size",
        label: "שנה רזולוציה",
        tip: "משנה את רזולוציית המסך. שינוי קיצוני עלול להקשות על השימוש.",
        cmd: "adb shell wm size <WxH>",
        mode: "adb",
        run: async () => {
          const size = await promptModal({
            title: "שינוי רזולוציה",
            label: "רזולוציה חדשה",
            placeholder: "1080x1920",
            hint: "אפשר לאפס בכל רגע דרך 'אפס רזולוציה'.",
          });
          if (size) await adbService.shell(`wm size ${size}`);
        },
      },
      {
        id: "scr-reset-size",
        label: "אפס רזולוציה",
        tip: "מחזיר את רזולוציית המסך לברירת המחדל של היצרן.",
        cmd: "adb shell wm size reset",
        mode: "adb",
        run: sh("wm size reset"),
      },
      {
        id: "scr-set-density",
        label: "שנה DPI",
        tip: "משנה את צפיפות המסך — משפיע על גודל האלמנטים.",
        cmd: "adb shell wm density <dpi>",
        mode: "adb",
        run: async () => {
          const dpi = await promptModal({
            title: "שינוי DPI",
            label: "ערך DPI חדש",
            placeholder: "420",
          });
          if (dpi) await adbService.shell(`wm density ${dpi}`);
        },
      },
      {
        id: "scr-reset-density",
        label: "אפס DPI",
        tip: "מחזיר את צפיפות המסך לברירת המחדל.",
        cmd: "adb shell wm density reset",
        mode: "adb",
        run: sh("wm density reset"),
      },
      {
        id: "scr-power",
        label: "לחצן הפעלה",
        tip: "מדמה לחיצה על כפתור ההפעלה (מדליק/מכבה מסך).",
        cmd: "adb shell input keyevent 26",
        mode: "adb",
        run: sh("input keyevent 26"),
      },
      {
        id: "scr-wake",
        label: "הדלק מסך",
        tip: "מעיר את המסך אם הוא כבוי.",
        cmd: "adb shell input keyevent 224",
        mode: "adb",
        run: sh("input keyevent 224"),
      },
      {
        id: "scr-sleep",
        label: "כבה מסך",
        tip: "מכבה את המסך ונועל את המכשיר.",
        cmd: "adb shell input keyevent 223",
        mode: "adb",
        run: sh("input keyevent 223"),
      },
      {
        id: "scr-home",
        label: "כפתור בית",
        tip: "מדמה לחיצה על כפתור הבית.",
        cmd: "adb shell input keyevent 3",
        mode: "adb",
        run: sh("input keyevent 3"),
      },
      {
        id: "scr-back",
        label: "כפתור חזרה",
        tip: "מדמה לחיצה על כפתור החזרה.",
        cmd: "adb shell input keyevent 4",
        mode: "adb",
        run: sh("input keyevent 4"),
      },
      {
        id: "scr-recents",
        label: "אפליקציות אחרונות",
        tip: "פותח את מסך האפליקציות האחרונות.",
        cmd: "adb shell input keyevent 187",
        mode: "adb",
        run: sh("input keyevent 187"),
      },
      {
        id: "scr-volup",
        label: "הגבר ווליום",
        tip: "מדמה לחיצה על הגברת עוצמת הקול.",
        cmd: "adb shell input keyevent 24",
        mode: "adb",
        run: sh("input keyevent 24"),
      },
      {
        id: "scr-voldown",
        label: "הנמך ווליום",
        tip: "מדמה לחיצה על הנמכת עוצמת הקול.",
        cmd: "adb shell input keyevent 25",
        mode: "adb",
        run: sh("input keyevent 25"),
      },
      {
        id: "scr-tap",
        label: "לחיצה במסך",
        tip: "מדמה נגיעה בנקודה מסוימת על המסך.",
        cmd: "adb shell input tap <x> <y>",
        mode: "adb",
        run: async () => {
          const coords = await promptModal({
            title: "לחיצה במסך",
            label: "קואורדינטות X Y",
            placeholder: "540 1200",
            hint: "אפשר לראות קואורדינטות דרך 'מיקום מגע' באפשרויות מפתחים.",
          });
          if (coords) await adbService.shell(`input tap ${coords}`);
        },
      },
      {
        id: "scr-swipe",
        label: "החלקה במסך",
        tip: "מדמה החלקה מנקודה לנקודה.",
        cmd: "adb shell input swipe <x1> <y1> <x2> <y2>",
        mode: "adb",
        run: async () => {
          const coords = await promptModal({
            title: "החלקה במסך",
            label: "X1 Y1 X2 Y2 (ואופציונלי משך במילישניות)",
            placeholder: "540 1500 540 500 300",
          });
          if (coords) await adbService.shell(`input swipe ${coords}`);
        },
      },
      {
        id: "scr-text",
        label: "הקלד טקסט",
        tip: "מקליד טקסט לתוך השדה הפעיל במכשיר (אנגלית בלבד).",
        cmd: "adb shell input text <text>",
        mode: "adb",
        run: async () => {
          const text = await promptModal({
            title: "הקלדת טקסט",
            label: "הטקסט להקלדה",
            placeholder: "hello",
            hint: "רווחים מומרים אוטומטית. תווים בעברית לא נתמכים ב-input text.",
          });
          if (text) await adbService.shell(`input text "${text.replace(/ /g, "%s")}"`);
        },
      },
      {
        id: "scr-rotate",
        label: "נעל סיבוב מסך",
        tip: "מכבה את הסיבוב האוטומטי של המסך.",
        cmd: "adb shell settings put system accelerometer_rotation 0",
        mode: "adb",
        run: sh("settings put system accelerometer_rotation 0"),
      },
      {
        id: "scr-rotate-on",
        label: "אפשר סיבוב מסך",
        tip: "מפעיל בחזרה את הסיבוב האוטומטי.",
        cmd: "adb shell settings put system accelerometer_rotation 1",
        mode: "adb",
        run: sh("settings put system accelerometer_rotation 1"),
      },
    ],
  },

  /* ---------- לוגים ---------- */
  {
    id: "logs",
    name: "לוגים",
    icon: "scroll",
    commands: [
      {
        id: "log-live",
        label: "logcat בזמן אמת",
        tip: "מפעיל/עוצר זרימת לוג חי מהמכשיר אל הפאנל למטה.",
        cmd: "adb logcat",
        mode: "adb",
        variant: "primary",
        run: () => toggleLogcat(),
      },
      {
        id: "log-stop",
        label: "עצור logcat",
        tip: "עוצר את זרימת ה-logcat.",
        cmd: "kill logcat",
        mode: "adb",
        run: () => stopLogcat(),
      },
      {
        id: "log-errors",
        label: "שגיאות בלבד",
        tip: "מציג רק שורות לוג ברמת Error ומעלה.",
        cmd: "adb logcat -d *:E",
        mode: "adb",
        run: sh("logcat -d *:E -t 200"),
      },
      {
        id: "log-filter",
        label: "logcat עם סינון",
        tip: "מציג לוג מסונן לפי תג או מילת מפתח.",
        cmd: "adb logcat -d | grep <filter>",
        mode: "adb",
        run: async () => {
          const filter = await promptModal({
            title: "סינון logcat",
            label: "מילת סינון",
            placeholder: "ActivityManager",
          });
          if (filter) await adbService.shell(`logcat -d -t 300 | grep -i "${filter}"`);
        },
      },
      {
        id: "log-clear",
        label: "נקה logcat",
        tip: "מוחק את חוצץ הלוג במכשיר עצמו.",
        cmd: "adb logcat -c",
        mode: "adb",
        run: sh("logcat -c"),
      },
      {
        id: "log-last",
        label: "200 שורות אחרונות",
        tip: "מציג את 200 שורות הלוג האחרונות.",
        cmd: "adb logcat -d -t 200",
        mode: "adb",
        run: sh("logcat -d -t 200"),
      },
      {
        id: "log-crash",
        label: "לוג קריסות",
        tip: "מציג את חוצץ הקריסות של המערכת.",
        cmd: "adb logcat -b crash -d",
        mode: "adb",
        run: sh("logcat -b crash -d -t 200"),
      },
      {
        id: "log-dmesg",
        label: "לוג קרנל",
        tip: "מציג את הודעות הקרנל (dmesg). לרוב דורש הרשאות גבוהות.",
        cmd: "adb shell dmesg",
        mode: "adb",
        run: sh("dmesg 2>/dev/null | tail -100"),
      },
      {
        id: "log-radio",
        label: "לוג רדיו/סלולר",
        tip: "מציג את חוצץ הלוג של המודם הסלולרי.",
        cmd: "adb logcat -b radio -d",
        mode: "adb",
        run: sh("logcat -b radio -d -t 100"),
      },
      {
        id: "log-save",
        label: "שמור לוג לקובץ",
        tip: "מוריד את הלוג הנוכחי של האתר כקובץ טקסט.",
        cmd: "save log",
        mode: "adb",
        run: async () => {
          const blob = new Blob([log.toText()], { type: "text/plain;charset=utf-8" });
          ops.downloadBlob(blob, ops.stampedName("mahshirot-log", "txt"));
        },
      },
    ],
  },

  /* ---------- סוללה ---------- */
  {
    id: "battery",
    name: "סוללה",
    icon: "battery",
    commands: [
      {
        id: "bat-status",
        label: "מצב סוללה",
        tip: "מציג את כל נתוני הסוללה: אחוז, בריאות, טמפרטורה, מתח.",
        cmd: "adb shell dumpsys battery",
        mode: "adb",
        variant: "primary",
        run: sh("dumpsys battery"),
      },
      {
        id: "bat-level",
        label: "אחוז טעינה",
        tip: "מציג רק את אחוז הטעינה הנוכחי.",
        cmd: "adb shell dumpsys battery | grep level",
        mode: "adb",
        run: sh("dumpsys battery | grep -i level"),
      },
      {
        id: "bat-health",
        label: "בריאות הסוללה",
        tip: "מציג את מצב בריאות הסוללה כפי שהמערכת מדווחת.",
        cmd: "adb shell dumpsys battery | grep health",
        mode: "adb",
        run: sh("dumpsys battery | grep -iE 'health|temperature|voltage'"),
      },
      {
        id: "bat-capacity",
        label: "קיבולת מתוכננת",
        tip: "קורא את קיבולת הסוללה מהחיישן (לא נתמך בכל מכשיר).",
        cmd: "adb shell cat /sys/class/power_supply/battery/charge_full",
        mode: "adb",
        run: sh(
          "cat /sys/class/power_supply/battery/charge_full_design 2>/dev/null || echo 'לא נתמך במכשיר הזה'",
        ),
      },
      {
        id: "bat-set-level",
        label: "הדמיית אחוז טעינה",
        tip: "מדמה אחוז טעינה למערכת — לבדיקות בלבד. לא משנה את הסוללה בפועל.",
        cmd: "adb shell dumpsys battery set level <n>",
        mode: "adb",
        run: async () => {
          const level = await promptModal({
            title: "הדמיית אחוז טעינה",
            label: "אחוז (0-100)",
            placeholder: "50",
            hint: "זו הדמיה למערכת בלבד. אפס אותה עם 'אפס הדמיית סוללה'.",
          });
          if (level) await adbService.shell(`dumpsys battery set level ${parseInt(level, 10) || 50}`);
        },
      },
      {
        id: "bat-unplug",
        label: "הדמיית ניתוק מטען",
        tip: "גורם למערכת לחשוב שהמטען נותק — לבדיקות.",
        cmd: "adb shell dumpsys battery unplug",
        mode: "adb",
        run: sh("dumpsys battery unplug"),
      },
      {
        id: "bat-reset",
        label: "אפס הדמיית סוללה",
        tip: "מבטל את כל ההדמיות ומחזיר את הדיווח האמיתי.",
        cmd: "adb shell dumpsys battery reset",
        mode: "adb",
        variant: "green",
        run: sh("dumpsys battery reset"),
      },
      {
        id: "bat-stats-reset",
        label: "אפס סטטיסטיקות סוללה",
        tip: "מאפס את מוני צריכת הסוללה של המערכת.",
        cmd: "adb shell dumpsys batterystats --reset",
        mode: "adb",
        run: sh("dumpsys batterystats --reset"),
      },
      {
        id: "bat-usage",
        label: "צריכת סוללה לפי אפליקציה",
        tip: "מציג אילו אפליקציות צורכות הכי הרבה סוללה.",
        cmd: "adb shell dumpsys batterystats",
        mode: "adb",
        run: sh("dumpsys batterystats --charged 2>/dev/null | head -60"),
      },
    ],
  },

  /* ---------- רשת ---------- */
  {
    id: "network",
    name: "רשת",
    icon: "wifi",
    commands: [
      {
        id: "net-ip",
        label: "כתובת IP",
        tip: "מציג את כתובות ה-IP של כל ממשקי הרשת.",
        cmd: "adb shell ip addr show",
        mode: "adb",
        variant: "primary",
        run: sh("ip addr show 2>/dev/null | grep -E 'inet |^[0-9]'"),
      },
      {
        id: "net-wifi-ip",
        label: "IP של Wi-Fi",
        tip: "מציג את כתובת ה-IP בממשק ה-Wi-Fi בלבד.",
        cmd: "adb shell ip addr show wlan0",
        mode: "adb",
        run: sh("ip addr show wlan0 2>/dev/null | grep 'inet '"),
      },
      {
        id: "net-wifi-info",
        label: "מידע Wi-Fi",
        tip: "מציג את פרטי החיבור האלחוטי הנוכחי.",
        cmd: "adb shell dumpsys wifi",
        mode: "adb",
        run: sh("dumpsys wifi | head -40"),
      },
      {
        id: "net-tcpip",
        label: "הפעל ADB דרך Wi-Fi",
        tip: "מעביר את ADB למצב TCP/IP על פורט 5555 — מאפשר חיבור בלי כבל.",
        cmd: "adb tcpip 5555",
        mode: "adb",
        run: async () => {
          log.cmd("adb tcpip 5555");
          await adbService.shell("setprop service.adb.tcp.port 5555", { quiet: true });
          await adbService.shell("stop adbd", { quiet: true }).catch(() => {});
          await adbService.shell("start adbd", { quiet: true }).catch(() => {});
          const ip = await adbService.shellQuiet("ip addr show wlan0 | grep 'inet ' | awk '{print $2}'");
          log.ok(`ADB over TCP/IP הופעל על פורט 5555.`);
          if (ip) {
            log.info(`כתובת המכשיר: ${ip.split("/")[0]}:5555`);
          }
          log.warn(
            "שים לב: האתר עצמו לא יכול להתחבר דרך TCP/IP (הדפדפן חוסם חיבורי רשת גולמיים). זה שימושי רק ל-ADB שמותקן במחשב.",
          );
        },
      },
      {
        id: "net-usb",
        label: "החזר ADB ל-USB",
        tip: "מבטל את מצב TCP/IP ומחזיר את ADB לעבודה דרך כבל בלבד.",
        cmd: "adb usb",
        mode: "adb",
        run: async () => {
          log.cmd("adb usb");
          await adbService.shell("setprop service.adb.tcp.port -1", { quiet: true });
          await adbService.shell("stop adbd", { quiet: true }).catch(() => {});
          await adbService.shell("start adbd", { quiet: true }).catch(() => {});
          log.ok("ADB הוחזר למצב USB.");
        },
      },
      {
        id: "net-wifi-on",
        label: "הפעל Wi-Fi",
        tip: "מדליק את ה-Wi-Fi במכשיר.",
        cmd: "adb shell svc wifi enable",
        mode: "adb",
        run: sh("svc wifi enable"),
      },
      {
        id: "net-wifi-off",
        label: "כבה Wi-Fi",
        tip: "מכבה את ה-Wi-Fi במכשיר.",
        cmd: "adb shell svc wifi disable",
        mode: "adb",
        run: sh("svc wifi disable"),
      },
      {
        id: "net-data-on",
        label: "הפעל נתונים סלולריים",
        tip: "מדליק את חבילת הגלישה הסלולרית.",
        cmd: "adb shell svc data enable",
        mode: "adb",
        run: sh("svc data enable"),
      },
      {
        id: "net-data-off",
        label: "כבה נתונים סלולריים",
        tip: "מכבה את חבילת הגלישה הסלולרית.",
        cmd: "adb shell svc data disable",
        mode: "adb",
        run: sh("svc data disable"),
      },
      {
        id: "net-netstat",
        label: "חיבורי רשת פעילים",
        tip: "מציג את החיבורים הפתוחים במכשיר.",
        cmd: "adb shell netstat",
        mode: "adb",
        run: sh("netstat -tunp 2>/dev/null | head -40"),
      },
      {
        id: "net-ping",
        label: "בדיקת חיבור לאינטרנט",
        tip: "שולח ping ל-8.8.8.8 כדי לבדוק שיש אינטרנט.",
        cmd: "adb shell ping -c 4 8.8.8.8",
        mode: "adb",
        run: sh("ping -c 4 8.8.8.8"),
      },
      {
        id: "net-airplane-on",
        label: "הפעל מצב טיסה",
        tip: "מפעיל מצב טיסה (עשוי לדרוש הרשאות באנדרואיד חדש).",
        cmd: "adb shell settings put global airplane_mode_on 1",
        mode: "adb",
        run: async () => {
          await adbService.shell("settings put global airplane_mode_on 1");
          await adbService.shell(
            "am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true",
          );
        },
      },
      {
        id: "net-airplane-off",
        label: "כבה מצב טיסה",
        tip: "מכבה את מצב הטיסה.",
        cmd: "adb shell settings put global airplane_mode_on 0",
        mode: "adb",
        run: async () => {
          await adbService.shell("settings put global airplane_mode_on 0");
          await adbService.shell(
            "am broadcast -a android.intent.action.AIRPLANE_MODE --ez state false",
          );
        },
      },
    ],
  },

  /* ---------- אבטחה ---------- */
  {
    id: "security",
    name: "אבטחה",
    icon: "shield",
    commands: [
      {
        id: "sec-verifiedboot",
        label: "מצב Verified Boot",
        tip: "מציג אם המערכת עברה אימות אתחול (green = תקין, orange = בוטלואדר פתוח).",
        cmd: "adb shell getprop ro.boot.verifiedbootstate",
        mode: "adb",
        variant: "primary",
        run: sh("getprop ro.boot.verifiedbootstate"),
      },
      {
        id: "sec-locked",
        label: "מצב נעילת בוטלואדר",
        tip: "בודק אם הבוטלואדר נעול, דרך מאפיין המערכת.",
        cmd: "adb shell getprop ro.boot.flash.locked",
        mode: "adb",
        run: sh("getprop ro.boot.flash.locked"),
      },
      {
        id: "sec-selinux",
        label: "מצב SELinux",
        tip: "מציג אם SELinux במצב Enforcing (מאובטח) או Permissive.",
        cmd: "adb shell getenforce",
        mode: "adb",
        run: sh("getenforce"),
      },
      {
        id: "sec-root",
        label: "בדיקת רוט",
        tip: "בודק אם קיים בינארי su במכשיר — סימן לרוט.",
        cmd: "adb shell which su",
        mode: "adb",
        run: sh("which su 2>/dev/null || echo 'לא נמצא su — המכשיר כנראה ללא רוט'"),
      },
      {
        id: "sec-magisk",
        label: "בדיקת Magisk",
        tip: "בודק אם Magisk מותקן במכשיר.",
        cmd: "adb shell pm list packages | grep magisk",
        mode: "adb",
        run: sh("pm list packages | grep -i magisk || echo 'Magisk לא נמצא'"),
      },
      {
        id: "sec-oem-unlock",
        label: "מצב 'פתיחת OEM'",
        tip: "בודק אם המשתמש הפעיל 'OEM unlocking' באפשרויות מפתחים.",
        cmd: "adb shell getprop sys.oem_unlock_allowed",
        mode: "adb",
        run: sh("getprop sys.oem_unlock_allowed"),
      },
      {
        id: "sec-encryption",
        label: "מצב הצפנה",
        tip: "מציג את סוג ההצפנה של אחסון המכשיר.",
        cmd: "adb shell getprop ro.crypto.state",
        mode: "adb",
        run: sh("getprop ro.crypto.state; getprop ro.crypto.type"),
      },
      {
        id: "sec-perm-grant",
        label: "תן הרשאה לאפליקציה",
        tip: "מעניק הרשאה ספציפית לאפליקציה בלי לעבור בהגדרות.",
        cmd: "adb shell pm grant <pkg> <permission>",
        mode: "adb",
        run: async () => {
          const pkg = await askPackage("הענקת הרשאה");
          if (!pkg) return;
          const perm = await promptModal({
            title: "הענקת הרשאה",
            label: "שם ההרשאה",
            placeholder: "android.permission.CAMERA",
          });
          if (perm) await adbService.shell(`pm grant ${pkg} ${perm}`);
        },
      },
      {
        id: "sec-perm-revoke",
        label: "שלול הרשאה מאפליקציה",
        tip: "מבטל הרשאה שניתנה לאפליקציה.",
        cmd: "adb shell pm revoke <pkg> <permission>",
        mode: "adb",
        run: async () => {
          const pkg = await askPackage("שלילת הרשאה");
          if (!pkg) return;
          const perm = await promptModal({
            title: "שלילת הרשאה",
            label: "שם ההרשאה",
            placeholder: "android.permission.CAMERA",
          });
          if (perm) await adbService.shell(`pm revoke ${pkg} ${perm}`);
        },
      },
      {
        id: "sec-perm-list",
        label: "רשימת כל ההרשאות",
        tip: "מציג את כל ההרשאות שהמערכת מכירה.",
        cmd: "adb shell pm list permissions -g",
        mode: "adb",
        run: sh("pm list permissions -g -d"),
      },
    ],
  },

  /* ---------- גיבוי ושחזור ---------- */
  {
    id: "backup",
    name: "גיבוי ושחזור",
    icon: "archive",
    commands: [
      {
        id: "bk-full",
        label: "גיבוי מלא",
        tip: "מגבה אפליקציות ונתונים לקובץ .ab. הוצא משימוש באנדרואיד 12+.",
        cmd: "adb backup -all -apk",
        mode: "adb",
        variant: "primary",
        run: () => ops.backup("-all -apk"),
      },
      {
        id: "bk-apps",
        label: "גיבוי אפליקציות בלבד",
        tip: "מגבה רק את קבצי ה-APK בלי נתוני משתמש.",
        cmd: "adb backup -apk -noshared -all",
        mode: "adb",
        run: () => ops.backup("-apk -noshared -all"),
      },
      {
        id: "bk-shared",
        label: "גיבוי כולל אחסון משותף",
        tip: "מגבה גם את תוכן הזיכרון הפנימי (/sdcard).",
        cmd: "adb backup -all -apk -shared",
        mode: "adb",
        run: () => ops.backup("-all -apk -shared"),
      },
      {
        id: "bk-single",
        label: "גיבוי אפליקציה בודדת",
        tip: "מגבה אפליקציה אחת לפי שם חבילה.",
        cmd: "adb backup -apk <pkg>",
        mode: "adb",
        run: async () => {
          const pkg = await askPackage("גיבוי אפליקציה");
          if (pkg) await ops.backup(`-apk ${pkg}`);
        },
      },
      {
        id: "bk-restore",
        label: "שחזור מגיבוי",
        tip: "משחזר קובץ גיבוי .ab אל המכשיר.",
        cmd: "adb restore <file.ab>",
        mode: "adb",
        danger: true,
        run: async () => {
          const file = await pickFiles({ accept: ".ab" });
          if (!file) return log.warn("לא נבחר קובץ.");
          const ok = await confirmModal({
            title: "שחזור גיבוי",
            message: `לשחזר את '${file.name}' אל המכשיר? נתונים קיימים עלולים להידרס.`,
            confirmLabel: "שחזר",
            tone: "warn",
          });
          if (ok) await ops.restore(file);
        },
      },
      {
        id: "bk-pull-sdcard",
        label: "הורד תיקייה מהמכשיר",
        tip: "מוריד קובץ בודד מנתיב שתזין (לגיבוי ידני).",
        cmd: "adb pull <path>",
        mode: "adb",
        run: async () => {
          const path = await promptModal({
            title: "הורדת קובץ לגיבוי",
            label: "נתיב מלא במכשיר",
            placeholder: "/sdcard/DCIM/Camera/photo.jpg",
          });
          if (path) await ops.pullToDisk(path);
        },
      },
    ],
  },

  /* ---------- שחזור ואתחול ---------- */
  {
    id: "recovery",
    name: "אתחול ומצבי שחזור",
    icon: "refresh",
    commands: [
      {
        id: "rb-system",
        label: "אתחל למערכת",
        tip: "מאתחל את המכשיר רגיל.",
        cmd: "adb reboot",
        mode: "adb",
        variant: "primary",
        run: async () => {
          log.cmd("adb reboot");
          await adbService.requireDevice().power.reboot();
          log.ok("פקודת אתחול נשלחה.");
        },
      },
      {
        id: "rb-recovery",
        label: "אתחל ל-Recovery",
        tip: "מאתחל את המכשיר למצב שחזור.",
        cmd: "adb reboot recovery",
        mode: "adb",
        run: async () => {
          log.cmd("adb reboot recovery");
          await adbService.requireDevice().power.recovery();
          log.ok("המכשיר מאתחל ל-Recovery.");
        },
      },
      {
        id: "rb-bootloader",
        label: "אתחל לבוטלואדר",
        tip: "מאתחל את המכשיר למצב Fastboot/בוטלואדר.",
        cmd: "adb reboot bootloader",
        mode: "adb",
        variant: "orange",
        run: async () => {
          log.cmd("adb reboot bootloader");
          await adbService.requireDevice().power.bootloader();
          log.ok("המכשיר מאתחל לבוטלואדר.");
        },
      },
      {
        id: "rb-fastbootd",
        label: "אתחל ל-Fastbootd",
        tip: "מאתחל ל-Fastboot של המערכת (userspace) — נדרש לפרטישנים לוגיים.",
        cmd: "adb reboot fastboot",
        mode: "adb",
        run: async () => {
          log.cmd("adb reboot fastboot");
          await adbService.requireDevice().power.fastboot();
          log.ok("המכשיר מאתחל ל-Fastbootd.");
        },
      },
      {
        id: "rb-sideload",
        label: "אתחל ל-Sideload",
        tip: "מאתחל למצב sideload להתקנת עדכון OTA.",
        cmd: "adb reboot sideload",
        mode: "adb",
        run: async () => {
          log.cmd("adb reboot sideload");
          await adbService.requireDevice().power.sideload();
          log.ok("המכשיר מאתחל ל-Sideload.");
        },
      },
      {
        id: "rb-edl",
        label: "אתחל ל-EDL (קוואלקום)",
        tip: "מצב הורדת חירום של קוואלקום. מסוכן — יציאה ממנו לרוב דורשת כלים ייעודיים.",
        cmd: "adb reboot edl",
        mode: "adb",
        danger: true,
        variant: "danger",
        run: async () => {
          const ok = await riskModal({
            title: "אתחול למצב EDL",
            what: "המכשיר יאותחל למצב Emergency Download של קוואלקום.",
            risks: [
              "המסך יישאר שחור לחלוטין — זה נורמלי במצב EDL.",
              "יציאה מהמצב לרוב דורשת כלים ייעודיים של היצרן.",
              "מיועד למשתמשים מנוסים בלבד.",
            ],
            typeWord: "EDL",
            confirmLabel: "אתחל ל-EDL",
          });
          if (!ok) return;
          log.cmd("adb reboot edl");
          await adbService.requireDevice().power.qualcommEdlMode();
        },
      },
      {
        id: "rb-poweroff",
        label: "כבה את המכשיר",
        tip: "מכבה את המכשיר לחלוטין.",
        cmd: "adb shell reboot -p",
        mode: "adb",
        run: async () => {
          const ok = await confirmModal({
            title: "כיבוי המכשיר",
            message: "לכבות את המכשיר? תצטרך להדליק אותו ידנית אחר כך.",
            confirmLabel: "כבה",
            tone: "warn",
          });
          if (!ok) return;
          log.cmd("adb shell reboot -p");
          await adbService.requireDevice().power.powerOff();
          log.ok("פקודת כיבוי נשלחה.");
        },
      },
    ],
  },

  /* ---------- Fastboot מתקדם ---------- */
  {
    id: "fastbootAdv",
    name: "Fastboot מתקדם",
    icon: "flame",
    commands: [
      {
        id: "fb-getvar-all",
        label: "כל משתני הבוטלואדר",
        tip: "מציג את כל המידע שהבוטלואדר חושף על המכשיר.",
        cmd: "fastboot getvar all",
        mode: "fastboot",
        variant: "primary",
        run: async () => {
          const dev = await fastbootService.requireDevice();
          log.cmd("fastboot getvar all");
          const keys = [
            "product",
            "variant",
            "version",
            "version-bootloader",
            "version-baseband",
            "serialno",
            "secure",
            "unlocked",
            "off-mode-charge",
            "current-slot",
            "slot-count",
            "max-download-size",
            "battery-voltage",
            "partition-type:boot",
            "is-userspace",
          ];
          for (const key of keys) {
            try {
              const value = await dev.getVariable(key);
              if (value !== null && value !== undefined) log.out(`${key}: ${value}`);
            } catch {
              /* משתנה שלא קיים — מדלגים בשקט */
            }
          }
          log.ok("סיום קריאת המשתנים.");
        },
      },
      {
        id: "fb-product",
        label: "שם המוצר",
        tip: "מציג את שם המוצר כפי שהבוטלואדר מדווח.",
        cmd: "fastboot getvar product",
        mode: "fastboot",
        run: () => fastbootService.getVariable("product"),
      },
      {
        id: "fb-serial",
        label: "מספר סידורי",
        tip: "מציג את המספר הסידורי מהבוטלואדר.",
        cmd: "fastboot getvar serialno",
        mode: "fastboot",
        run: () => fastbootService.getVariable("serialno"),
      },
      {
        id: "fb-slot",
        label: "סלוט פעיל (A/B)",
        tip: "במכשירי A/B — מציג איזה סלוט פעיל כרגע.",
        cmd: "fastboot getvar current-slot",
        mode: "fastboot",
        run: () => fastbootService.getVariable("current-slot"),
      },
      {
        id: "fb-set-slot-a",
        label: "הפעל סלוט A",
        tip: "מגדיר את סלוט A כסלוט האתחול הפעיל.",
        cmd: "fastboot set_active a",
        mode: "fastboot",
        run: fb("set_active:a"),
      },
      {
        id: "fb-set-slot-b",
        label: "הפעל סלוט B",
        tip: "מגדיר את סלוט B כסלוט האתחול הפעיל.",
        cmd: "fastboot set_active b",
        mode: "fastboot",
        run: fb("set_active:b"),
      },
      {
        id: "fb-maxdownload",
        label: "גודל העברה מרבי",
        tip: "מציג את גודל החבילה המרבי שהבוטלואדר מקבל בבת אחת.",
        cmd: "fastboot getvar max-download-size",
        mode: "fastboot",
        run: () => fastbootService.getVariable("max-download-size"),
      },
      {
        id: "fb-battery",
        label: "מתח סוללה",
        tip: "מציג את מתח הסוללה מהבוטלואדר.",
        cmd: "fastboot getvar battery-voltage",
        mode: "fastboot",
        run: () => fastbootService.getVariable("battery-voltage"),
      },
      {
        id: "fb-flash-any",
        label: "צרוב לפרטישן כלשהו",
        tip: "בוחר פרטישן וקובץ, וצורב אותו. למשתמשים מנוסים.",
        cmd: "fastboot flash <partition> <file>",
        mode: "fastboot",
        danger: true,
        variant: "danger",
        run: async () => {
          const partition = await promptModal({
            title: "צריבה לפרטישן",
            label: "שם הפרטישן",
            placeholder: "recovery",
            hint: "לדוגמה: boot, recovery, dtbo, vendor_boot, system",
          });
          if (!partition) return;
          await flashPartition(partition, { accept: ".img,.bin" });
        },
      },
      {
        id: "fb-boot-img",
        label: "אתחול זמני מקובץ",
        tip: "מאתחל מקובץ boot.img בלי לצרוב אותו — דרך בטוחה לבדוק רוט.",
        cmd: "fastboot boot <file>",
        mode: "fastboot",
        run: async () => {
          const file = await pickFiles({ accept: ".img" });
          if (!file) return log.warn("לא נבחר קובץ.");
          const dev = await fastbootService.requireDevice();
          log.cmd(`fastboot boot ${file.name}`);
          log.info("מעלה ומאתחל מהקובץ (לא נצרב לזיכרון הקבוע)…");
          await dev.bootBlob(file);
          log.ok("המכשיר מאתחל מהקובץ הזמני.");
        },
      },
      {
        id: "fb-erase",
        label: "מחק פרטישן",
        tip: "מוחק את תוכן הפרטישן. מסוכן מאוד — עלול להשבית את המכשיר.",
        cmd: "fastboot erase <partition>",
        mode: "fastboot",
        danger: true,
        variant: "danger",
        run: async () => {
          const partition = await promptModal({
            title: "מחיקת פרטישן",
            label: "שם הפרטישן",
            placeholder: "userdata",
          });
          if (!partition) return;
          const ok = await riskModal({
            title: `מחיקת פרטישן '${partition}'`,
            what: `כל התוכן של הפרטישן '${partition}' יימחק.`,
            risks: [
              "מחיקת פרטישן קריטי (boot, system) תשבית את המכשיר לחלוטין.",
              "המחיקה בלתי הפיכה.",
              "ודא שיש לך קובץ תקין לצריבה חזרה לפני שאתה מוחק.",
            ],
            typeWord: partition,
            confirmLabel: "מחק פרטישן",
          });
          if (ok) await fastbootService.runCommand(`erase:${partition}`);
        },
      },
      {
        id: "fb-format-userdata",
        label: "פורמט userdata (איפוס)",
        tip: "מוחק את כל נתוני המשתמש — איפוס להגדרות יצרן.",
        cmd: "fastboot -w",
        mode: "fastboot",
        danger: true,
        variant: "danger",
        run: async () => {
          const ok = await riskModal({
            title: "איפוס נתוני משתמש",
            what: "כל הנתונים האישיים במכשיר יימחקו — תמונות, אפליקציות, חשבונות והגדרות.",
            risks: [
              "כל התוכן האישי במכשיר יימחק לצמיתות.",
              "לא ניתן לשחזר בלי גיבוי מוקדם.",
              "המכשיר יחזור למצב של מכשיר חדש.",
            ],
            typeWord: "אפס",
            confirmLabel: "אפס את המכשיר",
          });
          if (!ok) return;
          await fastbootService.runCommand("erase:userdata");
          await fastbootService.runCommand("erase:cache").catch(() => {
            log.info("אין פרטישן cache במכשיר הזה — מדלגים.");
          });
        },
      },
      {
        id: "fb-oem-cmd",
        label: "פקודת OEM חופשית",
        tip: "שולח פקודת oem גולמית לבוטלואדר. תלוי ביצרן.",
        cmd: "fastboot oem <command>",
        mode: "fastboot",
        danger: true,
        run: async () => {
          const cmd = await promptModal({
            title: "פקודת OEM",
            label: "הפקודה (בלי המילה oem)",
            placeholder: "device-info",
            hint: "פקודות OEM משתנות בין יצרנים ועלולות להיות מסוכנות.",
          });
          if (cmd) await fastbootService.runCommand(`oem ${cmd}`);
        },
      },
    ],
  },
];

/* ==========================================================================
   ייצוא עזר
   ========================================================================== */

/** כל הפקודות ברשימה שטוחה, עם שיוך לקטגוריה. */
export const ALL_COMMANDS = CATEGORIES.flatMap((cat) =>
  cat.commands.map((c) => ({ ...c, categoryId: cat.id, categoryName: cat.name })),
);

/** מוצא פקודה לפי מזהה. */
export function findCommand(id) {
  return ALL_COMMANDS.find((c) => c.id === id) ?? null;
}

/** מוצא קטגוריה לפי מזהה. */
export function findCategory(id) {
  return CATEGORIES.find((c) => c.id === id) ?? null;
}

/**
 * מסנן פקודות לפי טקסט חופשי — בעברית או באנגלית.
 * @param {string} query
 */
export function searchCommands(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return ALL_COMMANDS.filter((c) => {
    const haystack = `${c.label} ${c.tip} ${c.cmd} ${c.categoryName}`.toLowerCase();
    return haystack.includes(q);
  });
}

// מיוצא כדי שכרטיסיית "צריבה ורוט" תשתמש באותה לוגיקה בדיוק
export { flashPartition, uninstallPackage, toggleLogcat, startLogcat, stopLogcat };
