import { BattleSession } from '../entities/BattleSession';
import { ENEMY_ATTACK, PLAYER_ATTACK, SUPPORT_BONUS } from '../values/Battle';

/**
 * 戦闘のフェーズ遷移を司るドメインサービス(単一責務・純粋)。
 * three.js / DOM に非依存。GameSession などワールドの状態には一切触れない
 * (=戦闘は副作用ゼロ。終了しても進捗・フラグは元通り)。
 */
export class BattleService {
  /** 開始画面 → キャラ選択へ */
  toSelect(s: BattleSession): void {
    if (s.phase === 'intro') s.phase = 'select';
  }

  /** メインキャラを選ぶ(同じ枠の再タップで解除。サポートと重複する場合はサポートを外す) */
  chooseMain(s: BattleSession, id: string): void {
    if (s.phase !== 'select') return;
    if (s.mainId === id) {
      s.mainId = null;
      return;
    }
    if (s.supportId === id) s.supportId = null;
    s.mainId = id;
  }

  /** サポートキャラを選ぶ(同じ枠の再タップで解除。メインと重複する場合はメインを外す) */
  chooseSupport(s: BattleSession, id: string): void {
    if (s.phase !== 'select') return;
    if (s.supportId === id) {
      s.supportId = null;
      return;
    }
    if (s.mainId === id) s.mainId = null;
    s.supportId = id;
  }

  /** 編成完了なら戦闘へ */
  startFight(s: BattleSession): void {
    if (s.phase === 'select' && s.selectionReady) s.phase = 'fight';
  }

  /**
   * 仮実装のアクション: 1回の攻撃。相手にダメージを与え、生きていれば反撃を受ける。
   * どちらかのHPが0になったら結果フェーズへ。サポート編成時は攻撃力にボーナス。
   */
  attack(s: BattleSession): void {
    if (s.phase !== 'fight') return;
    const damage = PLAYER_ATTACK + (s.supportId ? SUPPORT_BONUS : 0);
    s.enemyHp = Math.max(0, s.enemyHp - damage);
    if (s.enemyHp <= 0) {
      s.outcome = 'win';
      s.phase = 'result';
      return;
    }
    s.playerHp = Math.max(0, s.playerHp - ENEMY_ATTACK);
    if (s.playerHp <= 0) {
      s.outcome = 'lose';
      s.phase = 'result';
    }
  }

  /** 勝敗宣言 → 終了画面へ */
  toOutro(s: BattleSession): void {
    if (s.phase === 'result') s.phase = 'outro';
  }

  /** 戦闘が終わって元の世界へ戻れる状態か(呼び出し側が activeBattle を解除する) */
  isFinished(s: BattleSession): boolean {
    return s.phase === 'outro';
  }
}
