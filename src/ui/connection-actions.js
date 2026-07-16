/**
 * פעולות החיבור — המקבילות של `adb devices` ו-`fastboot devices` בדפדפן.
 *
 * אין שרת ADB במחשב, ולכן "רשימת מכשירים" = המכשירים שהמשתמש אישר
 * לאתר דרך WebUSB ושמחוברים כרגע פיזית.
 */

import { log, describeError } from "../core/logger.js";
import { adbService } from "../core/adb-service.js";
import { fastbootService } from "../core/fastboot-service.js";
import {
  ADB_INTERFACE,
  FASTBOOT_INTERFACE,
  getPairedDevices,
  describeDevice,
  isWebUsbSupported,
} from "../core/usb.js";

/**
 * מקביל ל-`adb devices` — מציג את המכשירים שאושרו ומחוברים במצב ADB,
 * ואת הסטטוס שלהם (device / unauthorized / offline).
 */
export async function checkAdbDevices() {
  log.cmd("adb devices");

  if (!isWebUsbSupported()) {
    log.err("הדפדפן לא תומך ב-WebUSB — אי אפשר לזהות מכשירים.");
    return;
  }

  const devices = await getPairedDevices(ADB_INTERFACE);

  if (!devices.length) {
    log.output("List of devices attached\n(אין מכשירים)");
    log.warn(
      "לא נמצא אף מכשיר שאושר לאתר. לחץ על 'בדוק דרייברים' כדי לבחור מכשיר, וודא ש'ניפוי באגים ב-USB' מופעל.",
    );
    return;
  }

  const lines = ["List of devices attached"];

  for (const device of devices) {
    const serial = device.serialNumber || "unknown";
    let status = "device";

    if (adbService.connected && adbService.serial === serial) {
      status = "device (מחובר לאתר)";
    } else {
      // המכשיר אושר אבל אין חיבור פעיל — לא ניתן לדעת אם מאושר בלי לנסות
      status = "offline (אושר ב-USB, אין חיבור ADB פעיל)";
    }

    lines.push(`${serial}\t${status}`);
    log.info(`נמצא: ${describeDevice(device)}`);
  }

  log.output(lines.join("\n"));

  if (!adbService.connected) {
    log.info("מנסה להתחבר אוטומטית למכשיר…");
    const ok = await adbService.connect({ prompt: false });
    if (!ok) {
      log.warn("החיבור האוטומטי לא הצליח. לחץ על 'בדוק דרייברים' כדי לבחור מכשיר ידנית.");
    }
  }
}

/**
 * מקביל ל-`fastboot devices` — בודק אם מכשיר מזוהה כרגע במצב Fastboot.
 */
export async function checkFastbootDevices() {
  log.cmd("fastboot devices");

  if (!isWebUsbSupported()) {
    log.err("הדפדפן לא תומך ב-WebUSB — אי אפשר לזהות מכשירים.");
    return;
  }

  const devices = await getPairedDevices(FASTBOOT_INTERFACE);

  if (!devices.length) {
    log.output("(אין מכשירים במצב Fastboot)");
    log.warn(
      "לא נמצא מכשיר במצב Fastboot. אתחל את המכשיר לבוטלואדר (כפתור 'Fastboot'), ואז לחץ כאן שוב ואשר את המכשיר בחלון הדפדפן.",
    );
    log.info(
      "ב-Windows, מכשיר ב-Fastboot לרוב דורש דרייבר WinUSB נפרד — ראה 'התקן דרייברים'.",
    );
    return;
  }

  for (const device of devices) {
    log.output(`${device.serialNumber || "unknown"}\tfastboot`);
    log.info(`נמצא: ${describeDevice(device)}`);
  }

  if (!fastbootService.connected) {
    const ok = await fastbootService.connect({ prompt: false });
    if (ok) {
      try {
        const product = await fastbootService.getVariable("product", { quiet: true });
        const unlocked = await fastbootService.getVariable("unlocked", { quiet: true });
        if (product) log.info(`מוצר: ${product}`);
        if (unlocked !== null) {
          log.info(`בוטלואדר: ${unlocked === "yes" ? "פתוח 🔓" : "נעול 🔒"}`);
        }
      } catch (error) {
        log.warn(`לא ניתן לקרוא את פרטי הבוטלואדר: ${describeError(error)}`);
      }
    }
  }
}

/**
 * "בדוק דרייברים" — יוזם בקשת חיבור WebUSB ומדווח אם המכשיר זוהה.
 */
export async function checkDrivers() {
  log.cmd("navigator.usb.requestDevice()");
  log.info("בודק אם הדפדפן מזהה את המכשיר…");

  if (!isWebUsbSupported()) {
    log.err(
      "הדפדפן הזה לא תומך ב-WebUSB. Safari ו-Firefox לא נתמכים — יש להשתמש ב-Chrome, Edge או Opera.",
    );
    return false;
  }

  const ok = await adbService.connect({ prompt: true });

  if (ok) {
    log.ok("✅ הדרייברים תקינים והמכשיר זוהה בהצלחה.");
    try {
      const model = await adbService.getProp("ro.product.model");
      const android = await adbService.getProp("ro.build.version.release");
      if (model) log.info(`דגם: ${model} | אנדרואיד: ${android || "לא ידוע"}`);
    } catch {
      /* לא קריטי — החיבור עצמו הצליח */
    }
    return true;
  }

  log.err("❌ המכשיר לא זוהה.");
  log.info("דברים לבדוק, לפי הסדר:");
  log.info("1. 'ניפוי באגים ב-USB' מופעל באפשרויות מפתחים במכשיר.");
  log.info("2. אישרת את חלון 'לאפשר ניפוי באגים ב-USB?' שקפץ במסך הטלפון.");
  log.info("3. הכבל תומך בהעברת נתונים (לא כבל טעינה בלבד).");
  log.info("4. ב-Windows: הדרייבר של המכשיר הוא WinUSB — ראה 'התקן דרייברים'.");
  log.info("5. אין ADB אחר שרץ במחשב ותופס את המכשיר (adb kill-server).");
  return false;
}
