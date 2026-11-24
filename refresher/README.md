# refresher

Creates SmartThings **personal access tokens (PATs)** automatically. PATs expire after 24 hours, and
since November 2026 SmartThings OAuth apps require a paid plan. This robot reuses a signed-in Samsung
session to create a new PAT on every run and send it to a URL of yours.

- **No password stored.** You sign in **once**, by hand, with **Sign in with Google**; only the session cookies are kept.
- **Encrypted session.** It's encrypted with AES-256-GCM using `SESSION_KEY`. The server that stores
  the blob can't read it.
- **Self-renewing.** The Samsung session only lasts about 2 hours and can't be extended. When it has
  run out, the robot signs in to Samsung again through Google (whose session lasts months), with no
  password and no captcha.
- **Backend-agnostic.** It only needs two HTTP endpoints, so it works with any app, not just this one.

Your Samsung account has to be linked to Google: sign in once with *Sign in with Google* using the
same Google account as your Samsung email. If Samsung offers to create a new account, cancel.

## Configuration

| Variable | Required | Description |
|---|---|---|
| `APP_URL` | yes* | App base URL. Defaults to `APP_URL/api/pat` and `APP_URL/api/refresher/session` |
| `APP_KEY` | yes | Sent in the `x-ac-key` header |
| `SESSION_KEY` | yes | 32 bytes, base64: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `PAT_TARGET_URL` | no | Receives `POST { "token": "..." }` |
| `SESSION_STORE_URL` | no | `GET` → `{ "blob": string \| null }`, `PUT { "blob": string }` |
| `PAT_SCOPES` | no | Default `l:devices,r:devices:*,w:devices:*,x:devices:*` |
| `PAT_NAME_PREFIX` | no | Default `refresher` |

\* or `PAT_TARGET_URL` + `SESSION_STORE_URL` to use another backend.

## Use

```bash
cd refresher
npm install && npx playwright install chromium
cp .env.example .env   # fill it in
npm run login          # once: a browser opens, click "Sign in with Google"; creates the first token
npm start              # creates a token from the saved session (works for ~2h after a sign-in)
npm run renew          # signs in again through Google, headless, and creates a token
```

`npm run login:password` is the old email + password sign-in. It works, but the robot can't renew it on its own.

## Run it every 6 hours (GitHub Actions)

`.github/workflows/refresh-pat.yml` runs every 6 hours: `npm start || npm run renew`. Add the
repository secrets `APP_URL`, `APP_KEY` and `SESSION_KEY`, for example with `gh secret set -f refresher/.env`.
You can also run it by hand: *Actions → Refresh SmartThings token → Run workflow*.

## When Google asks you to confirm

If Google ever wants to confirm it's you (a new device or location), `npm run renew` fails and
GitHub emails you about the failed run. Run `npm run login` on your computer once. Meanwhile the
app accepts a token pasted by hand.

## Exit codes

`2` configuration · `3` no saved session · `4` session expired · `5` token creation failed · `6` no token in the response

## Run it on your Windows PC (recommended)

The Samsung session only lasts about 2 hours, so a cloud robot can't keep it alive. Instead, a
scheduled task on your own PC signs in for you, from your own connection:

1. Add `SAMSUNG_EMAIL` and `SAMSUNG_PASSWORD` to `refresher/.env` (it never leaves your PC).
2. Register the task (PowerShell, from `refresher/`):

   ```powershell
   $dir = (Get-Location).Path
   $action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$dir\auto-hidden.vbs`"" -WorkingDirectory $dir
   $triggers = @((New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME),
     (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1)))
   $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -MultipleInstances IgnoreNew
   Register-ScheduledTask -TaskName "AC token refresher" -Action $action -Trigger $triggers -Settings $settings
   ```

Every hour `auto.mjs` checks the app's token. Once it's older than 20 hours, a window opens,
fills in your email and password, and waits for you only if a captcha shows up. Then it delivers
the token and closes. Missed it? It tries again the next hour. `auto.log` keeps one line per attempt.
