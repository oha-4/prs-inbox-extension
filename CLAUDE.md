# CLAUDE.md

Guidance for working in this repo. Keep it current when architecture changes.

## What this is

**PRs Inbox for GitHub** — a Chrome MV3 extension that mirrors GitHub's PR inbox
into a popup list and syncs PRs into Chrome **tab groups** (a "Live Folder" for
PRs). Auth is the user's existing github.com **cookie session** — no token/OAuth.

Stack: TypeScript · React + Vite (`@crxjs/vite-plugin`) · Tailwind CSS v4 ·
shadcn/ui (`src/components/ui`) · lucide icons.

## Commands

Node is pinned via `.tool-versions` (nodejs 24.16.0). If `npm`/`node` aren't on
PATH, run through mise: `mise exec node@24.16.0 -- <cmd>`.

```sh
npm run dev         # vite build --watch (crxjs)
npm run build       # production build -> dist/
npm run typecheck   # tsc --noEmit (strict)
npm run test        # vitest (pure logic only)
```

Load the unpacked `dist/` at `chrome://extensions` (developer mode). Tab-group /
tab manipulation can only be verified in a real browser with a logged-in
github.com session — tests don't cover it.

## The private API (load-bearing, undocumented)

```
GET https://github.com/pulls/inbox/queries?filter=<slug>&max_pr_age=<age>
Accept: application/json        (cookie auth, credentials: 'include')
```

- Response shape: `payload.pullsInboxSurfaceContentRoute.{results[], pageInfo, error}`.
  Parsed defensively in `src/lib/github/parseInbox.ts` (falls back to scanning
  `payload` for any `*Route` with `results[]` if the key is renamed).
- `filter` slugs (one request per enabled section): `review-requested`,
  `team-review-requested`, `needs-action`, `waiting-for-review`, `your-drafts`,
  `ready-to-merge`, `merge-queue`. Non-slug values are interpreted as GitHub
  search syntax (unused for now).
- Logged-out signal: 404 JSON `{"error":"Couldn't authenticate you"}` or a
  redirect to `/login`. Rate limit: 429 → honor `Retry-After`.
- It can break without notice. On parse failure the popup keeps the last cache +
  shows an error banner; enable **debug mode** in settings to dump raw responses
  to `chrome.storage.local.debugDump`. A researched fallback (`/pulls/search` +
  embedded SSR JSON) is documented but intentionally **not** implemented.

## Architecture

**storage = source of truth, messages = commands.**

- **Background service worker** (`src/background/`) owns all network, parsing,
  tab sync, badge, and alarms. `index.ts` wires alarms/onMessage/onStartup;
  `poll.ts` runs the fetch→parse→filter→cache→badge→sync pipeline; `tabSync.ts`
  executes tab/group changes; `badge.ts` sets the toolbar count.
- **Popup** (`src/popup/`, React) renders instantly from the `storage.local`
  snapshot, subscribes to `chrome.storage.onChanged`, and sends a `REFRESH`
  message on open. It never fetches directly.
- **Storage areas**: settings in `storage.sync`; the inbox snapshot + debug dump
  in `storage.local`; tab-ownership registry (`SyncState`) in `storage.session`
  (dies with the browser, which matches tab/group id lifetime → self-heals on
  restart). Typed wrappers in `src/storage.ts`.

### Pure logic (`src/lib/`, no `chrome.*`, unit-tested)

- `github/fetch.ts` — request + logged-out/429 detection.
- `github/parseInbox.ts` — defensive parser → `PullRequest[]`.
- `filters.ts` — owner/`owner/repo` allow/block list (applied centrally so popup
  and tab sync see identical data).
- `sortPrs.ts` — up to 2-level in-group sort (repo / created / updated, asc/desc).
- `diff.ts` — `computeTabSyncPlan()` (normal, ownership-respecting) and
  `forceExtraCloses()` (force-align). **Tab-manipulation lives in the worker; the
  decision logic is pure and tested here.**
- `prUrl.ts` · `time.ts` · `settings.ts` (defaults + `mergeSettings` schema-merge).

### Tab sync (`src/background/tabSync.ts`)

- Builds the desired set (enabled sections × filters, deduped by section
  priority, then sorted), validates group ids and owned tabs, applies the diff,
  and reorders tabs within each group.
- **Normal** mode respects the user: never closes a tab it doesn't own; releases
  ownership when the user navigates a tab away or moves it out of the group.
- **Force-align** (button / `forceAlignOnRefresh`) reconciles managed groups to
  exactly the desired set, ignoring user-added/removed tabs.
- Synced tabs are created `active:false` and **left to load** (no `discard`) so
  the tab title shows the real PR title; Chrome auto-discards under memory
  pressure. Caveat: background loading may mark a PR as read on GitHub.

## Conventions

- Strict TS, `@/` → `src` path alias. shadcn primitives in `src/components/ui`.
- **i18n**: all UI strings via `t()` (`src/lib/i18n.ts`) backed by
  `public/_locales/{en,ja}/messages.json`. Default locale en; follows the
  browser UI language. Section labels and tab-group colors are data/aria, not
  translated.
- Theme follows `prefers-color-scheme` (light "paper" + dark "ink", green accent
  `#29bf7e`, blue unread `#4493f8`), defined in `src/popup/styles.css`.
- Treat the private API as hostile: validate every level, degrade softly, never
  crash the popup.

## Gotchas

- Service workers have **no DOMParser** — parse JSON, not HTML.
- Tab group ids don't persist across browser restarts; the session-scoped
  registry + per-run validation handle this. Don't assume in-memory state in the
  worker — rehydrate from storage each run (`navigator.locks` serializes sync).
- `chrome.tabs.move` reordering is best-effort and wrapped in try/catch.
- Adding settings: extend `Settings`, update `defaultSettings`/`mergeSettings`
  (and its test), then the UI in `src/popup/views/SettingsView.tsx`.

The original design doc lives at
`~/.claude/plans/zen-browser-prs-livefolder-google-chrome-rippling-toucan.md`.
