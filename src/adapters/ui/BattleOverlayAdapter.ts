import { BattleSession } from '../../domain/entities/BattleSession';
import { BattleService } from '../../domain/services/BattleService';
import { BattleArenaAdapter } from './BattleArenaAdapter';

/** 0xRRGGBB を CSS の #rrggbb に変換 */
function colorCss(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

/**
 * 戦闘画面のDOM描画(アダプタ)。フェーズに応じた画面を描き、
 * ボタン操作で BattleService(純粋ドメイン)を駆動して再描画する。
 * three.js/DOM 依存をここに閉じ込め、ドメインは画面表現を知らない。
 * 戦闘終了(outro→もどる)で onExit を呼ぶ。ワールド状態には触れない。
 */
export class BattleOverlayAdapter {
  private session: BattleSession | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly service: BattleService,
    /** fight フェーズのアクション戦闘を担うアリーナ(DIP) */
    private readonly arena: BattleArenaAdapter,
    /** 戦闘を閉じて元の世界へ戻すコールバック(activeBattle の解除はここで行う) */
    private readonly onExit: () => void,
  ) {}

  /** 戦闘を開始(オーバーレイ表示+描画) */
  open(session: BattleSession): void {
    this.session = session;
    this.root.classList.add('visible');
    this.render();
  }

  private close(): void {
    this.root.classList.remove('visible');
    this.session = null;
    this.onExit();
  }

  /** 現在のフェーズに応じて画面を組み立てる */
  private render(): void {
    const s = this.session;
    if (!s) return;
    switch (s.phase) {
      case 'intro':
        this.renderIntro(s);
        break;
      case 'select':
        this.renderSelect(s);
        break;
      case 'fight':
        this.renderFight(s);
        break;
      case 'result':
        this.renderResult(s);
        break;
      case 'outro':
        this.renderOutro(s);
        break;
    }
  }

  private avatar(name: string, color: number, size = 96): string {
    const initial = name.slice(0, 1);
    return `<div class="bt-avatar" style="width:${size}px;height:${size}px;background:${colorCss(
      color,
    )}">${initial}</div>`;
  }

  private setCard(html: string): HTMLElement {
    this.root.innerHTML = `<div class="bt-card">${html}</div>`;
    return this.root.querySelector('.bt-card') as HTMLElement;
  }

  private button(card: HTMLElement, selector: string, handler: () => void): void {
    const btn = card.querySelector(selector) as HTMLButtonElement | null;
    btn?.addEventListener('click', handler);
  }

  // --- 戦闘開始画面(相手の画像・意気込み・地形)---
  private renderIntro(s: BattleSession): void {
    const o = s.def.opponent;
    const card = this.setCard(`
      <div class="bt-phase">⚔️ 戦闘開始</div>
      ${this.avatar(o.name, o.color, 120)}
      <div class="bt-name">${o.name}</div>
      <div class="bt-comment">「${o.comment}」</div>
      <div class="bt-terrain">🗺️ 戦場: ${o.terrainName}</div>
      <button class="bt-primary" type="button">戦う</button>`);
    this.button(card, '.bt-primary', () => {
      this.service.toSelect(s);
      this.render();
    });
  }

  // --- キャラ選択画面(9体からメイン+サポート)---
  private renderSelect(s: BattleSession): void {
    const grid = s.def.roster
      .map((c) => {
        const role = c.id === s.mainId ? 'main' : c.id === s.supportId ? 'support' : '';
        const tag = role === 'main' ? 'メイン' : role === 'support' ? 'サポート' : '';
        return `<button class="bt-char ${role}" type="button" data-id="${c.id}">
            <span class="bt-chip" style="background:${colorCss(c.color)}"></span>
            <span class="bt-char-name">${c.name}</span>
            ${tag ? `<span class="bt-role">${tag}</span>` : ''}
          </button>`;
      })
      .join('');
    const main = s.character(s.mainId);
    const support = s.character(s.supportId);
    const card = this.setCard(`
      <div class="bt-phase">キャラ選択</div>
      <div class="bt-hint">9体からメインとサポートを選ぼう(タップで切替)</div>
      <div class="bt-grid">${grid}</div>
      <div class="bt-picks">メイン: ${main ? main.name : '—'} / サポート: ${
        support ? support.name : '—'
      }</div>
      <button class="bt-primary" type="button" ${s.selectionReady ? '' : 'disabled'}>この編成で戦う</button>`);
    card.querySelectorAll('.bt-char').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.id as string;
        // 未選択ならメイン→サポートの順に埋め、選択済みの枠をタップで解除
        if (id === s.mainId) this.service.chooseMain(s, id);
        else if (id === s.supportId) this.service.chooseSupport(s, id);
        else if (s.mainId === null) this.service.chooseMain(s, id);
        else this.service.chooseSupport(s, id);
        this.render();
      });
    });
    this.button(card, '.bt-primary', () => {
      this.service.startFight(s);
      this.render();
    });
  }

  // --- 戦闘画面(1対1アクションバトル。アリーナへ委譲)---
  private renderFight(s: BattleSession): void {
    const main = s.character(s.mainId);
    if (!main) {
      // 安全策: メイン未選択ならキャラ選択へ戻す
      s.phase = 'select';
      this.render();
      return;
    }
    // アリーナ用にオーバーレイ全面をホストにする
    this.root.innerHTML = '<div class="bt-arena-host"></div>';
    const host = this.root.querySelector('.bt-arena-host') as HTMLElement;
    this.arena.start(host, main, s.def.opponent, s.supportId !== null, (outcome) => {
      this.service.finishFight(s, outcome);
      this.render();
    });
  }

  // --- 勝利・敗北宣言 ---
  private renderResult(s: BattleSession): void {
    const win = s.outcome === 'win';
    const card = this.setCard(`
      <div class="bt-result ${win ? 'win' : 'lose'}">
        <div class="bt-result-emoji">${win ? '🎉' : '💧'}</div>
        <div class="bt-result-title">${win ? 'やったー! 勝利!' : '敗北… どんより'}</div>
        <div class="bt-result-sub">${
          win ? 'みごとに打ち勝った!' : 'また挑戦しよう…'
        }</div>
      </div>
      <button class="bt-primary" type="button">つぎへ</button>`);
    this.button(card, '.bt-primary', () => {
      this.service.toOutro(s);
      this.render();
    });
  }

  // --- 戦闘終了画面(相手の一言)→ 元の世界へ ---
  private renderOutro(s: BattleSession): void {
    const o = s.def.opponent;
    const comment = s.outcome === 'win' ? o.winComment : o.loseComment;
    const card = this.setCard(`
      <div class="bt-phase">戦闘終了</div>
      ${this.avatar(o.name, o.color, 96)}
      <div class="bt-name">${o.name}</div>
      <div class="bt-comment">「${comment}」</div>
      <div class="bt-hint">元の世界に戻ります(進行状況はそのまま)</div>
      <button class="bt-primary" type="button">もどる</button>`);
    this.button(card, '.bt-primary', () => this.close());
  }
}
