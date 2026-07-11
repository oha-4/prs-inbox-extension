/**
 * debounce付きテキスト入力の draft を外部からの value 変化に追従させるか判定する純ロジック。
 *
 * popup と options ページは同じ SettingsView を共有し、`chrome.storage.onChanged`
 * 経由で settings が差し替わる。片方で編集するともう片方の draft が古いまま残り、
 * blur 時に古い値で上書きし得る（issue #75）。外部で value が変化し、かつ入力要素が
 * 非フォーカスのときのみ draft をリセットして追従させる（入力中の draft は破壊しない）。
 */
export function shouldSyncDraft(params: {
  /** 前回受け取った外部 value */
  prevValue: string;
  /** 今回の外部 value */
  nextValue: string;
  /** 入力要素が現在フォーカスされているか */
  isFocused: boolean;
}): boolean {
  return params.nextValue !== params.prevValue && !params.isFocused;
}
