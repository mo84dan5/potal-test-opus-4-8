import { describe, expect, it } from 'vitest';
import { CombatActor, CombatArena } from '../entities/CombatArena';
import {
  CombatFighter,
  CombatInput,
  COMBAT_MAX_HP,
  DASH_TIME,
  IDLE_INPUT,
  Technique,
} from '../values/Combat';
import { CombatService, EnemyController } from './CombatService';

const tech = (over: Partial<Technique> = {}): Technique => ({
  name: '技',
  range: 2,
  damage: 20,
  windup: 0.3,
  recovery: 0.3,
  cooldown: 1.0,
  ...over,
});

const fighter = (name: string): CombatFighter => ({
  name,
  color: 0x123456,
  techniques: [tech(), tech(), tech()],
});

/** 何もしない敵(プレイヤー挙動を検証しやすくする) */
const idleEnemy: EnemyController = { decide: () => IDLE_INPUT };

const makeArena = (): CombatArena => {
  const player = new CombatActor(fighter('みかた'), COMBAT_MAX_HP);
  const enemy = new CombatActor(fighter('あいて'), COMBAT_MAX_HP);
  player.x = 0;
  player.z = 1; // 距離1(技 range2 の射程内)
  enemy.x = 0;
  enemy.z = -1;
  return new CombatArena(player, enemy);
};

const flick = (action: CombatInput['action']): CombatInput => ({ strafe: 0, forward: 0, action });

