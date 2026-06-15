# review0_battle_camera

親Issue: [戦闘カメラを俯瞰(ステージ紐づけ)に修正](./戦闘カメラを俯瞰(ステージ紐づけ)に修正.md)

戦闘カメラの現状を事実確認する。

## src/adapters/ui/BattleArena3DAdapter.ts(updateCamera)
```
329   private updateCamera(dt: number): void {
330     const a = this.arena!;
331     const cam = this.camera!;
332     const p = a.player;
333     const e = a.enemy;
334     let dx = e.x - p.x;
335     let dz = e.z - p.z;
336     const d = Math.hypot(dx, dz) || 1;
337     dx /= d;
338     dz /= d;
339     // 三人称: プレイヤーの後方やや上から、両者の中点を見る
340     const desired = new THREE.Vector3(p.x - dx * 5.0, 3.2, p.z - dz * 5.0);
341     if (!this.camReady) { cam.position.copy(desired); this.camReady = true; }
342     else { cam.position.lerp(desired, Math.min(1, dt * 6)); }
347     cam.lookAt((p.x + e.x) / 2, 0.9, (p.z + e.z) / 2);
348   }
```
事実: カメラはプレイヤー後方5m・高さ3.2mから中点を見る三人称。プレイヤーの向き(dir)で回り込む。
→ 近く・低い・回り込む。ステージ紐づけの俯瞰(+Z高所固定・X部分追従・中点注視)に変更する。
計算を純粋関数 `computeBattleCamera` に切り出し、ここでは適用のみ(lerp は踏襲)。

## src/adapters/rendering/cameraView.ts(設計の手本)
事実: 三人称カメラの計算が純粋関数として分離されている(`computeThirdPersonCamera` 等)。
→ 戦闘カメラも同様に純粋関数化し、テスト可能にする(一貫性)。

## src/domain/values/Combat.ts(ステージ寸法)
```
54 /** アリーナ(円形フィールド)の半径 [m] */
55 export const ARENA_RADIUS = 6;
```
事実: アリーナ半径6m(直径12m)。俯瞰でこの範囲が収まる距離/高さに設定する。

## 結論
- updateCamera をステージ紐づけ俯瞰へ。計算は純粋関数に分離してテスト可能に(関心の分離)。
- 記載と実コードに齟齬なし。`## 修正の提案` は不要。
