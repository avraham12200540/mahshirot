/**
 * כפתור פקודה גנרי — בונה כפתור מתוך הגדרת פקודה בקטלוג.
 * כולל טולטיפ, מצב טעינה, ותפיסת שגיאות אל הלוג.
 */

import { el, svg } from "../core/dom.js";
import { icon } from "./icons.js";
import { log, describeError } from "../core/logger.js";
import { toastErr } from "./toast.js";

/**
 * @param {import("../data/commands.js").Command} command
 */
export function runCommandButton(command) {
  const button = el(
    "button.btn.btn--block",
    {
      class: command.variant ? `btn--${command.variant}` : "",
      "data-tip": `${command.tip}\n${command.cmd}`,
      "data-cmd-id": command.id,
    },
    [
      command.mode === "fastboot" ? svg(icon("flame", 13)) : null,
      document.createTextNode(command.label),
    ].filter(Boolean),
  );

  button.addEventListener("animationend", (e) => {
    if (e.animationName === "btn-flash-ok") button.classList.remove("btn--flash-ok");
  });
  button.addEventListener("click", async () => {
    if (button.classList.contains("btn--busy")) return;
    button.classList.add("btn--busy");
    try {
      await command.run();
      // משוב חזותי מיידי על הכפתור עצמו — כדי שלא יהיה צריך להסתכל בלוג כדי לדעת שהפקודה רצה
      button.classList.add("btn--flash-ok");
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
