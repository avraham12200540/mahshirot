/**
 * שירות ADB — חיבור אמיתי למכשיר דרך WebUSB, ללא ADB מותקן במחשב.
 *
 * מבוסס על @yume-chan/adb: מימוש מלא של פרוטוקול ADB ב-JavaScript,
 * כולל אימות RSA (המפתח נשמר ב-IndexedDB של הדפדפן), shell, sync ו-install.
 */

import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";
import { AdbDaemonWebUsbDeviceManager } from "@yume-chan/adb-daemon-webusb";
import { log, describeError } from "./logger.js";
import { ADB_INTERFACE, getPairedDevices, describeDevice, isWebUsbSupported } from "./usb.js";

const CREDENTIAL_APP_NAME = "מכשירוט (Mahshirot)";

class AdbService {
  /** @type {Adb | null} */
  adb = null;
  /** @type {AdbWebCredentialStore | null} */
  #credentialStore = null;
  /** @type {Set<Function>} */
  #listeners = new Set();
  /** @type {string} */
  serial = "";
  /** @type {string} */
  product = "";

  get connected() {
    return this.adb !== null;
  }

  get manager() {
    return AdbDaemonWebUsbDeviceManager.BROWSER;
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

  #credentials() {
    if (!this.#credentialStore) {
      this.#credentialStore = new AdbWebCredentialStore(CREDENTIAL_APP_NAME);
    }
    return this.#credentialStore;
  }

  /**
   * מבקש מהמשתמש לבחור מכשיר ADB ומתחבר אליו.
   * @param {{ prompt?: boolean }} [options] prompt=false ינסה להתחבר רק למכשיר שכבר אושר
   * @returns {Promise<boolean>}
   */
  async connect({ prompt = true } = {}) {
    if (!isWebUsbSupported()) {
      log.err("הדפדפן הזה לא תומך ב-WebUSB. יש להשתמש ב-Chrome, Edge או Opera.");
      return false;
    }

    if (this.connected) {
      log.info(`כבר מחובר למכשיר ${this.serial}.`);
      return true;
    }

    const manager = this.manager;
    if (!manager) {
      log.err("WebUSB לא זמין בדפדפן הזה.");
      return false;
    }

    try {
      let device;

      if (prompt) {
        log.info("פותח את חלון בחירת המכשיר של הדפדפן…");
        device = await manager.requestDevice();
        if (!device) {
          log.warn("לא נבחר מכשיר. אם המכשיר לא הופיע ברשימה — ראה 'התקן דרייברים'.");
          return false;
        }
      } else {
        const devices = await manager.getDevices();
        if (!devices.length) return false;
        device = devices[0];
      }

      log.info(`מתחבר אל ${device.name || device.serial}…`);
      const connection = await device.connect();

      log.info("ממתין לאישור ניפוי באגים במכשיר (בדוק את מסך הטלפון)…");
      const transport = await AdbDaemonTransport.authenticate({
        serial: device.serial,
        connection,
        credentialStore: this.#credentials(),
      });

      this.adb = new Adb(transport);
      this.serial = device.serial;
      this.product = transport.banner?.product ?? "";

      log.ok(`התחברות ל-ADB הצליחה — ${describeDevice(device.raw)}`);
      if (transport.banner?.model) {
        log.info(`דגם: ${transport.banner.model} | מוצר: ${transport.banner.product ?? "—"}`);
      }

      // ניתוק פיזי של הכבל מנקה את המצב אוטומטית
      transport.disconnected.then(
        () => this.#onDisconnected(),
        () => this.#onDisconnected(),
      );

      this.#emit();
      return true;
    } catch (error) {
      log.err(`חיבור ADB נכשל: ${describeError(error)}`);
      this.adb = null;
      this.#emit();
      return false;
    }
  }

  #onDisconnected() {
    if (!this.adb) return;
    this.adb = null;
    this.serial = "";
    this.product = "";
    log.warn("המכשיר נותק ממצב ADB.");
    this.#emit();
  }

  /** מנתק ידנית. */
  async disconnect() {
    if (!this.adb) return;
    try {
      await this.adb.close();
    } catch {
      /* המכשיר כבר נותק — אין מה לעשות */
    }
    this.#onDisconnected();
  }

  /** זורק שגיאה מובנת אם אין חיבור. */
  requireDevice() {
    if (!this.adb) {
      throw new Error("אין מכשיר מחובר במצב ADB. לחץ על 'בדוק דרייברים' או 'בדיקת ADB' כדי להתחבר.");
    }
    return this.adb;
  }

  /**
   * מריץ פקודת shell ומחזיר את הפלט כטקסט.
   * @param {string} command
   * @param {{ quiet?: boolean }} [options] quiet=true לא ירשום את הפקודה בלוג (למצבי רענון פנימיים)
   * @returns {Promise<string>}
   */
  async shell(command, { quiet = false } = {}) {
    const adb = this.requireDevice();
    if (!quiet) log.cmd(`adb shell ${command}`);

    // shell protocol נותן stdout/stderr/exitCode נפרדים — עדיף כשקיים.
    // מכשירים ישנים (לפני אנדרואיד 7) תומכים רק ב-none protocol.
    const shellProtocol = adb.subprocess.shellProtocol;
    if (shellProtocol) {
      const result = await shellProtocol.spawnWaitText(command);
      if (!quiet) {
        if (result.stdout.trim()) log.output(result.stdout);
        if (result.stderr.trim()) log.warn(result.stderr.trim());
        if (result.exitCode !== 0) log.warn(`הפקודה הסתיימה עם קוד יציאה ${result.exitCode}`);
        if (!result.stdout.trim() && !result.stderr.trim() && result.exitCode === 0) {
          log.ok("הפקודה בוצעה (ללא פלט).");
        }
      }
      return result.stdout;
    }

    const text = await adb.subprocess.noneProtocol.spawnWaitText(command);
    if (!quiet) {
      if (text.trim()) log.output(text);
      else log.ok("הפקודה בוצעה (ללא פלט).");
    }
    return text;
  }

  /** מריץ shell ומחזיר טקסט מקוצץ, בלי לרשום בלוג. */
  async shellQuiet(command) {
    const text = await this.shell(command, { quiet: true });
    return text.trim();
  }

  /** קורא ערך getprop בודד. */
  async getProp(name) {
    return this.shellQuiet(`getprop ${name}`);
  }

  /** פותח sync (לניהול קבצים). */
  async sync() {
    const adb = this.requireDevice();
    return adb.sync();
  }
}

export const adbService = new AdbService();
