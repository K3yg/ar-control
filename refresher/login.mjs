// Login manual, uma vez: abre um navegador visível, você entra na conta Samsung (captcha incluso)
// e a sessão é salva criptografada no store. Depois o refresh.mjs roda sozinho.
import { chromium } from "playwright";
import { TOKENS_URL, config, saveSession } from "./lib.mjs";

const cfg = config();
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1100, height: 850 } });
const page = await context.newPage();

// Logado de verdade = a página de tokens conseguiu listar os tokens.
let loggedIn = false;
page.on("response", (r) => {
  if (r.url().startsWith("https://account.smartthings.com/api/tokens") && r.status() === 200) loggedIn = true;
});
await page.goto(TOKENS_URL);

console.log("Faça login na janela que abriu. Ela fecha sozinha quando a página de tokens carregar.");
const deadline = Date.now() + 10 * 60 * 1000;
while (!loggedIn) {
  if (page.isClosed() || Date.now() > deadline) {
    console.error("Login não concluído.");
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 1000));
}
await page.waitForTimeout(1500);

await saveSession(cfg, await context.storageState());
await browser.close();
console.log("Sessão salva. Rode `npm start` para gerar o primeiro token.");
