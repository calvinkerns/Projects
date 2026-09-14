// Load a page in headless Chrome and report what happened.
//   node tools/browser.mjs <url> [--wait 1500] [--shot .shots/page.png] [--eval "js expression"]
//     [--click "css selector"]...   (clicks run in order, each followed by --wait)
// Prints console messages, page errors, failed requests, and the --eval result.

import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const url = args.shift();
const opt = (flag) => {
  const out = [];
  for (let i = args.indexOf(flag); i >= 0; i = args.indexOf(flag)) {
    out.push(args[i + 1]);
    args.splice(i, 2);
  }
  return out;
};
const wait = Number(opt('--wait')[0] ?? 1500);
const shot = opt('--shot')[0];
const evals = opt('--eval');
const clicks = opt('--click');
const width = Number(opt('--width')[0] ?? 1400);

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-first-run', '--no-default-browser-check'],
});
const page = await browser.newPage();
await page.setViewport({ width, height: 900 });
page.on('console', (m) => console.log(`[console.${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => console.log(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) console.log(`[http ${r.status()}] ${r.url()}`); });

await page.goto(url, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, wait));
for (const sel of clicks) {
  try { await page.click(sel); console.log(`[click] ${sel}`); } catch (e) { console.log(`[click failed] ${sel}: ${e.message}`); }
  await new Promise((r) => setTimeout(r, wait));
}
for (const expr of evals) {
  try { console.log(`[eval] ${JSON.stringify(await page.evaluate(expr))}`); } catch (e) { console.log(`[eval error] ${e.message}`); }
}
if (shot) { await page.screenshot({ path: shot, fullPage: true }); console.log(`[shot] ${shot}`); }
await browser.close();
