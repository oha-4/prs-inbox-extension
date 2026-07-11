import { describe, expect, it } from 'vitest';
import { shouldSyncDraft } from '../src/lib/debouncedDraft';

describe('shouldSyncDraft', () => {
  it('外部 value が変化し非フォーカスなら追従する', () => {
    expect(shouldSyncDraft({ prevValue: 'a', nextValue: 'b', isFocused: false })).toBe(true);
  });

  it('フォーカス中は draft を破壊しない', () => {
    expect(shouldSyncDraft({ prevValue: 'a', nextValue: 'b', isFocused: true })).toBe(false);
  });

  it('value が変わっていなければ追従しない（非フォーカスでも）', () => {
    expect(shouldSyncDraft({ prevValue: 'a', nextValue: 'a', isFocused: false })).toBe(false);
  });

  it('value が変わっていなければ追従しない（フォーカス中でも）', () => {
    expect(shouldSyncDraft({ prevValue: 'a', nextValue: 'a', isFocused: true })).toBe(false);
  });

  it('空文字への外部変更にも追従する', () => {
    expect(shouldSyncDraft({ prevValue: 'x', nextValue: '', isFocused: false })).toBe(true);
  });
});
