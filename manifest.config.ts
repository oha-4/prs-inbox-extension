import { defineManifest } from '@crxjs/vite-plugin';
import packageJson from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: '__MSG_extName__',
  // 単一ソース: package.json。リリースは `npm version <bump>` → タグ push（release.yml が整合を検証）
  version: packageJson.version,
  description: '__MSG_extDescription__',
  default_locale: 'en',
  icons: {
    16: 'icons/icon16.png',
    32: 'icons/icon32.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_title: '__MSG_extName__',
  },
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  permissions: ['tabs', 'tabGroups', 'alarms', 'storage'],
  host_permissions: ['https://github.com/*'],
});
