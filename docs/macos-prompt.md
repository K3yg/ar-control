# Prompt: native macOS app

Paste everything below the line into Claude Code on your Mac (with Xcode installed), in an empty folder.

---

Build a native macOS menu bar app in SwiftUI called **Air** that remotely controls my Samsung WindFree
air conditioner through an existing HTTP API. No third-party dependencies. Target macOS 14+.

## The API

Base URL and key are set by the user in Settings (store the key in the **Keychain**, the URL in
UserDefaults). Every request sends the header `x-ac-key: <key>`. JSON in and out.

- `GET /api/ac` → status:
  ```json
  { "needsReauth": false, "power": "on", "mode": "cool", "modes": ["auto","cool","dry","wind"],
    "targetTemp": 24, "minTemp": 16, "maxTemp": 30, "currentTemp": 28, "humidity": 60,
    "fanMode": "auto", "fanModes": ["auto","low","medium","high","turbo"], "availableFanModes": ["auto"],
    "swing": "fixed", "swingModes": ["fixed","vertical","horizontal","all"],
    "optionalMode": "windFree", "windFree": true, "display": true, "watts": 364, "energyKwh": 982.2, "online": true }
  ```
  If `needsReauth` is true, show "SmartThings token expired" with a link to open the web app.
- `POST /api/ac` with any subset of `{ "power": "on"|"off", "temp": 16-30, "mode": "...", "fan": "...",
  "swing": "...", "windFree": true|false, "display": true|false }` → applies it in one command.
- `GET /api/presets` → `{ "presets": [{ "id": "sleep", "name": "Sleep", "state": { ... } }] }`
- `POST /api/ac/preset/<id>` → applies a preset.
- `GET /api/schedules` → `{ "timezone": "...", "schedules": [{ "id", "time": "04:00", "days": [0-6], "once": bool, "action": { "preset": "sleep" } | { "state": { "power": "off" } } }] }`
- `POST /api/schedules` with `{ "time": "HH:MM", "days": [], "once": false, "action": ... }`, `DELETE /api/schedules/<id>`.
- Errors: non-2xx with `{ "error": "...", "message": "..." }`; 401 `unauthorized` means a wrong key.

Fields: `mode` "wind" is shown as "Fan". Fan "medium" shows as "Med". Swing labels: fixed "Still",
vertical "Up–down", horizontal "Sideways", all "All". While `windFree` is true the fan only accepts
"auto"; picking another speed should send `{ "fan": "<speed>" }` (the server turns WindFree off).

## The app

- `MenuBarExtra` with `.window` style. The menu bar icon is an SF Symbol (`air.conditioner.horizontal`,
  filled when the AC is on), with the target temperature next to it ("24°").
- The popover is about 320pt wide and calm and minimal:
  - A soft pastel gradient that follows the time of day: dawn (lilac → blush → apricot), day (powder
    blue → lilac → blush → apricot), sunset (periwinkle → rose → peach), night (deep indigo → violet →
    mauve, with light text).
  - A small drawing of the AC with animated air streams below it (TimelineView + Canvas): streams speed
    up with the fan speed, sway with the swing mode, and become slow drifting dots when WindFree is on.
    No animation when the AC is off. Respect Reduce Motion.
  - Big target temperature with − / + (debounce 600 ms before sending), room temperature below it.
  - A Turn on / Turn off button.
  - Mode, Fan and Airflow as compact segmented pickers; WindFree and Display as toggles.
  - Presets as buttons. Schedules as a short list with delete, plus an "Add" sheet (time, action,
    once/repeat, weekdays).
  - Humidity and power use hidden behind a "Details" disclosure.
- Optimistic UI: update immediately, revert and show a short inline error if the request fails.
  After a command, wait 6 s before trusting the next poll (the cloud is slow to reflect changes).
- Poll status every 30 s while the popover is open, and every 5 min in the background for the menu bar label.
- Settings window: base URL, access key, launch at login (`SMAppService`).
- **App Intents** so Siri, Spotlight and Shortcuts on the Mac work: Turn on, Turn off, Set temperature
  (Int), Set mode, Set fan speed, Set airflow, Toggle WindFree, Display on/off, Run preset (dynamic
  options from `/api/presets`), and "AC status" returning a spoken dialog. Add `AppShortcutsProvider`
  phrases like "Turn on the AC with Air".

## Quality

- Swift 6, strict concurrency, an `@Observable` store, `async/await` with `URLSession`.
- Keep the API layer in one file, views small. No force unwraps.
- Make it build and run with `xcodebuild` from the command line, and tell me how to install it into
  /Applications. It's for personal use, so no notarization: sign to run locally.
