# מכשירוט — כלי ADB/Fastboot בדפדפן

<div dir="rtl">

**מכשירוט** הוא אתר סטטי שמאפשר לשלוט במכשירי אנדרואיד דרך **ADB** ו-**Fastboot** ישירות מהדפדפן — בלי להתקין ADB במחשב, ובלי שום חלון CMD שחור.

כל פקודה, כל פלט וכל שגיאה מוצגים **אך ורק** בפאנל הלוג שבתוך האתר.

נבנה על ידי **שלמה רביב** — מפתח תוכנות ואפליקציות.

</div>

---

## איך זה עובד?

<div dir="rtl">

האתר משתמש ב-[WebUSB API](https://developer.mozilla.org/en-US/docs/Web/API/WebUSB_API) של הדפדפן כדי לתקשר ישירות עם המכשיר דרך כבל ה-USB. פרוטוקול ADB ופרוטוקול Fastboot ממומשים במלואם ב-JavaScript שרץ בדפדפן:

| שכבה | ספרייה |
|---|---|
| ADB (shell, sync, push/pull, install, reboot) | [`@yume-chan/adb`](https://github.com/yume-chan/ya-webadb) |
| אימות RSA מול המכשיר | [`@yume-chan/adb-credential-web`](https://github.com/yume-chan/ya-webadb) |
| תעבורת USB ל-ADB | [`@yume-chan/adb-daemon-webusb`](https://github.com/yume-chan/ya-webadb) |
| Fastboot (flash, getvar, oem, boot) | [`android-fastboot`](https://github.com/kdrag0n/fastboot.js) — אותה ספרייה שמריצה את flash.android.com |

> **הערה:** החבילה `@yume-chan/fastboot` לא קיימת ב-npm. הצד של Fastboot ממומש עם `android-fastboot` (kdrag0n/fastboot.js), שהיא הספרייה המקבילה והנפוצה.

הבנייה נעשית עם **Vite**, והתוצר הוא אתר סטטי טהור (`dist/`) שניתן לארח ב-GitHub Pages או בכל אחסון סטטי.

</div>

## דרישות

<div dir="rtl">

- דפדפן מבוסס **Chromium**: Chrome, Edge או Opera. **Safari ו-Firefox לא תומכים ב-WebUSB.**
- כבל USB שתומך בהעברת נתונים (לא כבל טעינה בלבד).
- "ניפוי באגים ב-USB" מופעל במכשיר.
- ב-Windows: ממשק ה-USB של המכשיר צריך להיות רשום כ-**WinUSB** (ראה "התקן דרייברים" באתר, או השתמש ב-[Zadig](https://zadig.akeo.ie/)).
- **חשוב:** אם ADB מותקן ורץ במחשב, הוא תופס את המכשיר וחוסם את הדפדפן. סגור אותו (`adb kill-server`).

</div>

## הרצה מקומית

```bash
npm install
npm run dev      # שרת פיתוח על http://localhost:5173
npm run build    # בונה ל-dist/
npm run preview  # תצוגה מקדימה של הבנייה
```

## מבנה הפרויקט

```
src/
├── main.js                  נקודת הכניסה — מרכיב את הדף
├── core/
│   ├── logger.js            הלוג המרכזי — כל פקודה עוברת דרכו
│   ├── usb.js               עזרי WebUSB, הבחנה בין ADB ל-Fastboot
│   ├── adb-service.js       חיבור ואימות ADB, הרצת shell
│   ├── adb-ops.js           התקנה, צילום מסך, push/pull, גיבוי
│   ├── fastboot-service.js  חיבור Fastboot, flash, getvar, reboot
│   └── dom.js               עזרי DOM
├── data/
│   └── commands.js          קטלוג הפקודות המלא (138 פקודות, 12 קטגוריות)
├── ui/
│   ├── header.js            לוגו וערכות נושא
│   ├── toolbar.js           חיפוש וטאבים
│   ├── cards.js             4 הכרטיסיות הראשיות
│   ├── categories.js        "עוד קטגוריות"
│   ├── command-button.js    כפתור פקודה גנרי
│   ├── log-panel.js         פאנל הלוג + שורת פקודה ידנית
│   ├── file-manager.js      מנהל קבצים
│   ├── connection-actions.js  adb devices / fastboot devices
│   ├── guides.js            מדריכים ודרייברים
│   ├── modal.js             מודאלים ואזהרות סיכון
│   ├── toast.js             הודעות מצב
│   ├── icons.js             אייקוני SVG
│   └── footer.js            קרדיט
└── styles/                  CSS מופרד לפי קומפוננטה
```

## תכולה

<div dir="rtl">

**4 כרטיסיות ראשיות:**

1. **חיבור** — התקן/בדוק דרייברים, בדיקת ADB, Recovery, Fastboot, בדיקת Fastboot
2. **בוטלואדר** — בדיקת סטטוס נעילה, פתיחה, נעילה (עם אזהרות סיכון)
3. **צריבה ורוט** — boot.img, vbmeta.img, init_boot, dtbo + תפריט אתחול
4. **ניהול** — מנהל קבצים, מחיקת אפליקציה לפי שם חבילה, התקנה מרובה

**12 קטגוריות נוספות** (138 פקודות סה"כ) תחת "עוד קטגוריות": אנדרואיד ומידע מכשיר, מעבד וחומרה, אפליקציות, קבצים ואחסון, מסך וקלט, לוגים, סוללה, רשת, אבטחה, גיבוי ושחזור, אתחול ומצבי שחזור, Fastboot מתקדם.

**בנוסף:** חיפוש חופשי בעברית ובאנגלית על כל הפקודות, שורת פקודה ידנית עם היסטוריה (חצים כמו טרמינל), logcat בזמן אמת, 3 ערכות נושא (כהה/בהיר/ניאון), ותמיכת RTL מלאה.

</div>

## אזהרות

<div dir="rtl">

- **פתיחת בוטלואדר מוחקת את כל הנתונים במכשיר.** גבה הכל לפני.
- **צריבת קובץ לא תואם עלולה להשבית את המכשיר לצמיתות (brick).**
- פתיחת בוטלואדר עלולה לבטל אחריות ולהשבית שירותי תשלום ובנקאות.
- אל תנתק את הכבל באמצע צריבה.
- כל פעולה מתבצעת באחריות המשתמש בלבד.

כל פעולה הרסנית באתר דורשת אישור מפורש — כולל הקלדת מילת אישור.

</div>

## פרטיות

<div dir="rtl">

האתר סטטי לחלוטין. אין שרת, אין מסד נתונים, ואין איסוף נתונים. הכל רץ מקומית בדפדפן. מפתח ה-RSA שנוצר לאימות מול המכשיר נשמר רק ב-IndexedDB של הדפדפן שלך.

</div>

## קרדיט

<div dir="rtl">

נבנה על ידי **שלמה רביב** — מפתח תוכנות ואפליקציות | מבצע צריבות גרסאות למכשירים ונגנים בתשלום ועוד.

- מייל: [0556798858b@gmail.com](mailto:0556798858b@gmail.com)
- אתר: [shlomoraviv.github.io/Raviv-Digital](https://shlomoraviv.github.io/Raviv-Digital/)

</div>
