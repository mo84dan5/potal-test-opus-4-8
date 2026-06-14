import { BattleSession } from '../entities/BattleSession';
import { BattleOutcome } from '../values/Battle';

/**
 * 戦闘の画面フェーズ遷移を司るドメインサービス(単一責務・純粋)。
 * 実戦闘(移動・技・命中)は CombatService が担い、本サービスは画面の進行のみ。
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

  /** アクション戦闘の決着を受け取り、勝敗宣言へ進む(実HP計算は CombatService 側) */
  finishFight(s: BattleSession, outcome: BattleOutcome): void {
    if (s.phase !== 'fight') return;
    s.outcome = outcome;
    s.phase = 'result';
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
