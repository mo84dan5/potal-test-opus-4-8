import { BattleOutcome } from '../../domain/values/Battle';
import { CombatFighter } from '../../domain/values/Combat';

/**
 * fight フェーズのアクション戦闘ビュー(描画+入力)の契約。
 * 2D/3D など実装を差し替え可能にするためのポート(DIP)。
 * BattleOverlayAdapter はこの契約だけに依存し、具象(three.js 等)を知らない。
 */
export interface BattleArenaView {
  /** host に戦闘画面を構築してループ開始。決着で onEnd(outcome) を呼ぶ */
  start(
    host: HTMLElement,
    player: CombatFighter,
    enemy: CombatFighter,
    hasSupport: boolean,
    onEnd: (outcome: BattleOutcome) => void,
  ): void;
  /** 後片付け(ループ停止・リソース解放) */
  stop(): void;
}
