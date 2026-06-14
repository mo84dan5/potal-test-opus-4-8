# review0_camera_occlusion — 事実確認

親Issue: [3人称カメラのオブジェクト遮蔽回避.md](./3人称カメラのオブジェクト遮蔽回避.md)

## 確認1: 3人称カメラは後方固定距離(遮蔽を考慮していない)

src/adapters/rendering/ThreeRendererAdapter.ts
```
   private syncCamera(player: Player): void {
     if (this.cameraMode === 'third') {
       const cam = computeThirdPersonCamera(player.position, player.yaw, player.pitch, 4, 1.4);
       this.camera.position.set(cam.position.x, cam.position.y, cam.position.z);
       this.camera.lookAt(cam.target.x, cam.target.y, cam.target.z);
       this.camera.updateMatrixWorld();
       return;
     }
     ...
   }
```
→ 希望位置(後方4m)へ直接置くだけ。間に壁等があっても無視 → 主人公が隠れる。
注視点→希望位置へレイを飛ばし、最初の交差手前へ寄せる必要がある。

## 確認2: render は現在ワールドのシーンを持っている(レイ対象にできる)

src/adapters/rendering/ThreeRendererAdapter.ts
```
   render(): void {
     const world = this.session.currentWorld;
     const view = this.viewOf(world.id);
     this.syncCamera(this.session.player);
     this.syncNpcs();
     this.syncAvatar(view.scene);
```
→ `view.scene` が現在シーン。`syncCamera` に scene を渡せばレイキャストできる。アバターは
`this.avatar`(現在シーンへ配置)なので、レイ対象から除外する(始点が主人公位置=自己交差を防ぐ)。

## 確認3: 3人称カメラ位置の計算は純粋関数化済み(寄せ距離も純粋関数にできる)

src/adapters/rendering/cameraView.ts
```
   export function computeThirdPersonCamera(feet, yaw, pitch, distance, headHeight, minClearance=0.5): ThirdPersonCamera {
     ...
     const raw = target.sub(dir.scale(distance)); // 後方へ distance
     ...
   }
```
→ 注視点 target と希望位置 position を返す。遮蔽時の寄せ距離は
`occludedCameraDistance(希望距離, hit距離, margin, minDist)` として純粋に決められる(単体テスト可能)。

## 結論(設計確定)

| 項目 | 内容 |
| --- | --- |
| 遮蔽検出 | target→希望位置へ Raycaster(対象=シーンのメッシュ、アバター除外) |
| 寄せ | `occludedCameraDistance`: hit距離<希望距離 なら max(minDist, hit距離-margin) |
| 不変 | ドメイン・1人称は変更なし |
