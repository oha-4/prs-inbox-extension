// 一時検証スクリプト: 複数ウィンドウ時のタブグループ同期挙動を実Chromiumで観察する。
// dist/ の拡張を読み込み、storage を注入して SYNC_TABS_NOW を送り、
// 各シナリオ後のウィンドウ/グループ/タブ配置をダンプする。
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const DIST = path.join(ROOT, 'dist');

const now = Date.now();
const pr = (repo, n) => ({
  id: `${repo}#${n}`,
  number: n,
  title: `PR ${n}`,
  url: `https://github.com/${repo}/pull/${n}`,
  repoNameWithOwner: repo,
  authorLogin: 'a',
  state: 'OPEN',
  isDraft: false,
  commentCount: 0,
  isReadByCurrentUser: true,
  createdAt: new Date(now - n * 1e6).toISOString(),
  updatedAt: new Date(now - n * 1e5).toISOString(),
});
const snap = (reviewNums, readyNums = []) => ({
  fetchedAt: now,
  authState: 'ok',
  sections: [
    {
      id: 'review-requested',
      label: 'Needs your review',
      prs: reviewNums.map((n) => pr('acme/api', n)),
    },
    { id: 'ready-to-merge', label: 'Ready to merge', prs: readyNums.map((n) => pr('acme/web', n)) },
  ],
});

const settingsBase = {
  sections: {
    'review-requested': {
      enabled: true,
      label: 'Needs your review',
      groupName: 'Needs review',
      groupColor: 'yellow',
    },
  },
};
const settingsTwoGroups = {
  sections: {
    ...settingsBase.sections,
    'ready-to-merge': {
      enabled: true,
      label: 'Ready to merge',
      groupName: 'Ship it',
      groupColor: 'green',
    },
  },
};

const profile = await mkdtemp(path.join(tmpdir(), 'prs-inbox-mwtest-'));
const context = await chromium.launchPersistentContext(profile, {
  headless: false,
  args: [
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    '--no-first-run',
    '--window-size=900,700',
    '--window-position=40,40',
  ],
});
await context.route('https://github.com/**', (route) =>
  route.fulfill({ contentType: 'text/html', body: '<title>pr</title>ok' }),
);

let sw = context.serviceWorkers()[0];
if (!sw) sw = await context.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;

// 起動直後の onInstalled ポーリングが落ち着くのを待ってから注入
await new Promise((r) => setTimeout(r, 2500));

const inject = (data) =>
  sw.evaluate(async (d) => {
    if (d.syncState) await chrome.storage.session.set({ syncState: d.syncState });
    if (d.settings) await chrome.storage.sync.set({ settings: d.settings });
    if (d.snapshot) await chrome.storage.local.set({ snapshot: d.snapshot });
  }, data);

await inject({
  syncState: { ownedTabs: [], groupIds: {}, backoffUntil: now + 3.6e6 },
  settings: settingsBase,
  snapshot: snap([1, 2]),
});

const trigger = await context.newPage();
await trigger.goto(`chrome-extension://${extId}/src/popup/index.html`);
const syncNow = async () => {
  await trigger.evaluate(
    () => new Promise((res) => chrome.runtime.sendMessage({ type: 'SYNC_TABS_NOW' }, res)),
  );
  await new Promise((r) => setTimeout(r, 600));
};

const dump = async (label) => {
  const d = await sw.evaluate(async () => {
    const wins = await chrome.windows.getAll();
    const groups = await chrome.tabGroups.query({});
    const tabs = await chrome.tabs.query({});
    const lf = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
    const st = (await chrome.storage.session.get('syncState')).syncState;
    return {
      lastFocused: lf?.id,
      windows: wins.map((w) => w.id),
      groups: groups.map((g) => ({ id: g.id, title: g.title, windowId: g.windowId })),
      tabs: tabs
        .filter((t) => (t.url ?? '').startsWith('https://github.com'))
        .map((t) => ({
          id: t.id,
          win: t.windowId,
          group: t.groupId,
          url: (t.url ?? '').replace('https://github.com/', ''),
        })),
      groupIds: st?.groupIds,
      owned: st?.ownedTabs?.length,
    };
  });
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(d, null, 1));
  return d;
};

// --- Step 1: ウィンドウAで初回同期 ---
await syncNow();
const s1 = await dump('step1: initial sync (window A focused)');

// --- Step 2: 新規ウィンドウBを作成・フォーカス ---
const winB = await sw.evaluate(async () => {
  const w = await chrome.windows.create({ url: 'about:blank', focused: true });
  return w.id;
});
await new Promise((r) => setTimeout(r, 800));
await dump(`step2: window B (${winB}) created & focused`);

// --- Step 3: Bフォーカス中に新PRが増える → どこに作られるか ---
await inject({ snapshot: snap([1, 2, 3]) });
await syncNow();
await dump('step3: PR#3 added while window B focused');

// --- Step 4: ブラウザ再起動相当（session の groupIds 消失）→ タイトル養子縁組は窓を跨ぐか ---
await inject({
  syncState: { ownedTabs: [], groupIds: {}, backoffUntil: now + 3.6e6 },
  snapshot: snap([1, 2, 3, 4]),
});
await syncNow();
await dump('step4: syncState cleared, PR#4 added (B focused)');

// --- Step 5: 別名の新グループが必要になったとき → どの窓に作られるか ---
await inject({ settings: settingsTwoGroups, snapshot: snap([1, 2, 3, 4], [10]) });
await syncNow();
await dump('step5: second section "Ship it" enabled (B focused)');

// --- Step 6: ユーザーがウィンドウAのグループをリネーム → 同期はどうなるか ---
const needsReviewGid = s1.groups.find((g) => g.title === 'Needs review')?.id;
await sw.evaluate(async (gid) => {
  await chrome.tabGroups.update(gid, { title: 'My renamed group' });
}, needsReviewGid);
await inject({ snapshot: snap([1, 2, 3, 4, 5], [10]) });
await syncNow();
await dump('step6: group renamed by user in window A, PR#5 added');

await context.close();
console.log('\ndone');
