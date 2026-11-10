import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto("http://localhost:3000/schools", { waitUntil: "networkidle0" });
const clip = { x: 700, y: 60, width: 740, height: 500 };
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: "/tmp/d3-t0.png", clip });
await new Promise((r) => setTimeout(r, 1000));
await page.screenshot({ path: "/tmp/d3-t1.png", clip });
await browser.close();
