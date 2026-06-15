import { describe, expect, it } from 'vitest';
import { BattleSession } from '../entities/BattleSession';
import { BattleDefinition } from '../values/Battle';
import { Technique } from '../values/Combat';
import { BattleService } from './BattleService';

const trio: readonly [Technique, Technique, Technique] = [
  { name: 't0', range: 2, damage: 5, windup: 0.3, recovery: 0.3, cooldown: 1 },
  { name: 't1', range: 2, damage: 5, windup: 0.3, recovery: 0.3, cooldown: 1 },
  { name: 't2', range: 2, damage: 5, windup: 0.3, recovery: 0.3, cooldown: 1 },
];

const def: BattleDefinition = {
  id: 'duel',
  opponent: {
    name: '敵',
    color: 0xff0000,
    comment: 'いくぞ',
    terrainName: '草原',
    winComment: 'まいった',
    loseComment: 'よわいな',
    techniques: trio,
  },
  roster: [
    { id: 'a', name: 'A', color: 1, techniques: trio },
    { id: 'b', name: 'B', color: 2, techniques: trio },
    { id: 'c', name: 'C', color: 3, techniques: trio },
  ],
};

const make = (): { s: BattleSession; svc: BattleService } => ({
  s: new BattleSession(def),
  svc: new BattleService(),
});

describe('BattleService', () => {
  it('intro から select へ進む', () => {
    const { s, svc } = make();
    expect(s.phase).toBe('intro');
    svc.toSelect(s);
    expect(s.phase).toBe('select');
  });

  it('メイン/サポートを選び、編成完了で戦闘へ', () => {
    const { s, svc } = make();
    svc.toSelect(s);
    svc.startFight(s);
    expect(s.phase).toBe('select'); // 未編成では始まらない
    svc.chooseMain(s, 'a');
    svc.chooseSupport(s, 'b');
    expect(s.selectionReady).toBe(true);
    svc.startFight(s);
    expect(s.phase).toBe('fight');
  });

  it('メインとサポートに同じキャラは選べない(片方が外れる)', () => {
    const { s, svc } = make();
    svc.toSelect(s);
    svc.chooseMain(s, 'a');
    svc.chooseSupport(s, 'a'); // メインと同じ → メインが外れてサポートに
    expect(s.mainId).toBeNull();
    expect(s.supportId).toBe('a');
  });

  it('同じ枠の再選択で解除できる', () => {
    const { s, svc } = make();
    svc.toSelect(s);
    svc.chooseMain(s, 'a');
    svc.chooseMain(s, 'a');
    expect(s.mainId).toBeNull();
  });

  it('finishFight: アクション戦闘の決着で結果フェーズへ進む', () => {
    const { s, svc } = make();
    s.phase = 'fight';
    svc.finishFight(s, 'win');
    expect(s.outcome).toBe('win');
    expect(s.phase).toBe('result');
  });

  it('finishFight: fight 以外では何も起きない', () => {
    const { s, svc } = make();
    svc.finishFight(s, 'lose'); // intro のまま
    expect(s.outcome).toBeNull();
    expect(s.phase).toBe('intro');
  });

  it('result→outro→終了(isFinished)', () => {
    const { s, svc } = make();
    s.phase = 'result';
    s.outcome = 'win';
    svc.toOutro(s);
    expect(s.phase).toBe('outro');
    expect(svc.isFinished(s)).toBe(true);
  });
});
