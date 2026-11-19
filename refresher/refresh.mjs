// Robô: usa a sessão salva para gerar um PAT novo e entregá-lo ao app. Sem senha, sem captcha.
import { chromium } from "playwright";
import { TOKENS_URL, config, createPat, deliverPat, describe, extractToken, loadSession, saveSession } from "./lib.mjs";

const cfg = config();
const session = await loadSession(cfg);
if (!session) {
  console.error("Nenhuma sessão salva. Rode `npm run login` uma vez no seu computador.");
  process.exit(3);
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ storageState: session });
  const page = await context.newPage();
  // A página carrega a lista via /api/tokens; se a sessão caiu, redireciona para o login da Samsung.
  const listedP = page
    .waitForResponse((r) => r.url().includes("/api/tokens") && r.request().method() === "GET", { timeout: 45000 })
    .catch(() => null);
  await page.goto(TOKENS_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  const listed = await listedP;
  if (!listed || listed.status() !== 200 || !page.url().startsWith(TOKENS_URL)) {
    console.error(`Sessão expirada (url: ${page.url().split("?")[0]}). Rode \`npm run login\` de novo.`);
    process.exit(4);
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const { status, text } = await createPat(page, { scopes: cfg.scopes, name: `${cfg.namePrefix}-${stamp}` });
  if (status !== 200 && status !== 201) {
    console.error(`Criação do token falhou: HTTP ${status} ${describe(text)}`);
    process.exit(5);
  }
  const token = extractToken(text);
  if (!token) {
    console.error(`Token não encontrado na resposta: ${describe(text)}`);
    process.exit(6);
  }

  await deliverPat(cfg, token);
  console.log("Token novo entregue.");
  // Cookies renovados: salva para a próxima execução manter a sessão viva.
  await saveSession(cfg, await context.storageState());
  console.log("Sessão atualizada.");
} finally {
  await browser.close();
}
