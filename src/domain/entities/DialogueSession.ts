/** メッセージウィンドウのコメント送りの進行状態 */
export class DialogueSession {
  private index = 0;

  constructor(public readonly lines: readonly string[]) {
    if (lines.length === 0) {
      throw new Error('dialogue must have at least one line');
    }
  }

  get currentLine(): string {
    return this.lines[this.index];
  }

  get isLastLine(): boolean {
    return this.index >= this.lines.length - 1;
  }

  /** 次のコメントへ進む。続きがあれば true、最後まで表示し終えていれば false(=閉じる) */
  advance(): boolean {
    if (this.isLastLine) return false;
    this.index += 1;
    return true;
  }
}
