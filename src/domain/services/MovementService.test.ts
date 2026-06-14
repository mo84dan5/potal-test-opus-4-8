import { describe, expect, it } from 'vitest';
import { Player } from '../entities/Player';
import { Vec3 } from '../values/Vec3';
import { MovementService } from './MovementService';

const newPlayer = (): Player => new Player(Vec3.ZERO, Vec3.ZERO, 0, 0);

describe('MovementService', () => {
  it('applyImpulse は方向を正規化して速度を加える', () => {
    const service = new MovementService();
    const player = newPlayer();
    service.applyImpulse(player, new Vec3(0, 0, -10), 3);
    expect(player.velocity.z).toBeCloseTo(-3);
    expect(player.velocity.length()).toBeCloseTo(3);
  });

  it('applyImpulse は最大速度でクランプされる', () => {
    const service = new MovementService({ damping: 2, maxSpeed: 5, boundsRadius: 30, acceleration: 8 });
    const player = newPlayer();
    service.applyImpulse(player, new Vec3(1, 0, 0), 100);
    expect(player.velocity.length()).toBeCloseTo(5);
  });

  it('tick は位置を積分し速度を指数減衰させる', () => {
    const service = new MovementService({ damping: 1, maxSpeed: 10, boundsRadius: 30, acceleration: 8 });
    const player = newPlayer();
    player.velocity = new Vec3(2, 0, 0);
    service.tick(player, 0.5);
    expect(player.position.x).toBeCloseTo(1);
    expect(player.velocity.x).toBeCloseTo(2 * Math.exp(-0.5));
  });

  it('tick は移動範囲の円内に位置をクランプする', () => {
    const service = new MovementService({ damping: 1, maxSpeed: 10, boundsRadius: 28, acceleration: 8 });
    const player = newPlayer();
    player.position = new Vec3(100, 0, 0);
    service.tick(player, 0.016);
    expect(Math.hypot(player.position.x, player.position.z)).toBeLessThanOrEqual(28.0001);
  });

  it('desiredVelocity があるときは目標速度へ指数追従する(減衰しない)', () => {
    const service = new MovementService({ damping: 2, maxSpeed: 10, boundsRadius: 30, acceleration: 8 });
    const player = newPlayer();
    player.desiredVelocity = new Vec3(0, 0, -6);
    service.tick(player, 0.1);
    const expected = -6 * (1 - Math.exp(-0.8)); // 1ステップで目標へ55%追従
    expect(player.velocity.z).toBeCloseTo(expected);

    // 繰り返すと目標速度へ収束する
    for (let i = 0; i < 100; i++) service.tick(player, 0.1);
    expect(player.velocity.z).toBeCloseTo(-6, 1);
  });

  it('desiredVelocity を解除すると減衰に戻る', () => {
    const service = new MovementService({ damping: 1, maxSpeed: 10, boundsRadius: 30, acceleration: 8 });
    const player = newPlayer();
    player.velocity = new Vec3(2, 0, 0);
    player.desiredVelocity = null;
    service.tick(player, 0.5);
    expect(player.velocity.x).toBeCloseTo(2 * Math.exp(-0.5));
  });

  it('halt は速度と目標速度を即座に破棄する', () => {
    const service = new MovementService();
    const player = newPlayer();
    player.velocity = new Vec3(3, 0, -2);
    player.desiredVelocity = new Vec3(0, 0, -6);
    service.halt(player);
    expect(player.velocity.length()).toBe(0);
    expect(player.desiredVelocity).toBeNull();
  });

  it('高さは常に y=0 に保たれる(平坦地形のデフォルト)', () => {
    const service = new MovementService();
    const player = newPlayer();
    player.velocity = new Vec3(0, 5, 1);
    service.tick(player, 1);
    expect(player.position.y).toBe(0);
  });

  it('地形を渡すと足元が地形の高さにスナップする(地形に沿って移動)', () => {
    const service = new MovementService();
    const player = newPlayer();
    player.velocity = new Vec3(2, 0, 0);
    const terrain = { heightAt: (x: number, z: number) => 0.1 * x + 0.05 * z };
    service.tick(player, 1, terrain);
    expect(player.position.x).toBeCloseTo(2);
    expect(player.position.y).toBeCloseTo(0.2); // h(2, 0) = 0.2
  });

  it('多層床(floorAt)では足元高さに応じた床に乗る(1階はロフト下でも0のまま)', () => {
    const service = new MovementService();
    const player = newPlayer();
    // currentY が高ければロフト(3)、低ければ1階(0)を返す多層床の模擬
    const terrain = {
      heightAt: () => 3,
      floorAt: (_x: number, _z: number, cy: number) => (cy > 2.4 ? 3 : 0),
    };
    service.tick(player, 0.1, terrain); // currentY=0
    expect(player.position.y).toBe(0); // 吸い上げられず1階に留まる
  });

  it('大きな段差を踏み外すと一定速度(FALL_SPEED=6)で滑らかに降下し、滞空フラグが立つ', () => {
    const service = new MovementService();
    const player = newPlayer();
    player.position = new Vec3(0, 3, 0); // ロフト高さ
    const terrain = { heightAt: () => 0, floorAt: () => 0 }; // 足元の床は0
    service.tick(player, 0.1, terrain);
    expect(player.position.y).toBeCloseTo(2.4); // 3 - 6*0.1 = 2.4(まだ降下中)
    expect(player.airborne).toBe(true);
    for (let i = 0; i < 10; i++) service.tick(player, 0.1, terrain);
    expect(player.position.y).toBe(0); // やがて着地
    expect(player.airborne).toBe(false);
  });

  it('滑空中は降下がさらに遅い(GLIDE_FALL_SPEED=1.5)', () => {
    const service = new MovementService();
    const player = newPlayer();
    player.position = new Vec3(0, 3, 0);
    player.gliding = true;
    const terrain = { heightAt: () => 0, floorAt: () => 0 };
    service.tick(player, 0.1, terrain);
    expect(player.position.y).toBeCloseTo(2.85); // 3 - 1.5*0.1
  });

  it('着地すると滑空状態は解除される', () => {
    const service = new MovementService();
    const player = newPlayer();
    player.position = new Vec3(0, 0, 0);
    player.gliding = true;
    const terrain = { heightAt: () => 0 }; // 足元0=着地
    service.tick(player, 0.1, terrain);
    expect(player.airborne).toBe(false);
    expect(player.gliding).toBe(false);
  });

  it('滑空中は水平速度が GLIDE_MOVE_SPEED にクランプされる', () => {
    const service = new MovementService();
    const player = newPlayer();
    player.position = new Vec3(0, 3, 0);
    player.gliding = true;
    player.velocity = new Vec3(10, 0, 0); // 速い水平速度
    const terrain = { heightAt: () => 0, floorAt: () => 0 };
    service.tick(player, 0.1, terrain);
    expect(Math.hypot(player.velocity.x, player.velocity.z)).toBeCloseTo(3); // GLIDE_MOVE_SPEED
  });
});
