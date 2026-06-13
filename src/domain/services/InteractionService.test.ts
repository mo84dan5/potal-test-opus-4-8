import { describe, expect, it } from 'vitest';
import { Interactable } from '../entities/Interactable';
import { Vec3 } from '../values/Vec3';
import { InteractionService } from './InteractionService';

const rock = new Interactable('r1', '石', new Vec3(3, 1, 0), null, ['これは石だ。']);
const tree = new Interactable('t1', '木', new Vec3(0, 4, 8), 'これは木です', []);
const service = new InteractionService();

describe('InteractionService.nearestWithin', () => {
  it('範囲内で最も近い対象を返す', () => {
    const near = new Interactable('r2', '石', new Vec3(1, 1, 0), null, ['…']);
    const found = service.nearestWithin(Vec3.ZERO, [rock, near, tree], 5);
    expect(found?.id).toBe('r2');
  });

  it('範囲外の対象は返さない', () => {
    expect(service.nearestWithin(Vec3.ZERO, [tree], 5)).toBeNull();
    expect(service.nearestWithin(Vec3.ZERO, [rock], 2.9)).toBeNull();
  });

  it('距離判定は水平距離で行う(高さは無視)', () => {
    const tall = new Interactable('t2', '木', new Vec3(0, 100, 2), 'これは木です', []);
    expect(service.nearestWithin(Vec3.ZERO, [tall], 3)?.id).toBe('t2');
  });

  it('対象が空なら null', () => {
    expect(service.nearestWithin(Vec3.ZERO, [], 10)).toBeNull();
  });
});

describe('InteractionService.nearestInFrontWithin', () => {
  const forward = new Vec3(0, 0, -1); // yaw=0 の前方
  const minDot = 0.5; // ±60°

  it('前方の対象は返す・背後の対象は返さない', () => {
    const front = new Interactable('f', '石', new Vec3(0, 1, -2), null, ['…']);
    const back = new Interactable('b', '石', new Vec3(0, 1, 2), null, ['…']);
    expect(service.nearestInFrontWithin(Vec3.ZERO, forward, [front], 5, minDot)?.id).toBe('f');
    expect(service.nearestInFrontWithin(Vec3.ZERO, forward, [back], 5, minDot)).toBeNull();
  });

  it('±60°の外(真横)は返さず、コーン内の斜め前は返す', () => {
    const side = new Interactable('s', '石', new Vec3(2, 1, 0), null, ['…']);
    const diag = new Interactable('d', '石', new Vec3(1, 1, -1), null, ['…']); // 45°
    expect(service.nearestInFrontWithin(Vec3.ZERO, forward, [side], 5, minDot)).toBeNull();
    expect(service.nearestInFrontWithin(Vec3.ZERO, forward, [diag], 5, minDot)?.id).toBe('d');
  });

  it('至近距離(ほぼ重なっている)は向きによらず返す', () => {
    const onTop = new Interactable('o', '石', new Vec3(0, 1, 0), null, ['…']);
    expect(service.nearestInFrontWithin(Vec3.ZERO, forward, [onTop], 5, minDot)?.id).toBe('o');
  });

  it('背後の近い対象より前方の遠い対象を選ぶ', () => {
    const back = new Interactable('b', '石', new Vec3(0, 1, 1), null, ['…']);
    const front = new Interactable('f', '石', new Vec3(0, 1, -3), null, ['…']);
    expect(
      service.nearestInFrontWithin(Vec3.ZERO, forward, [back, front], 5, minDot)?.id,
    ).toBe('f');
  });
});
