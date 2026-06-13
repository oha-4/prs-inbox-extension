// 一時検証: 読み込み中タブ(url='' / pendingUrl のみ)に対する所有権検証の挙動。
// レスポンスを遅延させてタブを loading のまま保ち、その間に2回目の同期を走らせる。
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

const profile = await mkdtemp(path.join(tmpdir(), 'prs-inbox-mwtest3-'));
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
// PRページのレスポンスを3秒遅延 → タブが loading のままになる
await context.route('https://github.com/**', async (route) => {
  await new Promise((r) => setTimeout(r, 3000));
  await route.fulfill({ contentType: 'text/html', body: '<title>pr</title>ok' });
});

let sw = context.serviceWorkers()[0];
if (!sw) sw = await context.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;
await new Promise((r) => setTimeout(r, 2500));

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

const trigger = await context.newPage();
await trigger.goto(`chrome-extension://${extId}/src/popup/index.html`);
const syncNow = () =>
  trigger.evaluate(
    () => new Promise((res) => chrome.runtime.sendMessage({ type: 'SYNC_TABS_NOW' }, res)),
  );

// 同期1: タブ2枚作成(レスポンス遅延中 = loading のまま)
await syncNow();

// loading 中のタブの生の形を観察
const probe = await sw.evaluate(async () => {
  const st = (await chrome.storage.session.get('syncState')).syncState;
  const out = [];
  for (const ot of st?.ownedTabs ?? []) {
    const t = await chrome.tabs.get(ot.tabId).catch(() => null);
    out.push(
      t && {
        tabId: ot.tabId,
        url: JSON.stringify(t.url),
        pendingUrl: JSON.stringify(t.pendingUrl),
        status: t.status,
        groupId: t.groupId,
        nullishResult: JSON.stringify(t.url ?? t.pendingUrl ?? ''),
      },
    );
  }
  return out;
});
console.log('=== loading-state probe (what validation sees) ===');
console.log(JSON.stringify(probe, null, 1));

// 同期2: タブがまだ loading のうちに実行
await syncNow();
await new Promise((r) => setTimeout(r, 4000)); // 読み込み完了を待つ

const final = await sw.evaluate(async () => {
  const groups = await chrome.tabGroups.query({});
  const tabs = await chrome.tabs.query({});
  const st = (await chrome.storage.session.get('syncState')).syncState;
  return {
    groups: groups.map((g) => ({ id: g.id, title: g.title })),
    ghTabs: tabs
      .filter((t) => (t.url ?? t.pendingUrl ?? '').includes('github.com'))
      .map((t) => ({ id: t.id, group: t.groupId, url: t.url || `(pending) ${t.pendingUrl}` })),
    ownedTabIds: st?.ownedTabs?.map((o) => o.tabId),
  };
});
console.log('\n=== after 2nd sync during loading ===');
console.log(JSON.stringify(final, null, 1));

await context.close();
console.log('\ndone');
