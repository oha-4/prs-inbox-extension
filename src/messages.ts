import type { Msg } from './types';

export async function sendMessage<T = unknown>(msg: Msg): Promise<T | undefined> {
  try {
    return (await chrome.runtime.sendMessage(msg)) as T;
  } catch {
    // SWが起動直後などで受け取れなかった場合は無視（次のalarmで回復する）
    return undefined;
  }
}
