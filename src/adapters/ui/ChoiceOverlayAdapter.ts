import { ChoicePrompt } from '../../domain/values/Choice';

/**
 * 汎用の選択肢オーバーレイ(アダプタ)。
 * ドメインの `ChoicePrompt` を DOM に描画し、選ばれた `value` を onChoose で返すだけ。
 * 「選んだら何をするか」は呼び出し側(アプリ層)が決める=ドメイン/UIは振る舞いを知らない。
 */
export class ChoiceOverlayAdapter {
  private readonly questionEl: HTMLElement;
  private readonly optionsEl: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly onChoose: (value: string) => void,
  ) {
    this.root.innerHTML = `
      <div class="choice-card">
        <div class="choice-question"></div>
        <div class="choice-options"></div>
      </div>`;
    this.questionEl = this.root.querySelector('.choice-question') as HTMLElement;
    this.optionsEl = this.root.querySelector('.choice-options') as HTMLElement;
  }

  open(prompt: ChoicePrompt): void {
    this.questionEl.textContent = prompt.question;
    this.optionsEl.innerHTML = '';
    for (const opt of prompt.options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = opt.label;
      btn.addEventListener('click', () => this.onChoose(opt.value));
      this.optionsEl.appendChild(btn);
    }
    this.root.classList.add('visible');
  }

  close(): void {
    this.root.classList.remove('visible');
  }
}
