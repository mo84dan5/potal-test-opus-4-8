import { describe, expect, it } from 'vitest';
import { DialogueSession } from './DialogueSession';

describe('DialogueSession', () => {
  it('最初のコメントから始まり、advance で次へ進む', () => {
    const d = new DialogueSession(['一行目', '二行目', '三行目']);
    expect(d.currentLine).toBe('一行目');
    expect(d.advance()).toBe(true);
    expect(d.currentLine).toBe('二行目');
    expect(d.advance()).toBe(true);
    expect(d.currentLine).toBe('三行目');
  });

  it('最後のコメントで advance すると false(=閉じる)', () => {
    const d = new DialogueSession(['一行目', '二行目']);
    d.advance();
    expect(d.isLastLine).toBe(true);
    expect(d.advance()).toBe(false);
  });

  it('1行だけの場合は最初の advance で閉じる', () => {
    const d = new DialogueSession(['これは石だ。']);
    expect(d.advance()).toBe(false);
  });

  it('空のコメント列は作れない', () => {
    expect(() => new DialogueSession([])).toThrow();
  });
});
