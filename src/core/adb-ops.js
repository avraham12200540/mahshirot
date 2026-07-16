/**
 * פעולות ADB ברמה גבוהה — התקנה, צילום מסך, העלאה/הורדת קבצים, גיבוי.
 *
 * הכל נבנה מעל @yume-chan/adb, ומדווח לפאנל הלוג בזמן אמת.
 */

import { ConcatBufferStream } from "@yume-chan/stream-extra";
import { adbService } from "./adb-service.js";
import { log } from "./logger.js";
import { formatBytes } from "./dom.js";

const TMP_DIR = "/data/local/tmp";

/**
 * מריץ פקודת shell ומחזיר את הפלט הבינארי (למשל screencap).
 * @param {string} command
 * @returns {Promise<Uint8Array>}
 */
export async function shellBinary(command) {
  const adb = adbService.requireDevice();
  const shellProtocol = adb.subprocess.shellProtocol;

  if (shellProtocol) {
    // shell protocol מפריד stdout מ-stderr — קריטי לפלט בינארי
    const result = await shellProtocol.spawnWait(command);
    if (result.exitCode !== 0) {
      const err = new TextDecoder().decode(result.stderr).trim();
      throw new Error(err || `הפקודה נכשלה (קוד ${result.exitCode})`);
    }
    return result.stdout;
  }

  // מכשירים ישנים: אין הפרדה, אבל screencap עדיין עובד
  return adb.subprocess.noneProtocol.spawnWait(command);
}

