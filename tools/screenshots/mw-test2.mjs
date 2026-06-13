// 一時検証: 連続同期でタブが重複作成される競合の切り分け。
// 1) applySettingsChange 由来の同期だけ走らせてダンプ
// 2) 所有タブの検証条件(url/pendingUrl/groupId)をその場で評価
// 3) 直後に SYNC_TABS_NOW → 重複が出るか
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
const snapshot = {
  fetchedAt: now,
  authState: 'ok',
  sections: [
    {
      id: 'review-requested',
      label: 'Needs your review',
      prs: [1, 2].map((n) => pr('acme/api', n)),
    },
  ],
};
const settings = {
  sections: {
    'review-requested': {
      enabled: true,
      label: 'Needs your review',
      groupName: 'Needs review',
      groupColor: 'yellow',
    },
  },
};

const profile = await mkdtemp(path.join(tmpdir(), 'prs-inbox-mwtest2-'));
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
await new Promise((r) => setTimeout(r, 2500));

// console.warn/error をフックして拡張内部の警告を回収
await sw.evaluate(() => {
  globalThis.__logs = [];
  for (const k of ['warn', 'error']) {
    const orig = console[k].bind(console);
    console[k] = (...a) => {
      globalThis.__logs.push(
        `[${k}] ` + a.map((x) => (x instanceof Error ? x.message : String(x))).join(' '),
      );
      orig(...a);
    };
  }
});

const dump = async (label) => {
  const d = await sw.evaluate(async () => {
    const groups = await chrome.tabGroups.query({});
    const tabs = await chrome.tabs.query({});
    const st = (await chrome.storage.session.get('syncState')).syncState;
    return {
      groups: groups.map((g) => ({ id: g.id, title: g.title, windowId: g.windowId })),
      ghTabs: tabs
        .filter((t) => (t.url ?? t.pendingUrl ?? '').includes('github.com'))
        .map((t) => ({
          id: t.id,
          group: t.groupId,
          url: t.url || `(pending) ${t.pendingUrl}`,
          status: t.status,
        })),
      owned: st?.ownedTabs,
      groupIds: st?.groupIds,
      logs: globalThis.__logs.splice(0),
    };
  });
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(d, null, 1));
  return d;
};

// 注入: session → local → sync(最後に settings、これで applySettingsChange が発火)
await sw.evaluate(
  async (d) => {
    await chrome.storage.session.set({
      syncState: { ownedTabs: [], groupIds: {}, backoffUntil: Date.now() + 3.6e6 },
    });
    await chrome.storage.local.set({ snapshot: d.snapshot });
    await chrome.storage.sync.set({ settings: d.settings });
  },
  { snapshot, settings },
);

await new Promise((r) => setTimeout(r, 2000));
await dump('after settings-triggered sync (waited 2s)');

// 所有タブの検証条件を手動評価
const validation = await sw.evaluate(async () => {
  const st = (await chrome.storage.session.get('syncState')).syncState;
  const out = [];
  for (const ot of st?.ownedTabs ?? []) {
    const tab = await chrome.tabs.get(ot.tabId).catch(() => null);
    out.push({
      owned: ot,
      tab: tab
        ? { url: tab.url, pendingUrl: tab.pendingUrl, groupId: tab.groupId, status: tab.status }
        : null,
    });
  }
  return out;
});
console.log('\n=== owned-tab validation snapshot ===');
console.log(JSON.stringify(validation, null, 1));

// 直後に手動同期(ポップアップを開いて SYNC_TABS_NOW)
const trigger = await context.newPage();
await trigger.goto(`chrome-extension://${extId}/src/popup/index.html`);
await trigger.evaluate(
  () => new Promise((res) => chrome.runtime.sendMessage({ type: 'SYNC_TABS_NOW' }, res)),
);
await new Promise((r) => setTimeout(r, 800));
await dump('after manual SYNC_TABS_NOW');

// さらに連打(設定保存+手動更新の連続を模す)
await trigger.evaluate(() => {
  chrome.runtime.sendMessage({ type: 'SYNC_TABS_NOW' });
  return new Promise((res) => chrome.runtime.sendMessage({ type: 'SYNC_TABS_NOW' }, res));
});
await new Promise((r) => setTimeout(r, 800));
await dump('after rapid double SYNC_TABS_NOW');

await context.close();
console.log('\ndone');
