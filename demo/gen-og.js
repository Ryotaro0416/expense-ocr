const { chromium } = require('playwright');
const path = require('path');

const HTML = `<!doctype html>
<html lang="ja"><head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@600;700;800&family=Noto+Sans+JP:wght@700;800&display=swap" rel="stylesheet">
<style>
  *, *::before { box-sizing: border-box; }
  body { margin: 0; width: 1200px; height: 630px; position: relative;
         background: #f3f5fb;
         font-family: 'Inter', 'Noto Sans JP', sans-serif;
         color: #0d1217; -webkit-font-smoothing: antialiased; }
  .accent { position: absolute; top: 0; left: 0; right: 0; height: 10px;
            background: linear-gradient(90deg, #0017c1 0%, #1c4abd 45%, #008892 100%); }
  .layout { position: relative; padding: 76px 80px; height: 100%; display: flex; flex-direction: column; justify-content: space-between; }
  .top { display: flex; gap: 24px; align-items: center; }
  .mark { width: 80px; height: 80px; border-radius: 20px;
          background: linear-gradient(135deg, #0017c1 0%, #1c4abd 50%, #008892 100%);
          display: flex; align-items: center; justify-content: center;
          color: #fff; font-size: 44px; font-weight: 800; letter-spacing: -0.04em;
          box-shadow: 0 16px 40px rgba(0,23,193,0.32); }
  .brand { font-size: 24px; font-weight: 700; }
  .brand-sub { font-size: 15px; color: #4a5763; margin-top: 4px; }
  h1 { font-size: 76px; font-weight: 800; margin: 0; line-height: 1.1; letter-spacing: -0.03em;
       background: linear-gradient(135deg, #0d1217 0%, #1c4abd 70%, #008892 100%);
       -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .lead { font-size: 26px; color: #4a5763; margin-top: 20px; max-width: 880px; line-height: 1.55; }
  .features { display: flex; gap: 16px; }
  .pill { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px;
          background: #fff; color: #1c4abd; border-radius: 999px;
          font-size: 17px; font-weight: 600; box-shadow: 0 4px 14px rgba(15,23,42,0.08); }
  .pill::before { content: ''; width: 8px; height: 8px; background: #1c4abd; border-radius: 50%; }
  .pill.alt { color: #008892; }
  .pill.alt::before { background: #008892; }
  .pill.ok { color: #16803c; }
  .pill.ok::before { background: #16803c; }
</style></head>
<body>
  <div class="accent"></div>
  <div class="layout">
    <div class="top">
      <div class="mark">¥</div>
      <div>
        <div class="brand">バックオフィスOCR</div>
        <div class="brand-sub">領収書・請求書 自動OCR コンソール</div>
      </div>
    </div>
    <div>
      <h1>領収書・請求書を、<br>毎日 自動でデータ化。</h1>
      <p class="lead">Drive にアップするだけで、Gemini OCR でスプレッドシートに転記。<br>複数クライアントを 1 つのコンソールから一元管理。</p>
    </div>
    <div class="features">
      <span class="pill">毎日 23:00 JST 自動実行</span>
      <span class="pill alt">複数クライアント対応</span>
      <span class="pill ok">Discord 通知 / 手動実行</span>
    </div>
  </div>
</body></html>`;

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(HTML, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const out = path.join(__dirname, '..', 'web', 'public', 'og.png');
  await page.screenshot({ path: out, type: 'png', omitBackground: false });
  console.log('saved:', out);
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