/** מוריד Blob למחשב של המשתמש. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  log.ok(`הקובץ '${filename}' הורד למחשב (${formatBytes(blob.size)}).`);
}

/** שם קובץ עם חותמת זמן. */
export function stampedName(prefix, ext) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${prefix}-${stamp}.${ext}`;
}

/* ==========================================================================
   צילום מסך והקלטה
   ========================================================================== */

/** מצלם מסך ומוריד כ-PNG. */
export async function screenshot() {
  log.cmd("adb shell screencap -p");
  log.info("מצלם מסך…");
  const data = await shellBinary("screencap -p");
  if (!data.length) throw new Error("לא התקבלו נתונים מהמכשיר.");
  const blob = new Blob([data], { type: "image/png" });
  downloadBlob(blob, stampedName("screenshot", "png"));
}

/**
 * מקליט מסך למשך זמן נתון ומוריד כ-MP4.
 * @param {number} seconds
 */
export async function screenRecord(seconds = 10) {
  const remote = `${TMP_DIR}/mahshirot-record.mp4`;
  log.cmd(`adb shell screenrecord --time-limit ${seconds} ${remote}`);
  log.info(`מקליט מסך למשך ${seconds} שניות… (אל תנתק את המכשיר)`);

  await adbService.shell(`screenrecord --time-limit ${seconds} ${remote}`, { quiet: true });
  log.info("ההקלטה הסתיימה, מוריד את הקובץ…");

  const blob = await pullFile(remote);
  downloadBlob(blob, stampedName("screenrecord", "mp4"));

  await adbService.shell(`rm -f ${remote}`, { quiet: true });
}

/* ==========================================================================
   העברת קבצים
   ========================================================================== */

/**
 * מוריד קובץ מהמכשיר ומחזיר Blob.
 * @param {string} remotePath
 * @returns {Promise<Blob>}
 */
export async function pullFile(remotePath) {
  const sync = await adbService.sync();
  try {
    const data = await sync.read(remotePath).pipeThrough(new ConcatBufferStream());
    return new Blob([data]);
  } finally {
    await sync.dispose();
  }
}

/**
 * מוריד קובץ מהמכשיר ישירות למחשב.
 * @param {string} remotePath
 */
export async function pullToDisk(remotePath) {
  log.cmd(`adb pull ${remotePath}`);
  log.info(`מוריד '${remotePath}'…`);
  const blob = await pullFile(remotePath);
  const name = remotePath.split("/").filter(Boolean).pop() || "file";
  downloadBlob(blob, name);
}

/**
 * מעלה קובץ מהמחשב אל המכשיר.
 * @param {File} file
 * @param {string} remotePath נתיב מלא כולל שם הקובץ
 */
export async function pushFile(file, remotePath) {
  log.cmd(`adb push ${file.name} ${remotePath}`);
  log.info(`מעלה '${file.name}' (${formatBytes(file.size)}) אל '${remotePath}'…`);

  const sync = await adbService.sync();
  try {
    await sync.write({
      filename: remotePath,
      file: file.stream(),
      permission: 0o644,
      mtime: Math.floor(file.lastModified / 1000),
    });
    log.ok(`'${file.name}' הועלה בהצלחה.`);
  } finally {
    await sync.dispose();
  }
}

/**
 * מציג את תוכן התיקייה במכשיר.
 * @param {string} path
 */
export async function listDir(path) {
  const sync = await adbService.sync();
  try {
    return await sync.readdir(path);
  } finally {
    await sync.dispose();
  }
}

/* ==========================================================================
   התקנת אפליקציות
   ========================================================================== */

/**
 * מתקין קובץ APK אחד.
 *
 * הדרך היציבה ביותר בדפדפן: להעלות ל-/data/local/tmp ואז `pm install -r`.
 * (זה בדיוק מה ש-`adb install` עושה מאחורי הקלעים.)
 *
 * @param {File} file
 * @param {{ reinstall?: boolean, allowDowngrade?: boolean }} [options]
 */
export async function installApk(file, { reinstall = true, allowDowngrade = false } = {}) {
  // שם בטוח: בלי רווחים או תווים שיישברו ב-shell
  const safeName = `mahshirot-${Date.now()}.apk`;
  const remote = `${TMP_DIR}/${safeName}`;

  log.cmd(`adb install "${file.name}"`);
  log.info(`מעלה את '${file.name}' (${formatBytes(file.size)}) למכשיר…`);

  const sync = await adbService.sync();
  try {
    await sync.write({
      filename: remote,
      file: file.stream(),
      permission: 0o644,
      mtime: Math.floor(Date.now() / 1000),
    });
  } finally {
    await sync.dispose();
  }

  const flags = ["-r", allowDowngrade && "-d"].filter(Boolean).join(" ");
  log.info("מריץ התקנה במכשיר…");
  const output = await adbService.shell(`pm install ${flags} "${remote}"`, { quiet: true });

  // ניקוי — גם אם ההתקנה נכשלה, אין טעם להשאיר APK ב-tmp
  await adbService.shell(`rm -f "${remote}"`, { quiet: true }).catch(() => {});

  const text = output.trim();
  if (/^Success/im.test(text)) {
    log.ok(`'${file.name}' הותקן בהצלחה.`);
    return true;
  }

  log.err(`ההתקנה של '${file.name}' נכשלה: ${text || "לא התקבל פלט מהמכשיר"}`);
  return false;
}

/**
 * מתקין כמה קבצי APK בזה אחר זה.
 * @param {File[]} files
 */
export async function installMany(files) {
  log.info(`מתחיל התקנה מרובה של ${files.length} קבצים…`);
  let ok = 0;
  let failed = 0;

  for (const [i, file] of files.entries()) {
    log.info(`[${i + 1}/${files.length}] ${file.name}`);
    try {
      const success = await installApk(file);
      success ? ok++ : failed++;
    } catch (error) {
      failed++;
      log.err(`[${i + 1}/${files.length}] ${file.name} — ${error.message}`);
    }
  }

  const summary = `ההתקנה המרובה הסתיימה: ${ok} הצליחו, ${failed} נכשלו.`;
  failed === 0 ? log.ok(summary) : log.warn(summary);
  return { ok, failed };
}

/**
 * מייצא APK של חבילה מותקנת למחשב.
 * @param {string} packageName
 */
export async function extractApk(packageName) {
  log.cmd(`adb shell pm path ${packageName}`);
  const output = await adbService.shell(`pm path ${packageName}`, { quiet: true });
  const match = output.match(/package:(\S+)/);
  if (!match) {
    throw new Error(`החבילה '${packageName}' לא נמצאה במכשיר.`);
  }

  const apkPath = match[1];
  log.info(`נמצא: ${apkPath} — מוריד…`);
  const blob = await pullFile(apkPath);
  downloadBlob(blob, `${packageName}.apk`);
}

/* ==========================================================================
   גיבוי
   ========================================================================== */

/**
 * מריץ `adb backup` ומוריד קובץ .ab.
 *
 * הערה: גוגל הוציאה את adb backup משימוש באנדרואיד 12+ — ברוב המכשירים
 * החדשים הפקודה תחזיר קובץ ריק. זה מגבלה של אנדרואיד, לא של האתר.
 *
 * @param {string} args למשל "-all -apk -shared"
 */
export async function backup(args = "-all -apk") {
  const adb = adbService.requireDevice();
  log.cmd(`adb backup ${args}`);
  log.warn("אשר את הגיבוי במסך המכשיר. באנדרואיד 12 ומעלה הפקודה הוצאה משימוש ועלולה להחזיר קובץ ריק.");

  const socket = await adb.createSocket(`backup:${args.trim().replace(/\s+/g, ":")}`);
  const data = await socket.readable.pipeThrough(new ConcatBufferStream());

  if (!data.length) {
    log.err("הגיבוי חזר ריק — ככל הנראה המכשיר לא תומך ב-adb backup (אנדרואיד 12+).");
    return;
  }

  downloadBlob(new Blob([data]), stampedName("backup", "ab"));
}

/**
 * משחזר קובץ גיבוי .ab למכשיר.
 * @param {File} file
 */
export async function restore(file) {
  const adb = adbService.requireDevice();
  log.cmd(`adb restore ${file.name}`);
  log.warn("אשר את השחזור במסך המכשיר.");

  const socket = await adb.createSocket("restore:");
  await file.stream().pipeTo(socket.writable);
  log.ok("קובץ הגיבוי נשלח למכשיר.");
}
