# Siri

Siri talks to the app through the **Shortcuts** app. Each shortcut calls one URL, and the name of
the shortcut is the phrase you say. Every command answers with a short sentence that Siri reads out
("Done, AC on."), so you hear that it worked.

## Make one shortcut

1. Open **Shortcuts** → **+**.
2. Add the action **Get Contents of URL**.
3. URL: `https://<your-app>.vercel.app/api/siri/on`
4. Tap the arrow next to the URL → **Headers** → add `x-ac-key` with your `AC_API_KEY`.
5. Add the action **Speak Text** (or **Show Result**) and pick *Contents of URL*.
6. Name the shortcut with the phrase, e.g. **Turn on the AC**. Done: "Hey Siri, turn on the AC".

Build the first one, then **duplicate** it for the others and change only the URL and the name.

Add `?lang=pt` to any URL for answers in Portuguese, e.g. `/api/siri/status?lang=pt`.

## Commands

| Say (shortcut name) | URL path |
|---|---|
| How's the AC | `/api/siri/status` |
| Turn on the AC | `/api/siri/on` |
| Turn off the AC | `/api/siri/off` |
| AC to 23 | `/api/siri/temp/23` |
| AC cool / dry / fan / auto | `/api/siri/mode/cool` · `dry` · `fan` · `auto` |
| Fan low / medium / high / turbo / auto | `/api/siri/fan/high` |
| Airflow up and down / sideways / all / still | `/api/siri/swing/vertical` · `horizontal` · `all` · `fixed` |
| WindFree on / off | `/api/siri/windfree/on` · `off` |
| Display off / on | `/api/siri/display/off` · `on` |
| Sleep mode (any preset) | `/api/siri/preset/sleep` (preset id or name) |
| What's scheduled | `/api/siri/schedules` |
| Turn off the AC at 4 | `/api/siri/schedule/off/04:00/once` |
| Every day at 7, sleep mode | `/api/siri/schedule/sleep/07:00` |

Fan speed and WindFree don't mix: WindFree keeps the fan on auto, so asking for a fan speed turns
WindFree off first (the Samsung app does the same).

## Ask for a number

For "AC to *some* temperature":

1. **Ask for Input** → Number → prompt "Which temperature?"
2. **Get Contents of URL** → `https://<your-app>.vercel.app/api/siri/temp/` followed by the
   *Provided Input* variable. Same header as above.
3. **Speak Text** → *Contents of URL*.

The same trick works for schedules: ask for a time, format it as `HH:mm` with **Format Date**, and
put it at the end of `/api/siri/schedule/off/`.

## Schedules without Siri

Schedules created in the app (or with the schedule commands) run in the cloud through QStash, at
the exact minute, even when your phone is off. You don't need iPhone automations for them.
