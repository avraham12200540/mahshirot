/**
 * צ'אט עם AI (Gemini, דרך Google AI Studio) — ישירות מהדפדפן, עם מפתח API אישי.
 * המפתח נשמר רק ב-localStorage של המשתמש ונשלח ישירות ל-Google — לא דרך שום שרת של האתר.
 */

import { el } from "../core/dom.js";
import { openModal } from "./modal.js";

const KEY_STORAGE = "mahshirot:gemini-key";
const MODEL = "gemini-2.0-flash";

function apiUrl(key) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;
}

function getApiKey() {
  return localStorage.getItem(KEY_STORAGE) || "";
}

function setApiKey(key) {
  if (key) localStorage.setItem(KEY_STORAGE, key);
  else localStorage.removeItem(KEY_STORAGE);
}

/** שולח היסטוריית שיחה ל-Gemini ומחזיר את התשובה כטקסט. */
async function askGemini(apiKey, history) {
  const res = await fetch(apiUrl(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: history,
      generationConfig: { temperature: 0.7 },
    }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message = data?.error?.message || `שגיאת שרת (${res.status})`;
    throw new Error(message);
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  if (!text) throw new Error("לא התקבלה תשובה מהמודל — ייתכן שהתוכן נחסם על ידי מסנני הבטיחות.");
  return text;
}

export function openAiChat() {
  const history = [];

  const keyInput = el("input.field__input", {
    type: "password",
    placeholder: "המפתח שלך מ-Google AI Studio",
    value: getApiKey(),
    autocomplete: "off",
    spellcheck: "false",
    style: { direction: "ltr", textAlign: "start" },
  });

  const keyRow = el("div.aichat__keyrow", {}, [
    el("div.field", {}, [
      el("label.field__label", { text: "מפתח API (Gemini)" }),
      keyInput,
      el("div.card__hint", {
        html: `המפתח נשמר רק בדפדפן שלך ונשלח ישירות ל-Google — לא דרך שרת של האתר. אפשר לקבל מפתח חינמי ב-<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a>.`,
      }),
    ]),
  ]);

  const messages = el("div.aichat__messages");

  const textInput = el("textarea.aichat__input", {
    placeholder: "שאל משהו על ADB, Fastboot, או המכשיר שלך…",
    rows: "2",
  });

  const sendBtn = el("button.btn.btn--primary", { text: "שלח" });
  const inputRow = el("div.aichat__inputrow", {}, [textInput, sendBtn]);

  function addMessage(role, text) {
    const node = el(`div.aichat__msg.aichat__msg--${role}`, { text });
    messages.append(node);
    messages.scrollTop = messages.scrollHeight;
    return node;
  }

  async function send() {
    const text = textInput.value.trim();
    const apiKey = keyInput.value.trim();

    if (!apiKey) {
      addMessage("error", "צריך להזין מפתח API קודם (למעלה).");
      return;
    }
    if (!text) return;

    setApiKey(apiKey);
    addMessage("user", text);
    history.push({ role: "user", parts: [{ text }] });
    textInput.value = "";
    textInput.disabled = true;
    sendBtn.disabled = true;

    const thinking = addMessage("model", "חושב…");
    thinking.classList.add("aichat__msg--thinking");

    try {
      const reply = await askGemini(apiKey, history);
      thinking.remove();
      addMessage("model", reply);
      history.push({ role: "model", parts: [{ text: reply }] });
    } catch (error) {
      thinking.remove();
      addMessage("error", error.message || "שגיאה לא ידועה.");
      history.pop();
    } finally {
      textInput.disabled = false;
      sendBtn.disabled = false;
      textInput.focus();
    }
  }

  sendBtn.addEventListener("click", send);
  textInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  const body = el("div.aichat", {}, [keyRow, messages, inputRow]);

  return openModal({
    title: "צ'אט עם AI",
    body,
    iconName: "send",
    wide: true,
    buttons: [{ label: "סגור", value: null, variant: "primary", primary: true }],
    onMount: () => {
      setTimeout(() => (getApiKey() ? textInput : keyInput).focus(), 60);
    },
  });
}