describe('CombatService', () => {
  it('技は発生(windup)後に命中し、相手のHPを削る', () => {
    const arena = makeArena();
    const svc = new CombatService(idleEnemy);
    svc.tick(arena, 0.016, flick(0)); // 技0発動 → windup へ
    expect(arena.player.state).toBe('windup');
    expect(arena.enemy.hp).toBe(COMBAT_MAX_HP); // まだ当たっていない
    // windup(0.3s)を経過させ命中(その後 recovery 0.3s)。25tick=0.4s は recovery 中
    for (let i = 0; i < 25; i++) svc.tick(arena, 0.016, IDLE_INPUT);
    expect(arena.enemy.hp).toBeLessThan(COMBAT_MAX_HP);
    expect(arena.player.state).toBe('recovery');
  });

  it('射程外では当たらない', () => {
    const arena = makeArena();
    arena.player.z = 6; // 遠い(距離7 > range2)
    arena.enemy.z = -1;
    const svc = new CombatService(idleEnemy);
    svc.tick(arena, 0.016, flick(0));
    for (let i = 0; i < 40; i++) svc.tick(arena, 0.016, IDLE_INPUT);
    expect(arena.enemy.hp).toBe(COMBAT_MAX_HP);
  });

  it('ダッシュ中(無敵)に相手の技が発生するとジャスト回避(ノーダメージ)', () => {
    // 敵の windup(0.2s) < ダッシュ無敵(DASH_TIME) になるよう敵の技を短くする
    const player = new CombatActor(fighter('みかた'), COMBAT_MAX_HP);
    // 射程を広く取り「距離で外れた」ではなく「無敵で回避」を検証する
    const longReach = tech({ windup: 0.2, range: 12 });
    const enemyFighter: CombatFighter = {
      name: 'あいて',
      color: 1,
      techniques: [longReach, longReach, longReach],
    };
    const enemy = new CombatActor(enemyFighter, COMBAT_MAX_HP);
    player.x = 0;
    player.z = 1;
    enemy.x = 0;
    enemy.z = -1;
    const arena = new CombatArena(player, enemy);
    const attackingEnemy: EnemyController = { decide: () => flick(0) };
    const svc = new CombatService(attackingEnemy);

    // 敵が技を開始(windup 0.2)。プレイヤーは同時にダッシュ(無敵)に入る
    svc.tick(arena, 0.016, flick('dash'));
    expect(arena.player.invulnerable).toBe(true);
    expect(arena.enemy.state).toBe('windup');
    expect(DASH_TIME).toBeGreaterThan(0.2); // 命中時(0.2s)もまだダッシュ中
    for (let i = 0; i < 16; i++) svc.tick(arena, 0.016, IDLE_INPUT);
    expect(arena.player.hp).toBe(COMBAT_MAX_HP); // 回避成功(ノーダメージ)
    expect(arena.lastEvent).toBe('ジャスト回避!');
  });

  it('ダッシュは相手から離れる方向へ動く', () => {
    const arena = makeArena();
    const svc = new CombatService(idleEnemy);
    const before = arena.distance;
    svc.tick(arena, 0.05, flick('dash'));
    svc.tick(arena, 0.05, IDLE_INPUT);
    expect(arena.distance).toBeGreaterThan(before);
  });

  it('相手のHPが0になると勝利', () => {
    const arena = makeArena();
    arena.enemy.hp = 5; // 一撃で倒れる
    const svc = new CombatService(idleEnemy);
    svc.tick(arena, 0.016, flick(0));
    for (let i = 0; i < 40; i++) svc.tick(arena, 0.016, IDLE_INPUT);
    expect(arena.enemy.hp).toBe(0);
    expect(arena.outcome).toBe('win');
  });

  it('決着後は tick しても状態が進まない', () => {
    const arena = makeArena();
    arena.outcome = 'win';
    const svc = new CombatService(idleEnemy);
    svc.tick(arena, 0.5, flick(0));
    expect(arena.player.state).toBe('idle');
  });

  it('技にはクールダウンがあり、明けるまで再使用できない', () => {
    const arena = makeArena();
    const svc = new CombatService(idleEnemy);
    svc.tick(arena, 0.016, flick(0)); // 1発目
    expect(arena.player.techCd[0]).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) svc.tick(arena, 0.016, IDLE_INPUT); // 技完了(0.64s)
    expect(arena.player.state).toBe('idle');
    expect(arena.player.techCd[0]).toBeGreaterThan(0); // まだクールダウン中
    svc.tick(arena, 0.016, flick(0)); // 2発目を試す → 出ない
    expect(arena.player.state).toBe('idle');
    for (let i = 0; i < 45; i++) svc.tick(arena, 0.016, IDLE_INPUT); // クールダウン明け
    expect(arena.player.techCd[0]).toBe(0);
    svc.tick(arena, 0.016, flick(0)); // 3発目 → 出る
    expect(arena.player.state).toBe('windup');
  });

  it('回避ダッシュにもクールダウンがある(連続回避不可)', () => {
    const arena = makeArena();
    const svc = new CombatService(idleEnemy);
    svc.tick(arena, 0.016, flick('dash'));
    expect(arena.player.state).toBe('dash');
    for (let i = 0; i < 20; i++) svc.tick(arena, 0.016, IDLE_INPUT); // ダッシュ終了
    expect(arena.player.state).toBe('idle');
    expect(arena.player.dashCd).toBeGreaterThan(0);
    svc.tick(arena, 0.016, flick('dash')); // 連続ダッシュ不可
    expect(arena.player.state).toBe('idle');
  });

  it('技の発動(cast)と命中(hit)でエフェクトが発行される', () => {
    const arena = makeArena();
    const svc = new CombatService(idleEnemy);
    svc.tick(arena, 0.016, flick(0));
    expect(arena.effects.some((e) => e.kind === 'cast')).toBe(true);
    arena.effects.length = 0; // ビューが drain した想定
    for (let i = 0; i < 30; i++) svc.tick(arena, 0.016, IDLE_INPUT);
    expect(arena.effects.some((e) => e.kind === 'hit')).toBe(true);
  });

  it('長距離技(ranged)は遠くても命中し、エフェクトに ranged フラグが立つ', () => {
    const player = new CombatActor(
      {
        name: 'P',
        color: 1,
        techniques: [tech({ range: 8, ranged: true, windup: 0.2 }), tech(), tech()],
      },
      COMBAT_MAX_HP,
    );
    const enemy = new CombatActor(fighter('E'), COMBAT_MAX_HP);
    player.x = 0;
    player.z = 4;
    enemy.x = 0;
    enemy.z = -4; // 距離8(近接 range2 では届かない)
    const arena = new CombatArena(player, enemy);
    const svc = new CombatService(idleEnemy);
    svc.tick(arena, 0.016, flick(0));
    for (let i = 0; i < 20; i++) svc.tick(arena, 0.016, IDLE_INPUT);
    expect(enemy.hp).toBeLessThan(COMBAT_MAX_HP);
    expect(arena.effects.some((e) => e.kind === 'hit' && e.ranged)).toBe(true);
  });

  it('前進入力で相手へ近づく', () => {
    const arena = makeArena();
    arena.player.z = 5;
    arena.enemy.z = -5;
    const svc = new CombatService(idleEnemy);
    const before = arena.distance;
    svc.tick(arena, 0.1, { strafe: 0, forward: 1, action: null });
    expect(arena.distance).toBeLessThan(before);
  });
});
