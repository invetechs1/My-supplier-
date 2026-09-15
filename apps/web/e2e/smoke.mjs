/**
 * Browser end-to-end smoke test. Runs against a seeded API + built web app.
 *   WEB_URL=http://localhost:3000 API_URL=http://localhost:4000/api/v1 node e2e/smoke.mjs
 * Optional: PW_EXECUTABLE_PATH to reuse a preinstalled Chromium.
 */
import { chromium } from "playwright";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const API = process.env.API_URL ?? "http://localhost:4000/api/v1";
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " – " + extra : ""}`); };

const browser = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE_PATH || undefined, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
const text = () => page.innerText("body");
const accept = () => page.getByRole("button", { name: /^accept$/i }).first().click().catch(() => {});
async function login(email, password, urlRe) {
  await page.goto(`${WEB}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.goto(`${WEB}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole("button", { name: /sign in|log in|login/i }).first().click();
  await page.waitForURL(urlRe, { timeout: 20000 });
  await accept();
}

try {
  // Public pages
  await page.goto(`${WEB}/`, { waitUntil: "domcontentloaded" });
  await accept();
  await page.waitForFunction(() => /Build for less/i.test(document.body.innerText), null, { timeout: 20000 });
  check("landing renders", /BOQ/i.test(await text()));

  await page.goto(`${WEB}/boq`, { waitUntil: "domcontentloaded" });
  await page.getByText(/^paste text$/i).first().click().catch(() => {});
  await page.waitForSelector("textarea", { timeout: 15000 });
  await page.fill("textarea", "Rebar 16mm, 25, ton\n1200 bags OPC cement 50kg");
  await page.getByRole("button", { name: /research/i }).first().click();
  await page.waitForFunction(() => /Cheapest|Best single/i.test(document.body.innerText), null, { timeout: 30000 });
  check("BOQ research returns results", /Where to buy/i.test(await text()));

  await page.goto(`${WEB}/shop`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => /deal/i.test(document.body.innerText), null, { timeout: 20000 });
  check("shop home renders deals", true);

  // Buyer: checkout
  await login("buyer@mysupplier.sa", "Buyer123!", /dashboard/);
  const tok = await page.evaluate(() => localStorage.getItem("ms_token"));
  const cem = await (await page.request.get(`${API}/materials?q=CEM-OPC-50`)).json();
  const prices = await (await page.request.get(`${API}/materials/${cem.data[0].id}/prices`)).json();
  const lid = prices.find((l) => l.company && l.source === "SUPPLIER").id;
  await page.request.delete(`${API}/cart`, { headers: { authorization: `Bearer ${tok}` } });
  const add = await page.request.post(`${API}/cart/items`, { headers: { authorization: `Bearer ${tok}` }, data: { listingId: lid, quantity: 200 } });
  check("add to cart", add.ok());
  await page.goto(`${WEB}/checkout`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const citySel = page.locator("select").first();
  await citySel.selectOption({ label: "Riyadh" }).catch(() => citySel.selectOption("Riyadh"));
  for (const i of await page.locator("input:not([type=radio]):not([type=checkbox]), textarea").all()) {
    const ph = ((await i.getAttribute("placeholder")) || "") + " " + ((await i.getAttribute("name")) || "");
    if (/address/i.test(ph)) await i.fill("King Fahd Rd, Riyadh");
    if (/phone/i.test(ph)) await i.fill("+966501234567");
  }
  await page.getByRole("button", { name: /place order/i }).first().click();
  await page.waitForFunction(() => /ORD-\d{4}/.test(document.body.innerText), null, { timeout: 30000 });
  const ref = ((await text()).match(/ORD-\d{4}-\d+/) || [])[0];
  check("checkout creates an order", Boolean(ref), ref);

  await page.goto(`${WEB}/dashboard/orders`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction((r) => document.body.innerText.includes(r), ref, { timeout: 20000 });
  check("order visible in buyer orders", true);

  // Supplier portal
  await login("supplier@mysupplier.sa", "Supplier123!", /supplier/);
  await page.goto(`${WEB}/supplier`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => /win rate|revenue/i.test(document.body.innerText), null, { timeout: 20000 });
  check("supplier dashboard renders", true);
  await page.goto(`${WEB}/supplier/inventory`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => /Reserved|Available/i.test(document.body.innerText), null, { timeout: 20000 });
  check("supplier inventory renders", true);

  // Admin
  await login("admin@mysupplier.sa", "Admin123!", /admin/);
  await page.goto(`${WEB}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => /GMV|orders/i.test(document.body.innerText), null, { timeout: 20000 });
  check("admin overview renders", true);

  check("no uncaught page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
} catch (e) {
  check("script completed", false, String(e).split("\n")[0]);
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
