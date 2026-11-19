# refresher

Gera **Personal Access Tokens (PAT)** do SmartThings automaticamente. Os PATs expiram em 24h e,
desde nov/2026, apps OAuth exigem plano pago. Este robô reaproveita uma sessão da sua conta Samsung
para criar um PAT novo a cada execução e entregá-lo a uma URL sua.

- Não guarda senha: você loga **uma vez**, à mão (captcha incluso), e só a sessão (cookies) é salva.
- A sessão é **criptografada** com AES-256-GCM usando `SESSION_KEY`, que só o robô conhece.
  O servidor que armazena o blob não consegue lê-lo.
- Cada execução renova os cookies, mantendo a sessão viva.

## Configuração (variáveis de ambiente)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `APP_URL` | sim* | Base do app. Padrões: `APP_URL/api/pat` e `APP_URL/api/refresher/session` |
| `APP_KEY` | sim | Enviado no header `x-ac-key` |
| `SESSION_KEY` | sim | 32 bytes em base64: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `PAT_TARGET_URL` | não | Recebe `POST { "token": "..." }` |
| `SESSION_STORE_URL` | não | `GET` → `{ "blob": string \| null }`, `PUT { "blob": string }` |
| `PAT_SCOPES` | não | Padrão `l:devices,r:devices:*,w:devices:*,x:devices:*` |
| `PAT_NAME_PREFIX` | não | Padrão `robo` |

\* ou `PAT_TARGET_URL` + `SESSION_STORE_URL`, para usar com qualquer outro backend.

## Uso

```bash
cd refresher
npm install && npx playwright install chromium
cp .env.example .env   # preencha
npm run login          # uma vez: abre o navegador, você loga, a sessão é salva
npm start              # gera e entrega um token
```

## Rodando todo dia (GitHub Actions)

O workflow `.github/workflows/refresh-pat.yml` roda a cada 12h. Configure os secrets do repositório
(`APP_URL`, `APP_KEY`, `SESSION_KEY`), por exemplo com `gh secret set -f refresher/.env`.
Também dá para rodar na mão em *Actions → Gerar token SmartThings → Run workflow*.

## Quando a sessão cair

O robô sai com código 4 ("Sessão expirada") e o GitHub te manda e-mail da falha. Rode
`npm run login` de novo no seu computador. Enquanto isso, o app aceita um token colado à mão.

## Códigos de saída

`2` configuração · `3` sem sessão · `4` sessão expirada · `5` criação do token falhou · `6` token não encontrado na resposta
