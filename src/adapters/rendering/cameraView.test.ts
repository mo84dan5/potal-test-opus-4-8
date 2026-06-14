import { describe, expect, it } from 'vitest';
import { Vec3 } from '../../domain/values/Vec3';
import { computeThirdPersonCamera, occludedCameraDistance } from './cameraView';

describe('computeThirdPersonCamera', () => {
  it('正面(yaw=0,pitch=0)ではプレイヤーの真後ろ(+Z)・頭の高さにカメラが来る', () => {
    const cam = computeThirdPersonCamera(new Vec3(0, 0, 0), 0, 0, 4, 1.4);
    expect(cam.target.x).toBeCloseTo(0);
    expect(cam.target.y).toBeCloseTo(1.4);
    expect(cam.target.z).toBeCloseTo(0);
    // 前方は -Z なので、後方は +Z 側
    expect(cam.position.x).toBeCloseTo(0);
    expect(cam.position.y).toBeCloseTo(1.4);
    expect(cam.position.z).toBeCloseTo(4);
  });

  it('yaw=90°では後方が -X 側になる', () => {
    const cam = computeThirdPersonCamera(new Vec3(0, 0, 0), Math.PI / 2, 0, 4, 1.4);
    // 前方 = -X(yaw90°)→ 後方 = +X
    expect(cam.position.x).toBeCloseTo(4);
    expect(cam.position.z).toBeCloseTo(0);
  });

  it('見上げる(pitch>0)とカメラは下がるが、地面下にはならない(クランプ)', () => {
    const feet = new Vec3(0, 0, 0);
    // 強く見上げると raw.y は負になりうる → 足元+0.5 にクランプ
    const cam = computeThirdPersonCamera(feet, 0, 0.9, 4, 1.4, 0.5);
    expect(cam.position.y).toBeGreaterThanOrEqual(feet.y + 0.5 - 1e-9);
  });

  it('注視点はプレイヤーの足元高さに headHeight を足した位置', () => {
    const cam = computeThirdPersonCamera(new Vec3(2, 3, -1), 0, 0, 4, 1.5);
    expect(cam.target.y).toBeCloseTo(4.5); // 3 + 1.5
  });
});

describe('occludedCameraDistance(3人称カメラの遮蔽回避)', () => {
  it('遮蔽が無い(null)なら希望距離のまま', () => {
    expect(occludedCameraDistance(4, null)).toBe(4);
  });

  it('交差が希望距離より遠いなら希望距離のまま', () => {
    expect(occludedCameraDistance(4, 5)).toBe(4);
  });

  it('交差が手前なら、交差点-マージンまで寄せる', () => {
    expect(occludedCameraDistance(4, 2.5, 0.3)).toBeCloseTo(2.2); // 2.5 - 0.3
  });

  it('近すぎる交差では minDist で下限クランプ', () => {
    expect(occludedCameraDistance(4, 0.4, 0.3, 0.6)).toBe(0.6); // 0.1 → 0.6 にクランプ
  });
});
