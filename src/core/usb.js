/**
 * עזרי WebUSB — זיהוי מכשירים והבחנה בין מצב ADB למצב Fastboot.
 *
 * גוגל מגדירה את ממשקי ה-USB כך:
 *   ADB      → class 0xFF, subclass 0x42, protocol 0x01
 *   Fastboot → class 0xFF, subclass 0x42, protocol 0x03
 * ההבחנה הזו מאפשרת לממש `adb devices` ו-`fastboot devices` בלי להציג
 * למשתמש חלון בחירה בכל פעם — אנחנו סורקים רק מכשירים שכבר אושרו.
 */

export const ADB_INTERFACE = { classCode: 0xff, subclassCode: 0x42, protocolCode: 0x01 };
export const FASTBOOT_INTERFACE = { classCode: 0xff, subclassCode: 0x42, protocolCode: 0x03 };

/** האם הדפדפן תומך ב-WebUSB. */
export function isWebUsbSupported() {
  return typeof navigator !== "undefined" && "usb" in navigator;
}

/** האם הדפדפן מבוסס Chromium (הדפדפנים היחידים עם WebUSB). */
export function isChromiumBased() {
  const ua = navigator.userAgent;
  const brands = navigator.userAgentData?.brands?.map((b) => b.brand).join(" ") ?? "";
  if (/Chromium|Google Chrome|Microsoft Edge|Opera/i.test(brands)) return true;
  return /Chrome\/|Edg\/|OPR\//.test(ua) && !/Firefox\//.test(ua);
}

/** שם דפדפן קריא, לצורך הודעת השגיאה. */
export function browserName() {
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "הדפדפן הנוכחי";
}

/**
 * בודק אם ל-USBDevice יש ממשק התואם למפרט נתון.
 * @param {USBDevice} device
 * @param {{classCode:number, subclassCode:number, protocolCode:number}} spec
 */
export function hasInterface(device, spec) {
  for (const config of device.configurations ?? []) {
    for (const iface of config.interfaces ?? []) {
      for (const alt of iface.alternates ?? []) {
        if (
          alt.interfaceClass === spec.classCode &&
          alt.interfaceSubclass === spec.subclassCode &&
          alt.interfaceProtocol === spec.protocolCode
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * מחזיר את כל המכשירים שכבר אושרו על ידי המשתמש ותואמים למפרט.
 * @param {{classCode:number, subclassCode:number, protocolCode:number}} spec
 * @returns {Promise<USBDevice[]>}
 */
export async function getPairedDevices(spec) {
  if (!isWebUsbSupported()) return [];
  const devices = await navigator.usb.getDevices();
  return devices.filter((d) => hasInterface(d, spec));
}

/** תיאור קריא של מכשיר USB. */
export function describeDevice(device) {
  const name =
    [device.manufacturerName, device.productName].filter(Boolean).join(" ") ||
    `USB ${hex(device.vendorId)}:${hex(device.productId)}`;
  const serial = device.serialNumber || "ללא מספר סידורי";
  return `${name} (${serial})`;
}

export function hex(n) {
  return `0x${Number(n).toString(16).padStart(4, "0")}`;
}
