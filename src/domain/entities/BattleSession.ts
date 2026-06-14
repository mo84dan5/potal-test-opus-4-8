import { BattleDefinition, BattleOutcome, BattlePhase } from '../values/Battle';

/**
 * 進行中の戦闘の状態(フェーズ・編成・HP・結果)。
 * 遷移ロジックは BattleService が担う(状態と振る舞いの分離)。
 * ワールドの進行状態には一切関与しない=戦闘は副作用ゼロ。
 */
export class BattleSession {
  phase: BattlePhase = 'intro';
  /** 選んだメインキャラID */
  mainId: string | null = null;
  /** 選んだサポートキャラID */
  supportId: string | null = null;
  /** 決着した結果(未決着なら null)。実HPはアクション戦闘(CombatArena)が持つ */
  outcome: BattleOutcome | null = null;

  constructor(public readonly def: BattleDefinition) {}

  /** メイン+サポートの両方が選ばれているか */
  get selectionReady(): boolean {
    return this.mainId !== null && this.supportId !== null;
  }

  /** IDからキャラを引く(表示用) */
  character(id: string | null): BattleDefinition['roster'][number] | null {
    if (id === null) return null;
    return this.def.roster.find((c) => c.id === id) ?? null;
  }
}
