// @ts-check
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

// GitHub Pages (project page): https://oha-4.github.io/prs-inbox-extension/
// カスタムドメインへ移す場合は site/base を変えて public/CNAME を置くだけで済むよう、
// ページ側では base を決め打ちせず astro:i18n のヘルパーと BASE_URL を使うこと。
export default defineConfig({
  site: 'https://oha-4.github.io',
  base: '/prs-inbox-extension',
  trailingSlash: 'always',
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'ja'],
    routing: { prefixDefaultLocale: false },
  },
  vite: { plugins: [tailwindcss()] },
});
