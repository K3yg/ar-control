# refresher

Creates SmartThings **personal access tokens (PATs)** automatically. PATs expire after 24 hours, and
since November 2026 SmartThings OAuth apps require a paid plan. This robot reuses a signed-in Samsung
session to create a new PAT on every run and send it to a URL of yours.

- **No password stored.** You sign in **once**, by hand (captcha included); only the session cookies are kept.
- **Encrypted session.** It's encrypted with AES-256-GCM using `SESSION_KEY`, which only the robot
  knows. The server that stores the blob can't read it.
- **Self-renewing.** Each run renews the cookies, which keeps the session alive.
- **Backend-agnostic.** It only needs two HTTP endpoints, so it works with any app, not just this one.

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
npm run login          # once: a browser opens, you sign in, the session is saved
npm start              # creates and delivers a token
```

## Run it every 12 hours (GitHub Actions)

`.github/workflows/refresh-pat.yml` runs every 12 hours. Add the repository secrets `APP_URL`,
`APP_KEY` and `SESSION_KEY`, for example with `gh secret set -f refresher/.env`.
You can also run it by hand: *Actions → Refresh SmartThings token → Run workflow*.

## When the session runs out

The robot exits with code 4 ("Session expired") and GitHub emails you about the failed run.
Run `npm run login` again on your computer. Meanwhile the app accepts a token pasted by hand.

## Exit codes

`2` configuration · `3` no saved session · `4` session expired · `5` token creation failed · `6` no token in the response
