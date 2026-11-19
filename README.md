# Ar

Controle pessoal do ar Samsung WindFree via SmartThings: PWA, Siri (Atalhos) e token renovado sozinho.
Next.js na Vercel + Upstash Redis.

Duas partes independentes:
- **app** (raiz): web app + API do ar. Recebe o token do SmartThings em `POST /api/pat`.
- **[refresher/](refresher/)**: robô que gera um token novo a cada 12h (GitHub Actions) e entrega ao app.

> Desde nov/2026 apps OAuth do SmartThings exigem plano pago. O app ainda suporta OAuth
> (rotas `/api/auth/*`), mas o caminho padrão é PAT + refresher.

## Setup (uma vez)

1. **Redis**: no projeto da Vercel → Storage → Upstash for Redis (free). As variáveis `KV_REST_API_*` /
   `UPSTASH_REDIS_REST_*` são injetadas sozinhas.
2. **App OAuth do SmartThings**:
   ```bash
   npm i -g @smartthings/cli
   smartthings apps:create
   ```
   Tipo **OAuth-In App**, redirect `https://<projeto>.vercel.app/api/auth/callback`,
   scopes `r:devices:*` e `x:devices:*`. Guarde o client id/secret (aparecem uma vez).
3. **Variáveis** na Vercel (ver `.env.example`): `ST_CLIENT_ID`, `ST_CLIENT_SECRET`, `ST_REDIRECT_URI`,
   `AC_API_KEY`, `CRON_SECRET`. `ST_DEVICE_ID` é opcional (sem ele, usa o primeiro ar da conta).
4. Redeploy, abra o app, cole a `AC_API_KEY`, toque em **Reconectar SmartThings** e autorize.
5. Abra `/api/debug` e confira as capabilities (`docs/capabilities.md`).
6. Crie os atalhos da Siri (`docs/atalhos.md`).

## Rotas

| Rota | O que faz |
|---|---|
| `GET /api/ac` | status normalizado `{ power, mode, targetTemp, currentTemp, windFree, display, online, needsReauth }` |
| `POST /api/ac` | estado desejado `{ power?, temp?, windFree?, display?, mode? }`, enviado numa chamada só |
| `POST /api/ac/preset/sleep` | liga, 25°, WindFree, display off |
| `POST /api/ac/off` | desliga |
| `GET /api/debug` | descoberta: aparelhos, capabilities, status bruto |
| `GET /api/auth/login` | inicia OAuth (exige sessão ou `?key=`) |
| `GET /api/cron/refresh` | cron diária, renova os tokens (`Bearer CRON_SECRET`) |

Todas as rotas `/api/ac*` e `/api/debug` exigem `x-ac-key` ou o cookie de sessão do app.

## Tokens

Par access/refresh numa única chave `st:tokens`. Renova quando falta <25% da vida útil, com lock
`SET NX PX` no Redis (o refresh token é invalidado a cada uso). Em 401 força um refresh e tenta de novo
uma vez. A cron diária mantém o refresh token com menos de 1 dia de idade. Se o refresh for rejeitado,
`GET /api/ac` devolve `needsReauth: true` e o app mostra o botão de reconectar.
