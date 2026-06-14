import { BattleOutcome } from '../values/Battle';
import { CombatFighter, Technique } from '../values/Combat';

/** 行動状態。idle のみ移動・技の発動が可能。dash 中は無敵(ジャスト回避) */
export type ActorState = 'idle' | 'windup' | 'recovery' | 'dash';

/** 戦闘アクター(主人公側/相手側)。フィールド上の位置とHP・行動状態を持つ */
export class CombatActor {
  /** フィールド座標 [m] */
  x = 0;
  z = 0;
  hp: number;
  readonly maxHp: number;
  /** 相手の方位(描画・離脱方向に使う。ラジアン) */
  facing = 0;
  state: ActorState = 'idle';
  /** 現在状態の残り時間 [s] */
  timer = 0;
  /** windup/recovery 中の技。null なら技以外 */
  tech: Technique | null = null;
  /** ダッシュ中の離脱方向(単位ベクトル) */
  dashX = 0;
  dashZ = 0;

  constructor(
    public readonly fighter: CombatFighter,
    hp: number,
  ) {
    this.hp = hp;
    this.maxHp = hp;
  }

  /** ダッシュ中は無敵(この瞬間に被弾しなければジャスト回避) */
  get invulnerable(): boolean {
    return this.state === 'dash';
  }

  get alive(): boolean {
    return this.hp > 0;
  }
}

/**
 * 1対1のアクション戦闘フィールド(純粋な状態)。
 * 進行(移動・技・命中・回避判定)は CombatService が司る。three.js/DOM 非依存。
 * ワールドの進行状態(flags/進捗)には一切関与しない=戦闘は副作用ゼロ。
 */
export class CombatArena {
  outcome: BattleOutcome | null = null;
  /** 直近に起きたことの表示用メモ(例: 'ジャスト回避!' / 技名)。描画のヒント */
  lastEvent: string | null = null;

  constructor(
    public readonly player: CombatActor,
    public readonly enemy: CombatActor,
  ) {}

  /** 2者の水平距離 [m] */
  get distance(): number {
    return Math.hypot(this.player.x - this.enemy.x, this.player.z - this.enemy.z);
  }
}
