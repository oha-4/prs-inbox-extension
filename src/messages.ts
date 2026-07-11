import type { Msg } from './types';

export async function sendMessage<T = unknown>(msg: Msg): Promise<T | undefined> {
  try {
    const res = (await chrome.runtime.sendMessage(msg)) as T;
    // background ハンドラが reject を握り潰して返す失敗応答。UI表示はしないが
    // 握り潰しっぱなしにせずログには残す（スピナー自体は promise 解決で止まる）。
    if (
      res !== null &&
      typeof res === 'object' &&
      'ok' in res &&
      (res as { ok: unknown }).ok === false
    ) {
      console.warn('[prs-inbox] background rejected message', msg.type, res);
    }
    return res;
  } catch {
    // SWが起動直後などで受け取れなかった場合は無視（次のalarmで回復する）
    return undefined;
  }
}
