/**
 * שירות Fastboot — חיבור אמיתי לבוטלואדר דרך WebUSB.
 *
 * מבוסס על android-fastboot (kdrag0n/fastboot.js) — אותה ספרייה שמריצה את
 * flash.android.com. (`@yume-chan/fastboot` לא קיים ב-npm.)
 *
 * הערה חשובה: ה-`connect()` המובנה של הספרייה בוחר את המכשיר הראשון
 * מבין המכשירים שאושרו, וזה עלול לתפוס בטעות את מכשיר ה-ADB. לכן אנחנו
 * בוחרים את המכשיר בעצמנו לפי מסנן פרוטוקול Fastboot (0xFF/0x42/0x03)
 * ורק אז מוסרים אותו לספרייה.
 */

import * as fastboot from "android-fastboot";
import { log, describeError } from "./logger.js";
import {
  FASTBOOT_INTERFACE,
  getPairedDevices,
  describeDevice,
  isWebUsbSupported,
} from "./usb.js";

// מכוון את הלוגים הפנימיים של הספרייה לפאנל הלוג שלנו — לעולם לא לקונסול בלבד.
fastboot.setDebugLevel(0);

class FastbootService {
  /** @type {fastboot.FastbootDevice | null} */
  device = null;
  /** @type {Set<Function>} */
  #listeners = new Set();

  get connected() {
    return this.device !== null && this.device.isConnected;
  }

  subscribe(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  #emit() {
    for (const fn of this.#listeners) {
      try {
        fn(this);
      } catch (err) {
        console.error(err);
      }
    }
  }

  /**
   * מתחבר למכשיר במצב Fastboot.
   * @param {{ prompt?: boolean }} [options]
   * @returns {Promise<boolean>}
   */
  async connect({ prompt = true } = {}) {
    if (!isWebUsbSupported()) {
      log.err("הדפדפן הזה לא תומך ב-WebUSB. יש להשתמש ב-Chrome, Edge או Opera.");
      return false;
    }

    if (this.connected) return true;

    try {
      let usbDevice = null;

      // קודם מנסים מכשיר שכבר אושר — בלי להטריד את המשתמש בחלון בחירה
      const paired = await getPairedDevices(FASTBOOT_INTERFACE);
      if (paired.length === 1) {
        usbDevice = paired[0];
      } else if (prompt) {
        log.info("פותח את חלון בחירת המכשיר (מצב Fastboot)…");
        usbDevice = await navigator.usb.requestDevice({
          filters: [FASTBOOT_INTERFACE],
        });
      } else if (paired.length > 1) {
        usbDevice = paired[0];
      }

      if (!usbDevice) {
        if (prompt) log.warn("לא נבחר מכשיר Fastboot.");
        return false;
      }

      const dev = new fastboot.FastbootDevice();
      dev.device = usbDevice;
      await dev._validateAndConnectDevice();

      this.device = dev;
      log.ok(`התחברות ל-Fastboot הצליחה — ${describeDevice(usbDevice)}`);
      this.#emit();
      return true;
    } catch (error) {
      log.err(`חיבור Fastboot נכשל: ${describeError(error)}`);
      this.device = null;
      this.#emit();
      return false;
    }
  }

  /** מוודא חיבור, ומנסה להתחבר בשקט אם צריך. */
  async requireDevice() {
    if (this.connected) return this.device;
    const ok = await this.connect({ prompt: true });
    if (!ok || !this.device) {
      throw new Error(
        "אין מכשיר במצב Fastboot. אתחל את המכשיר לבוטלואדר (כפתור 'Fastboot' בכרטיסיית חיבור) ונסה שוב.",
      );
    }
    return this.device;
  }

  /**
   * מריץ פקודת fastboot גולמית ומחזיר את התשובה.
   * @param {string} command למשל "getvar:product" או "oem unlock"
   */
  async runCommand(command) {
    const dev = await this.requireDevice();
    log.cmd(`fastboot ${command}`);
    const response = await dev.runCommand(command);
    const text = (response?.text ?? "").trim();
    if (text) log.output(text);
    else log.ok("הפקודה בוצעה.");
    return text;
  }

  /**
   * קורא משתנה בוטלואדר.
   * @param {string} name
   * @param {{ quiet?: boolean }} [options]
   */
  async getVariable(name, { quiet = false } = {}) {
    const dev = await this.requireDevice();
    if (!quiet) log.cmd(`fastboot getvar ${name}`);
    const value = await dev.getVariable(name);
    if (!quiet) {
      if (value === null || value === undefined) log.warn(`המשתנה '${name}' לא קיים במכשיר הזה.`);
      else log.output(`${name}: ${value}`);
    }
    return value;
  }

  /**
   * צורב קובץ לפרטישן.
   * @param {string} partition
   * @param {Blob} blob
   */
  async flash(partition, blob) {
    const dev = await this.requireDevice();
    log.cmd(`fastboot flash ${partition} <${blob.name ?? "file"}>`);
    log.info(`מתחיל צריבה לפרטישן '${partition}' (${blob.size} בייטים)…`);

    let lastPct = -1;
    await dev.flashBlob(partition, blob, (progress) => {
      const pct = Math.floor(progress * 100);
      // רושמים כל 10% בלבד — אחרת הלוג מוצף
      if (pct >= lastPct + 10 && pct < 100) {
        lastPct = pct;
        log.info(`צריבת '${partition}': ${pct}%`);
      }
    });

    log.ok(`הצריבה לפרטישן '${partition}' הושלמה.`);
  }

  /**
   * מאתחל את המכשיר מ-Fastboot.
   * @param {""|"bootloader"|"recovery"|"fastboot"} target
   */
  async reboot(target = "") {
    const dev = await this.requireDevice();
    log.cmd(`fastboot reboot${target ? " " + target : ""}`);
    await dev.reboot(target, false);
    log.ok("פקודת האתחול נשלחה.");
    // אחרי reboot החיבור מת ממילא
    this.device = null;
    this.#emit();
  }

  /** מנתק. */
  disconnect() {
    this.device = null;
    this.#emit();
  }
}

export const fastbootService = new FastbootService();
