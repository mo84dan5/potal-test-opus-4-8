# review0_camera_smoothing — 事実確認

親Issue: [3人称カメラのスムージング.md](./3人称カメラのスムージング.md)

## 確認1: 3人称カメラ距離は遮蔽時に即座に変わる(補間なし)

src/adapters/rendering/ThreeRendererAdapter.ts(syncCamera, third)
```
   this.cameraRay.set(target, dir);
   this.cameraRay.far = desiredDist;
   const targets = scene.children.filter((c) => c !== this.avatar);
   const hits = this.cameraRay.intersectObjects(targets, true);
   const dist = occludedCameraDistance(desiredDist, hits.length ? hits[0].distance : null);
   const pos = target.clone().addScaledVector(dir, dist);
   this.camera.position.copy(pos);
```
→ `dist` をそのまま使うため、遮蔽の出入りでカメラ距離が瞬間的に変化する(カクつき)。
ブーム距離を前フレームから補間すればなめらかになる。

## 確認2: 描画ループは dt を計算済み(render に渡せる)

src/main.ts
```
   function frame(now: number): void {
     const dt = Math.min((now - lastTime) / 1000, 1 / 30);
     ...
     renderer.render();
```
→ dt は算出済み。`renderer.render(dt)` に変更して syncCamera へ渡し、指数補間に使う。

## 確認3: 3人称カメラ計算は純粋関数化済み(補間関数も追加できる)

src/adapters/rendering/cameraView.ts
```
   export function occludedCameraDistance(desiredDistance, hitDistance, margin=0.3, minDist=0.6): number {
     if (hitDistance === null || hitDistance >= desiredDistance) return desiredDistance;
     return Math.max(minDist, hitDistance - margin);
   }
```
→ 既に純粋関数群がある。`smoothTowards(current, target, rate, dt)` を追加し、
ブーム距離の指数補間を担わせる(単体テスト可能)。距離(相対量)を補間するためテレポでも飛ばない。

## 結論(設計確定)

| 項目 | 内容 |
| --- | --- |
| 補間対象 | 3人称のブーム距離(注視点→カメラ)。`smoothTowards` で指数補間 |
| テレポ安全 | 絶対位置でなく距離を補間 → プレイヤー瞬間移動でも飛ばない |
| 1人称 | 補間しない(頭固定)。3人称開始フレームは即スナップ |
