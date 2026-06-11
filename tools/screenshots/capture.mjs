// Chrome Web Store 用スクリーンショット生成。
// dist/ の拡張を実Chromeに読み込み、storageへデモデータを注入して本物のポップアップUIを撮影し、
// 1280x800 のブランド背景に合成して JPEG を out/ に出力する。
//
//   node capture.mjs            # 英語UI
//
// 前提: リポジトリrootで `npm run build` 済み（dist/ が存在すること）。
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
// en撮影時は _locales/ja を抜いたコピーを読み込む（UI言語に関わらず default_locale=en に落ちる）
const DIST = process.env.SHOT_DIST ?? path.join(ROOT, 'dist');
const OUT = path.join(HERE, 'out');

const FONTS = {
  display: pathToFileURL(
    path.join(
      ROOT,
      'site/node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2',
    ),
  ).href,
  sans: pathToFileURL(
    path.join(
      ROOT,
      'site/node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2',
    ),
  ).href,
  mono: pathToFileURL(
    path.join(
      ROOT,
      'site/node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2',
    ),
  ).href,
};

// ── デモデータ ──────────────────────────────────────────────────────────────
const now = Date.now();
const ago = (mins) => new Date(now - mins * 60_000).toISOString();
const pr = (
  repo,
  number,
  title,
  author,
  mins,
  { unread = false, comments = 0, draft = false } = {},
) => ({
  id: `${repo}#${number}`,
  number,
  title,
  url: `https://github.com/${repo}/pull/${number}`,
  repoNameWithOwner: repo,
  authorLogin: author,
  state: 'OPEN',
  isDraft: draft,
  commentCount: comments,
  isReadByCurrentUser: !unread,
  createdAt: ago(mins + 600),
  updatedAt: ago(mins),
});

const snapshot = {
  fetchedAt: now - 45_000,
  authState: 'ok',
  sections: [
    {
      id: 'review-requested',
      label: 'Needs your review',
      prs: [
        pr('acme/auth-service', 482, 'Fix race when refreshing tokens concurrently', 'mkato', 18, {
          unread: true,
          comments: 3,
        }),
        pr('acme/api', 1290, 'Add a retry budget to the sync queue', 'jchen', 54, {
          unread: true,
          comments: 5,
        }),
        pr('acme/web', 964, 'Migrate the preferences panel to the new form kit', 'sofia-r', 130, {
          comments: 2,
        }),
        pr('acme/infra', 233, 'Bump the minimum Node version to 24', 'devnran', 200),
        pr('tidelab/cli', 312, 'Add --json output to the status command', 'p-okabe', 320, {
          comments: 1,
        }),
      ],
    },
    {
      id: 'waiting-for-review',
      label: 'Waiting for review',
      prs: [
        pr('acme/api', 1295, 'Extract the diff planner into a pure module', 'you', 35, {
          comments: 1,
        }),
        pr('acme/web', 970, 'Tighten the empty states across the dashboard', 'you', 95),
        pr('acme/design-system', 188, 'Document the focus-ring tokens', 'you', 260),
      ],
    },
    {
      id: 'ready-to-merge',
      label: 'Ready to merge',
      prs: [
        pr('acme/web', 957, 'Ship dark mode for the dashboard', 'you', 12, { comments: 8 }),
        pr('tidelab/cli', 309, 'Cache release metadata between runs', 'you', 75, { comments: 2 }),
      ],
    },
  ],
};

const settings = {
  sections: {
    'review-requested': {
      enabled: true,
      label: 'Needs your review',
      groupName: 'Reviews',
      groupColor: 'yellow',
    },
    'ready-to-merge': {
      enabled: true,
      label: 'Ready to merge',
      groupName: 'Ship it',
      groupColor: 'green',
    },
  },
};

const syncState = { ownedTabs: [], groupIds: {}, backoffUntil: now + 3_600_000 };

