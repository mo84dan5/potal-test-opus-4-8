import { describe, expect, it } from 'vitest';
import { BattleSession } from '../entities/BattleSession';
import {
  BattleDefinition,
  BATTLE_MAX_HP,
  ENEMY_ATTACK,
  PLAYER_ATTACK,
  SUPPORT_BONUS,
} from '../values/Battle';
import { BattleService } from './BattleService';

const def: BattleDefinition = {
  id: 'duel',
  opponent: {
    name: '敵',
    color: 0xff0000,
    comment: 'いくぞ',
    terrainName: '草原',
    winComment: 'まいった',
    loseComment: 'よわいな',
  },
  roster: [
    { id: 'a', name: 'A', color: 1 },
    { id: 'b', name: 'B', color: 2 },
    { id: 'c', name: 'C', color: 3 },
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

  it('攻撃で相手HPが減り、相手の反撃で自分のHPも減る', () => {
    const { s, svc } = make();
    s.phase = 'fight';
    svc.attack(s);
    expect(s.enemyHp).toBe(BATTLE_MAX_HP - PLAYER_ATTACK);
    expect(s.playerHp).toBe(BATTLE_MAX_HP - ENEMY_ATTACK);
  });

  it('サポート編成時は攻撃力にボーナスが乗る', () => {
    const { s, svc } = make();
    s.phase = 'fight';
    s.supportId = 'b';
    svc.attack(s);
    expect(s.enemyHp).toBe(BATTLE_MAX_HP - (PLAYER_ATTACK + SUPPORT_BONUS));
  });

  it('相手HPが0で勝利、結果フェーズへ(反撃は受けない)', () => {
    const { s, svc } = make();
    s.phase = 'fight';
    s.enemyHp = 1;
    svc.attack(s);
    expect(s.enemyHp).toBe(0);
    expect(s.outcome).toBe('win');
    expect(s.phase).toBe('result');
    expect(s.playerHp).toBe(BATTLE_MAX_HP); // 勝った瞬間は反撃されない
  });

  it('自分HPが0で敗北、結果フェーズへ', () => {
    const { s, svc } = make();
    s.phase = 'fight';
    s.enemyHp = BATTLE_MAX_HP; // 倒しきれない
    s.playerHp = 1;
    svc.attack(s);
    expect(s.outcome).toBe('lose');
    expect(s.phase).toBe('result');
  });

  it('result→outro→終了(isFinished)', () => {
    const { s, svc } = make();
    s.phase = 'result';
    s.outcome = 'win';
    svc.toOutro(s);
    expect(s.phase).toBe('outro');
    expect(svc.isFinished(s)).toBe(true);
  });

  it('fight 以外では攻撃しても何も起きない', () => {
    const { s, svc } = make();
    svc.attack(s); // intro のまま
    expect(s.enemyHp).toBe(BATTLE_MAX_HP);
    expect(s.playerHp).toBe(BATTLE_MAX_HP);
  });
});
