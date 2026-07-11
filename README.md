# PRs Inbox for GitHub

Zen Browserの「Live Folder」風に、GitHubの [PR Inbox](https://github.com/pulls/inbox) をChromeのタブグループへ自動同期する拡張機能。ポップアップではInboxのコンパクトなリスト表示も提供する。

**[Chrome Web Store からインストール](https://chromewebstore.google.com/detail/prs-inbox-for-github/fmghddbkgblnhhgckmkcefehnmooojjf)**

サービスサイト（利用規約・プライバシーポリシー）: <https://oha-4.github.io/prs-inbox-extension/>（ソースは `site/`）

## 機能

- **ポップアップ**: Inboxの全セクション（Needs your review / Your drafts / Waiting for review など）をコンパクトに一覧表示。未読は太字、クリックでPRを開く
- **タブグループ同期**: 名前を付けた同期グループにセクションを割り当てると、そのPRを一定間隔（デフォルト5分）でタブグループに同期
  - 1つのグループに複数セクションをまとめられる。グループの色はChromeが割り当て、手動での変更もそのまま維持される
  - Inboxから消えたPR（マージ等）のタブは自動クローズ（設定でオフ可）
  - ユーザーが操作したタブ（別ページへ移動・グループ外へ移動）には触らない
- **フィルタ**: `owner` / `owner/repo` 単位の包含・除外リスト（ポップアップ表示とタブ同期の両方に適用）
- **バッジ**: 「Needs your review」の件数をツールバーアイコンに表示
- **多言語対応**: 日本語・英語（`chrome.i18n`、ブラウザのUI言語に追従。リソースは `public/_locales/`）
- **キーボードショートカット**: ポップアップを開く／タブ同期を今すぐ実行する2つのコマンドを用意。キーは既定で未割り当てなので、`chrome://extensions/shortcuts` から任意のキーを割り当てて使う

UIは React + Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com/)（`src/components/ui/`）+ [lucide](https://lucide.dev/) アイコンで構築。ライト/ダークテーマはブラウザ設定に自動追従する。

## インストール

[Chrome Web Store](https://chromewebstore.google.com/detail/prs-inbox-for-github/fmghddbkgblnhhgckmkcefehnmooojjf) から追加する。

github.com にログインしたブラウザセッションをそのまま使うため、トークン設定は不要。

### 開発版（手動ビルド）

Nodeのバージョンは `.tool-versions`（mise / asdf）で管理している。

```sh
npm install
npm run build
```

Chromeで `chrome://extensions` → デベロッパーモードON → 「パッケージ化されていない拡張機能を読み込む」→ `dist/` を選択。

## 開発

```sh
npm run dev        # vite build --watch 相当（crxjs）
npm run typecheck
npm run test       # vitest（パーサ・フィルタ・タブ同期diffの純粋ロジック）
```

## ⚠️ 非公開APIについて

この拡張は GitHub の新PRダッシュボードが内部的に使う**非公開エンドポイント**
`GET https://github.com/pulls/inbox/queries?filter=<slug>&max_pr_age=<age>` をCookie認証で叩いている。
公開APIではないため、GitHub側の変更で**予告なく壊れる可能性がある**。

- 壊れた場合、ポップアップにエラーバナーが出る（既存キャッシュは保持）
- 設定でデバッグモードを有効にすると、パース失敗時の生レスポンスが `chrome.storage.local` の `debugDump` に保存される
- 代替手段（`/pulls/search?q=` ＋ `embeddedData` スクレイピング）の調査記録は実装プラン参照

既知の `filter` スラッグ: `review-requested`, `team-review-requested`, `needs-action`,
`waiting-for-review`, `your-drafts`, `ready-to-merge`, `merge-queue`。
未知の値はGitHub検索構文として解釈される（例: `filter=repo:owner/name is:open`）。
