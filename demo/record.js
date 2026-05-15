/* Demo recording: walks through the live UI with Japanese captions. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = 'https://expense-ocr-portal.pages.dev/';
const SECRETS = fs.readFileSync('/Users/ryotaroyoshihara/.config/expense-ocr/secrets.env', 'utf8');
const ADMIN_KEY = SECRETS.match(/^ADMIN_KEY=(.+)$/m)[1].trim();

const RND = Math.random().toString(36).slice(2, 10);
const DEMO_NAME = 'デモ株式会社';
const FOLDER_R = `https://drive.google.com/drive/folders/DEMO_R_${RND}_FOLDER`;
const SHEET_R  = `https://docs.google.com/spreadsheets/d/DEMO_R_${RND}_SHEET_RS`;
const FOLDER_I = `https://drive.google.com/drive/folders/DEMO_I_${RND}_FOLDER`;
const SHEET_I  = `https://docs.google.com/spreadsheets/d/DEMO_I_${RND}_SHEET_IS`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function setCap(page, text) {
  await page.evaluate(t => window._setCap && window._setCap(t), text);
}

async function main() {
  // clean recordings dir
  const recDir = path.join(__dirname, 'recordings');
  if (fs.existsSync(recDir)) fs.rmSync(recDir, { recursive: true, force: true });
  fs.mkdirSync(recDir);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
    recordVideo: { dir: recDir, size: { width: 1440, height: 900 } },
  });

  // Caption overlay injected on every page
  await context.addInitScript(() => {
    const setup = () => {
      if (!document.body) return setTimeout(setup, 20);
      const div = document.createElement('div');
      div.id = '_demo_cap';
      div.style.cssText = `
        position: fixed; bottom: 56px; left: 50%; transform: translateX(-50%) translateY(8px);
        background: rgba(0,0,0,0.88); color: #fff;
        padding: 14px 28px; border-radius: 100px;
        font-family: -apple-system, 'Noto Sans JP', sans-serif; font-size: 20px; font-weight: 600;
        z-index: 99999; opacity: 0; transition: opacity 0.4s, transform 0.4s;
        max-width: 80%; text-align: center; line-height: 1.5;
        box-shadow: 0 16px 40px rgba(0,0,0,0.35);
        pointer-events: none; letter-spacing: 0.02em;
      `;
      document.body.appendChild(div);
      window._setCap = (text) => {
        if (!text) { div.style.opacity = '0'; div.style.transform = 'translateX(-50%) translateY(8px)'; return; }
        div.textContent = text;
        div.style.opacity = '1';
        div.style.transform = 'translateX(-50%) translateY(0)';
      };

      // Spotlight ring
      const ring = document.createElement('div');
      ring.id = '_demo_ring';
      ring.style.cssText = `
        position: fixed; pointer-events: none; border: 3px solid #2c5fd0;
        border-radius: 12px; box-shadow: 0 0 0 4px rgba(44,95,208,0.18), 0 8px 24px rgba(44,95,208,0.18);
        z-index: 99998; opacity: 0; transition: all 0.35s;
      `;
      document.body.appendChild(ring);
      window._spot = (sel) => {
        const r = document.querySelector(sel);
        if (!r) { ring.style.opacity = '0'; return; }
        const rect = r.getBoundingClientRect();
        ring.style.left = (rect.left - 6) + 'px';
        ring.style.top = (rect.top - 6) + 'px';
        ring.style.width = (rect.width + 12) + 'px';
        ring.style.height = (rect.height + 12) + 'px';
        ring.style.opacity = '1';
      };
      window._unspot = () => { ring.style.opacity = '0'; };
    };
    setup();
  });

  const page = await context.newPage();

  // dialog auto-accept (for delete confirm)
  page.on('dialog', d => d.accept());

  // 0. Open URL
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#lock-key', { state: 'visible' });
  await sleep(800);

  // Scene 1: Login
  await setCap(page, '管理者パスを入力してログイン');
  await sleep(3200);
  await page.click('#lock-key');
  await page.type('#lock-key', ADMIN_KEY, { delay: 40 });
  await sleep(900);
  await page.click('button[type="submit"]');
  await page.waitForSelector('#app.show', { state: 'attached' });
  await page.waitForSelector('.brand-mark');
  await sleep(1500);

  // Scene 2: Dashboard
  await setCap(page, 'ダッシュボードで全体の処理状況をひと目で確認');
  await sleep(3500);
  await page.evaluate(() => window._spot('.grid-kpi'));
  await setCap(page, 'KPI: 直近24時間の処理 / 失敗 / アクティブ社数');
  await sleep(4200);
  await page.evaluate(() => window._spot('.chart-panel'));
  await setCap(page, '過去7日間のトレンドと最新の実行ステータス');
  await sleep(4500);
  await page.evaluate(() => window._unspot());
  await sleep(600);

  // Scene 3: Clients tab
  await setCap(page, 'クライアントタブへ');
  await sleep(1500);
  await page.click('button[data-tab="clients"]');
  await page.waitForSelector('section[data-panel="clients"].show');
  await sleep(1200);
  await page.evaluate(() => window._spot('.chip-row'));
  await setCap(page, 'チップで「有効」「失敗あり」など即フィルタ');
  await sleep(4200);
  await page.evaluate(() => window._unspot());

  // Scene 4: Add client
  await setCap(page, '「新規追加」で新しいクライアントを登録');
  await page.evaluate(() => window._spot('#add-toggle'));
  await sleep(3200);
  await page.click('#add-toggle');
  await page.evaluate(() => window._unspot());
  await page.waitForSelector('.edit-card');
  await sleep(1100);

  await setCap(page, 'クライアント名と Drive / シートのURLを入力');
  await page.fill('input[data-field="name"]', DEMO_NAME);
  await sleep(600);
  await page.fill('input[data-field="receipts_folder_url"]', FOLDER_R);
  await sleep(400);
  await page.fill('input[data-field="receipts_sheet_url"]', SHEET_R);
  await sleep(400);
  await page.fill('input[data-field="invoices_folder_url"]', FOLDER_I);
  await sleep(400);
  await page.fill('input[data-field="invoices_sheet_url"]', SHEET_I);
  await sleep(1800);

  await setCap(page, '「保存」で即座にリストに反映');
  await page.evaluate(() => window._spot('button[data-act="save"]'));
  await sleep(2500);
  await page.click('button[data-act="save"]');
  await page.evaluate(() => window._unspot());
  await page.waitForSelector(`text=${DEMO_NAME}`);
  await sleep(2000);

  // Scene 5: Show actions
  await setCap(page, '編集 / 停止 / 削除 はアイコンボタンから');
  const demoRow = await page.locator('.client-row', { hasText: DEMO_NAME }).first();
  const actions = demoRow.locator('.col-actions');
  await actions.scrollIntoViewIfNeeded();
  await page.evaluate(name => {
    const rows = document.querySelectorAll('.client-row');
    for (const r of rows) {
      if (r.textContent.includes(name)) {
        const rect = r.querySelector('.col-actions').getBoundingClientRect();
        const ring = document.getElementById('_demo_ring');
        ring.style.left = (rect.left - 6) + 'px';
        ring.style.top = (rect.top - 6) + 'px';
        ring.style.width = (rect.width + 12) + 'px';
        ring.style.height = (rect.height + 12) + 'px';
        ring.style.opacity = '1';
        break;
      }
    }
  }, DEMO_NAME);
  await sleep(4000);
  await page.evaluate(() => window._unspot());

  // Scene 6: Delete demo client
  await setCap(page, '削除はワンクリック (確認ダイアログあり)');
  await sleep(2000);
  await demoRow.locator('button[data-act="delete"]').click();
  await sleep(1200);
  await page.waitForSelector(`text=${DEMO_NAME}`, { state: 'detached', timeout: 6000 }).catch(()=>{});
  await sleep(1600);

  // Scene 7: Settings
  await setCap(page, '設定タブで Discord 通知の Webhook URL を設定');
  await page.click('button[data-tab="settings"]');
  await page.waitForSelector('section[data-panel="settings"].show');
  await sleep(2000);
  await page.evaluate(() => window._spot('#set-webhook'));
  await sleep(3800);
  await page.evaluate(() => window._unspot());
  await sleep(600);

  // Scene 8: End
  await setCap(page, '毎日 23:00 JST に自動で OCR 処理が走ります');
  await sleep(4200);
  await setCap(page, '');
  await sleep(800);

  // finalize
  await context.close();
  await browser.close();

  // find recorded webm
  const files = fs.readdirSync(recDir).filter(f => f.endsWith('.webm'));
  if (!files.length) { console.error('no recording'); process.exit(1); }
  const out = path.join(recDir, files[0]);
  console.log('recorded:', out);
}

main().catch(e => { console.error(e); process.exit(1); });
