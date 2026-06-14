/**
 * 戦闘イベントのデータ定義(直列化可能な値)。three.js/DOM に非依存。
 * 戦闘は副作用ゼロの独立ドメインで、ワールドの進行状態(flags/completedEvents)には触れない。
 */

/** 戦闘の画面フェーズ。intro→select→fight→result→outro の順に遷移する */
export type BattlePhase =
  | 'intro' // 戦闘開始画面(相手の画像・意気込み・地形)
  | 'select' // キャラ選択(9体からメイン+サポート)
  | 'fight' // 戦闘(1対1アクション・仮実装)
  | 'result' // 勝敗宣言
  | 'outro'; // 終了画面(相手の一言)→ 元の世界へ

/** 戦闘結果(主人公側から見た勝敗) */
export type BattleOutcome = 'win' | 'lose';

/** 選択可能なキャラクター(メイン/サポート候補) */
export interface BattleCharacter {
  readonly id: string;
  readonly name: string;
  /** アバター代わりの表示色(画像が無い間のプレースホルダ) */
  readonly color: number;
}

/** 対戦相手の情報(開始画面・終了画面で使う) */
export interface Opponent {
  readonly name: string;
  /** アバター代わりの表示色(キャラ画像のプレースホルダ) */
  readonly color: number;
  /** 開始画面の意気込みの一言 */
  readonly comment: string;
  /** 戦う地形の名前(開始画面に表示) */
  readonly terrainName: string;
  /** 終了画面: 主人公が勝ったときの相手の一言 */
  readonly winComment: string;
  /** 終了画面: 主人公が負けたときの相手の一言 */
  readonly loseComment: string;
}

/** 戦闘定義。NpcSpec.battleId から参照する */
export interface BattleDefinition {
  readonly id: string;
  readonly opponent: Opponent;
  /** 選択できるキャラ(9体) */
  readonly roster: readonly BattleCharacter[];
}

/** 戦闘開始時のHP(主人公側・相手側とも) */
export const BATTLE_MAX_HP = 100;
/** 仮実装: 1回の攻撃で相手に与えるダメージ */
export const PLAYER_ATTACK = 16;
/** 仮実装: 相手の反撃で主人公が受けるダメージ */
export const ENEMY_ATTACK = 12;
/** サポートキャラを編成しているときの攻撃力ボーナス */
export const SUPPORT_BONUS = 6;
