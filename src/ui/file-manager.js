/**
 * מנהל הקבצים — עץ קבצים במכשיר, מבוסס adb sync (ls / pull / push).
 */

import { el, clear, svg, formatBytes, shq } from "../core/dom.js";
import { icon } from "./icons.js";
import { openModal, confirmModal, promptModal } from "./modal.js";
import { log, describeError } from "../core/logger.js";
import { adbService } from "../core/adb-service.js";
import * as ops from "../core/adb-ops.js";
import { pickFiles } from "../data/commands.js";
import { toastErr, toastOk } from "./toast.js";
// LinuxFileType.Directory מ-@yume-chan/adb — בודקים דרך המסכה כדי לא לייבא עוד סמל
const S_IFMT = 0o170000;
const S_IFDIR = 0o040000;
const S_IFLNK = 0o120000;

const isDir = (entry) => (entry.mode & S_IFMT) === S_IFDIR;
const isLink = (entry) => (entry.mode & S_IFMT) === S_IFLNK;

/** מנרמל נתיב: מסיר כפילויות ו-.. */
function joinPath(base, name) {
  if (name === "..") {
    const parts = base.split("/").filter(Boolean);
    parts.pop();
    return "/" + parts.join("/");
  }
  return `${base === "/" ? "" : base}/${name}`;
}

export function openFileManager() {
  if (!adbService.connected) {
    log.err("אין מכשיר מחובר במצב ADB. התחבר קודם דרך 'בדוק דרייברים'.");
    toastErr("אין מכשיר מחובר במצב ADB.");
    return;
  }

  let currentPath = "/sdcard";

  const pathInput = el("input.fm__path", {
    value: currentPath,
    spellcheck: "false",
    "aria-label": "נתיב נוכחי",
  });

  const list = el("div.fm__list");

  const body = el("div.fm", {}, [
    el("div.fm__bar", {}, [
      el("button.btn.btn--sm", {
        html: icon("chevronLeft", 13),
        "data-tip": "תיקייה למעלה",
        "aria-label": "תיקייה למעלה",
        on: { click: () => navigate(joinPath(currentPath, "..")) },
      }),
      pathInput,
      el("button.btn.btn--sm", {
        html: icon("refresh", 13),
        "data-tip": "רענן",
        "aria-label": "רענן",
        on: { click: () => navigate(currentPath) },
      }),
      el("button.btn.btn--sm.btn--green", {}, [
        svg(icon("upload", 13)),
        document.createTextNode("העלה לכאן"),
      ]),
    ]),
    list,
    el("div.fm__hint", {
      text: "לחיצה על תיקייה נכנסת אליה. לחיצה על קובץ מורידה אותו למחשב.",
    }),
  ]);

  // כפתור ההעלאה
  body.querySelector(".btn--green").addEventListener("click", async () => {
    const file = await pickFiles();
    if (!file) return;
    try {
      await ops.pushFile(file, `${currentPath}/${file.name}`);
      toastOk(`'${file.name}' הועלה.`);
      await navigate(currentPath);
    } catch (error) {
      log.err(`ההעלאה נכשלה: ${describeError(error)}`);
      toastErr("ההעלאה נכשלה — ראה את הלוג.");
    }
  });

  pathInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") navigate(pathInput.value.trim() || "/");
  });

  /* ---------- ניווט ---------- */

  async function navigate(path) {
    const target = path === "" ? "/" : path;
    clear(list);
    list.append(el("div.fm__loading", { text: "טוען…" }));

    log.cmd(`adb shell ls ${target}`);

    try {
      const entries = await ops.listDir(target);
      currentPath = target;
      pathInput.value = target;
      render(entries);
      log.ok(`נטענו ${entries.length} פריטים מ-'${target}'.`);
    } catch (error) {
      clear(list);
      list.append(
        el("div.fm__empty", { text: `לא ניתן לפתוח את '${target}' — ${describeError(error)}` }),
      );
      log.err(`פתיחת '${target}' נכשלה: ${describeError(error)}`);
    }
  }

  function render(entries) {
    clear(list);

    // מסננים . ו-.. שהמכשיר מחזיר, ומסדרים תיקיות קודם
    const items = entries
      .filter((e) => e.name !== "." && e.name !== "..")
      .sort((a, b) => {
        const dirDiff = Number(isDir(b)) - Number(isDir(a));
        if (dirDiff !== 0) return dirDiff;
        return a.name.localeCompare(b.name);
      });

    if (currentPath !== "/") {
      list.append(
        el(
          "button.fm__row.fm__row--dir",
          { on: { click: () => navigate(joinPath(currentPath, "..")) } },
          [
            svg(icon("chevronLeft", 15)),
            el("span.fm__row-name", { text: ".." }),
            el("span.fm__row-size", { text: "" }),
          ],
        ),
      );
    }

    if (!items.length) {
      list.append(el("div.fm__empty", { text: "התיקייה ריקה." }));
      return;
    }

    for (const entry of items) {
      const dir = isDir(entry);
      const link = isLink(entry);

      const row = el(
        "button.fm__row",
        {
          class: dir ? "fm__row--dir" : "",
          on: {
            click: () => (dir ? navigate(joinPath(currentPath, entry.name)) : download(entry)),
          },
        },
        [
          svg(icon(dir ? "folder" : "file", 15)),
          el("span.fm__row-name", { text: entry.name + (link ? " ↗" : "") }),
          el("span.fm__row-size", { text: dir ? "" : formatBytes(entry.size) }),
          el("span.fm__row-actions", {}, [
            !dir &&
              el("span.btn.btn--sm.btn--ghost", {
                html: icon("download", 12),
                "aria-label": "הורד",
                on: {
                  click: (e) => {
                    e.stopPropagation();
                    download(entry);
                  },
                },
              }),
            el("span.btn.btn--sm.btn--ghost", {
              html: icon("trash", 12),
              "aria-label": "מחק",
              on: {
                click: (e) => {
                  e.stopPropagation();
                  remove(entry, dir);
                },
              },
            }),
          ]),
        ],
      );

      list.append(row);
    }
  }

  async function download(entry) {
    const full = joinPath(currentPath, entry.name);
    try {
      await ops.pullToDisk(full);
    } catch (error) {
      log.err(`ההורדה נכשלה: ${describeError(error)}`);
      toastErr("ההורדה נכשלה — ראה את הלוג.");
    }
  }

  async function remove(entry, dir) {
    const full = joinPath(currentPath, entry.name);
    const ok = await confirmModal({
      title: "מחיקה",
      message: `למחוק את ${dir ? "התיקייה" : "הקובץ"} '${entry.name}'? הפעולה בלתי הפיכה.`,
      confirmLabel: "מחק",
      tone: "danger",
      iconName: "trash",
    });
    if (!ok) return;

    try {
      await adbService.shell(`rm -rf ${shq(full)}`);
      toastOk("נמחק.");
      await navigate(currentPath);
    } catch (error) {
      log.err(`המחיקה נכשלה: ${describeError(error)}`);
    }
  }

  navigate(currentPath);

  return openModal({
    title: "מנהל קבצים",
    body,
    iconName: "folder",
    wide: true,
    buttons: [{ label: "סגור", value: null, variant: "primary", primary: true }],
  });
}
