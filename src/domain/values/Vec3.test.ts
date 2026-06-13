import { describe, expect, it } from 'vitest';
import { Vec3 } from './Vec3';

describe('Vec3', () => {
  it('加算・減算・スカラー倍ができる', () => {
    const a = new Vec3(1, 2, 3);
    const b = new Vec3(4, 5, 6);
    expect(a.add(b)).toEqual(new Vec3(5, 7, 9));
    expect(b.sub(a)).toEqual(new Vec3(3, 3, 3));
    expect(a.scale(2)).toEqual(new Vec3(2, 4, 6));
  });

  it('内積と長さを計算できる', () => {
    expect(new Vec3(1, 2, 3).dot(new Vec3(4, -5, 6))).toBe(12);
    expect(new Vec3(3, 0, 4).length()).toBe(5);
  });

  it('Y軸まわりの回転で +Z が +X へ向かう(90°)', () => {
    const v = new Vec3(0, 1, 1).rotateY(Math.PI / 2);
    expect(v.x).toBeCloseTo(1);
    expect(v.y).toBeCloseTo(1);
    expect(v.z).toBeCloseTo(0);
  });

  it('回転してから逆回転すると元に戻る', () => {
    const v = new Vec3(2, -1, 5).rotateY(0.7).rotateY(-0.7);
    expect(v.x).toBeCloseTo(2);
    expect(v.z).toBeCloseTo(5);
  });
});