// ── アバター差し替え（実ユーザー画像を使わない） ──────────────────────────
const AVATAR_COLORS = ['#29bf7e', '#4493f8', '#e2a33d', '#c678dd', '#e06c75'];
function avatarSvg(login) {
  const c =
    AVATAR_COLORS[[...login].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_COLORS.length];
  const letter = login[0].toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="20" fill="${c}"/><text x="20" y="26" font-family="system-ui" font-size="18" font-weight="600" fill="#fff" text-anchor="middle">${letter}</text></svg>`;
}

// ── 撮影 ────────────────────────────────────────────────────────────────────
const profile = await mkdtemp(path.join(tmpdir(), 'prs-inbox-shots-'));
// 注意: ブランド版Chrome(137+)は --load-extension を無視するため、Playwright同梱のChromiumを使う
const context = await chromium.launchPersistentContext(profile, {
  headless: false,
  viewport: { width: 420, height: 580 },
  deviceScaleFactor: 2,
  args: [
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    '--no-first-run',
    '--window-size=640,860',
    '--window-position=60,60',
  ],
});

await context.route('https://github.com/**', (route) => {
  const m = /github\.com\/([^/?]+)\.png/.exec(route.request().url());
  if (m) {
    route.fulfill({ contentType: 'image/svg+xml', body: avatarSvg(decodeURIComponent(m[1])) });
  } else {
    route.abort();
  }
});

let sw = context.serviceWorkers()[0];
if (!sw) sw = await context.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;

await sw.evaluate(
  async (data) => {
    await chrome.storage.session.set({ syncState: data.syncState });
    await chrome.storage.sync.set({ settings: data.settings });
    await chrome.storage.local.set({ snapshot: data.snapshot });
  },
  { snapshot, settings, syncState },
);

const page = await context.newPage();
await page.emulateMedia({ colorScheme: 'light' });
await page.goto(`chrome-extension://${extId}/src/popup/index.html`);
await page.getByText('Needs your review').first().waitFor();
// 拡張ロード直後の onStartup ポーリング（失敗して authState=error を残す）と競合するため、
// 落ち着いてからスナップショットを再注入して最終状態を確定させる
await page.waitForTimeout(1800);
await sw.evaluate(async (snap) => {
  await chrome.storage.local.set({ snapshot: snap });
}, snapshot);
await page.waitForTimeout(700); // 再描画 + 入場アニメーション完了待ち

await page.locator('body').screenshot({ path: path.join(OUT, 'popup-light.png') });
await page.emulateMedia({ colorScheme: 'dark' });
await page.waitForTimeout(300);
await page.locator('body').screenshot({ path: path.join(OUT, 'popup-dark.png') });

await page.emulateMedia({ colorScheme: 'light' });
// ヘッダーは Refresh / Settings / Open inbox の3ボタン。歯車は真ん中（ロケール非依存）
await page.locator('header button').nth(1).click();
await page.waitForTimeout(800);
await page.locator('body').screenshot({ path: path.join(OUT, 'settings-light.png') });

// ── 合成（1280x800 JPEG） ──────────────────────────────────────────────────
const composePage = await context.newPage();
await composePage.setViewportSize({ width: 1280, height: 800 });

const baseCss = (dark) => `
  @font-face { font-family: Display; src: url('${FONTS.display}') format('woff2'); }
  @font-face { font-family: Sans; src: url('${FONTS.sans}') format('woff2'); }
  @font-face { font-family: Mono; src: url('${FONTS.mono}') format('woff2'); }
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 1280px; height: 800px; overflow: hidden; }
  body {
    --signal: #29bf7e;
    --bg: ${dark ? '#0a0b0e' : '#fbfbf8'};
    --fg: ${dark ? '#e9e8e1' : '#1b1c19'};
    --muted: ${dark ? '#888c97' : '#65696f'};
    --line: ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.09)'};
    font-family: Sans, 'Hiragino Sans', system-ui, sans-serif;
    background-color: var(--bg);
    color: var(--fg);
    background-image:
      radial-gradient(120% 80% at 15% -10%, rgba(41,191,126,0.10) 0%, transparent 55%),
      radial-gradient(90% 60% at 100% 0%, rgba(68,147,248,0.08) 0%, transparent 50%),
      radial-gradient(var(--line) 1px, transparent 1px);
    background-size: 100% 100%, 100% 100%, 22px 22px;
    display: flex; align-items: center; gap: 56px; padding: 0 72px;
  }
  .copy { flex: 1; }
  .eyebrow {
    display: flex; align-items: center; gap: 10px;
    font-family: Mono, monospace; font-size: 14px; letter-spacing: 0.18em;
    text-transform: uppercase; color: var(--signal); font-weight: 600;
  }
  .led { width: 10px; height: 10px; border-radius: 50%; background: var(--signal);
    box-shadow: 0 0 10px 2px rgba(41,191,126,0.5); }
  h1 { font-family: Display, 'Hiragino Sans', sans-serif; font-size: 58px; line-height: 1.06;
    letter-spacing: -0.02em; margin-top: 22px; font-weight: 700; }
  .sub { margin-top: 20px; font-size: 21px; line-height: 1.5; color: var(--muted); max-width: 30ch; }
  .shot { flex-shrink: 0; position: relative; }
  .shot img { display: block; width: 430px; border-radius: 14px;
    border: 1px solid var(--line);
    box-shadow: 0 24px 80px rgba(0,0,0,${dark ? '0.55' : '0.18'}); }
  .groups { display: flex; gap: 8px; margin-bottom: 18px; align-items: center; }
  .pill { font-family: Sans; font-size: 13px; font-weight: 600; padding: 5px 12px;
    border-radius: 999px; color: #1b1c19; }
  .tab { width: 52px; height: 26px; border-radius: 8px 8px 0 0;
    background: ${dark ? '#181b22' : '#ffffff'}; border: 1px solid var(--line); border-bottom: 0; }
`;

function composeHtml({ dark, eyebrow, title, sub, img, groups }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${baseCss(dark)}</style></head>
  <body>
    <div class="copy">
      <div class="eyebrow"><span class="led"></span>${eyebrow}</div>
      <h1>${title}</h1>
      <p class="sub">${sub}</p>
    </div>
    <div class="shot">
      ${
        groups
          ? `<div class="groups">
        <span class="pill" style="background:#f7d56b">Reviews</span>
        <span class="tab"></span><span class="tab"></span><span class="tab"></span>
        <span class="pill" style="background:#7ee2ae">Ship it</span>
        <span class="tab"></span><span class="tab"></span>
      </div>`
          : ''
      }
      <img src="${img}">
    </div>
  </body></html>`;
}

const LOCALE = process.env.SHOT_LOCALE === 'ja' ? 'ja' : 'en';

const CAPTIONS = {
  en: [
    {
      eyebrow: 'PRs Inbox for GitHub',
      title: 'Your PR inbox,<br>one click away.',
      sub: 'Every section of github.com/pulls/inbox in a compact popup. Unread is bold — click to open.',
    },
    {
      eyebrow: 'Live tab groups',
      title: 'Sections become<br>living tab groups.',
      sub: 'PR tabs open, reorder and leave on their own as your inbox changes. Your own tabs are never touched.',
    },
    {
      eyebrow: 'Make it yours',
      title: 'Pick sections.<br>Name the groups.',
      sub: 'Per-section group names and colors, owner/repo filters, sort order, badge and refresh interval.',
    },
  ],
  ja: [
    {
      eyebrow: 'PRs Inbox for GitHub',
      title: 'PR Inboxを、<br>ワンクリックで。',
      sub: 'github.com/pulls/inbox の全セクションをコンパクトに一覧。未読は太字、クリックでPRを開く。',
    },
    {
      eyebrow: 'ライブなタブグループ',
      title: 'セクションが、生きた<br>タブグループになる。',
      sub: 'Inboxの変化に合わせてPRタブが自動で開き、並び、消えていく。あなた自身のタブには触れない。',
    },
    {
      eyebrow: 'カスタマイズ',
      title: 'セクションを選び、<br>グループに名前を。',
      sub: 'グループ名と色、owner/repoフィルタ、並び順、バッジ、更新間隔をセクションごとに設定できる。',
    },
  ],
};

const shots = [
  { out: `store-1-popup-${LOCALE}.jpg`, dark: false, img: 'popup-light.png', groups: false },
  { out: `store-2-tab-groups-${LOCALE}.jpg`, dark: true, img: 'popup-dark.png', groups: true },
  { out: `store-3-settings-${LOCALE}.jpg`, dark: false, img: 'settings-light.png', groups: false },
].map((s, i) => ({ ...s, ...CAPTIONS[LOCALE][i] }));

for (const s of shots) {
  const file = path.join(OUT, `compose-${s.out}.html`);
  writeFileSync(file, composeHtml(s));
  await composePage.goto(pathToFileURL(file).href);
  await composePage.evaluate(() => document.fonts.ready);
  await composePage.waitForTimeout(200);
  await composePage.screenshot({
    path: path.join(OUT, s.out),
    type: 'jpeg',
    quality: 92,
    clip: { x: 0, y: 0, width: 1280, height: 800 },
  });
  // deviceScaleFactor=2 で 2560x1600 になるため、CWS要件の 1280x800 へ縮小（macOS sips）
  execSync(`sips -z 800 1280 ${JSON.stringify(path.join(OUT, s.out))}`, { stdio: 'ignore' });
  console.log('wrote', s.out);
}

await context.close();
