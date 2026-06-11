// nav / footer など Base.astro が使う共通ラベル。ページ本文は各ロケールの .astro に直書きする。
export const ui = {
  en: {
    siteName: 'PRs Inbox for GitHub',
    description:
      'A Chrome extension that mirrors your GitHub PR inbox into a popup and live tab groups.',
    nav: { github: 'GitHub', langSwitch: '日本語', langSwitchHref: 'ja' },
    footer: {
      terms: 'Terms of Service',
      privacy: 'Privacy Policy',
      license: 'MIT License',
      disclaimer:
        'An unofficial open-source project. Not affiliated with or endorsed by GitHub, Inc.',
    },
  },
  ja: {
    siteName: 'PRs Inbox for GitHub',
    description: 'GitHubのPR InboxをポップアップとChromeタブグループへ自動同期する拡張機能。',
    nav: { github: 'GitHub', langSwitch: 'English', langSwitchHref: 'en' },
    footer: {
      terms: '利用規約',
      privacy: 'プライバシーポリシー',
      license: 'MITライセンス',
      disclaimer: '非公式のオープンソースプロジェクトです。GitHub, Inc. とは無関係です。',
    },
  },
} as const;

export type Lang = keyof typeof ui;

export const REPO_URL = 'https://github.com/oha-4/prs-inbox-extension';
// TODO: Chrome Web Store 掲載後に実URLへ差し替える
export const STORE_URL = '';
