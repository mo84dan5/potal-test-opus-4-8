# review0_camera — 事実確認

親Issue: [3人称視点モードを追加.md](./3人称視点モードを追加.md)

## 確認1: syncCamera はカメラをプレイヤーの目の位置に置く(1人称)

src/adapters/rendering/ThreeRendererAdapter.ts
```
   private syncCamera(player: Player): void {
     const eye = player.eyePosition;
     this.camera.position.set(eye.x, eye.y, eye.z);
     this.camera.rotation.set(player.pitch, player.yaw, 0);
     this.camera.updateMatrixWorld();
   }
```
→ 1人称固定。3人称ではカメラをプレイヤー後方上方へ置き、頭を見る(lookAt)に変える。
`cameraMode` フラグで分岐する。

## 確認2: render はメインカメラ行列でポータル仮想カメラと最終描画を行う

src/adapters/rendering/ThreeRendererAdapter.ts
```
   const m = this.portalMatrix(targetPortal)
     .multiply(new THREE.Matrix4().makeRotationY(Math.PI))
     .multiply(this.portalMatrix(portal).invert())
     .multiply(this.camera.matrixWorld);
   ...
   this.renderer.render(view.scene, this.camera);
```
→ ポータル描画・最終描画は `this.camera`(の matrixWorld/projection)を使うので、カメラを後方へ
移動しても整合する(ドメイン不変・追加実装不要)。吹き出し投影 `projectToScreen` も同カメラを使用。

## 確認3: 人型メッシュ生成があり、アバターに流用できる

src/adapters/rendering/ThreeRendererAdapter.ts
```
   function buildNpcMesh(clothColor: number): THREE.Group {
     ...
     // つば(進行方向 -Z 側へ少し出す)
     const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.18), cloth);
     brim.position.set(0, 1.58, -0.2);
     group.add(legs, body, head, hat, brim);
     return group;
   }
```
→ NPCメッシュは yaw=0 で -Z を向く。プレイヤーの前方も yaw=0 で -Z(Player.forward)。
よってアバターの `rotation.y = player.yaw` で進行方向を向く。3人称時のみ現在シーンへ配置する。

src/domain/entities/Player.ts
```
   get forward(): Vec3 { return new Vec3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
```
→ yaw=0 で前方 -Z。3人称カメラの視線方向は pitch も含め
`(-cos p·sin y, sin p, -cos p·cos y)`。これの逆向き distance だけ後方へカメラを置く。

## 結論(設計確定)

| 項目 | 内容 |
| --- | --- |
| 切替 | `ThreeRendererAdapter.cameraMode` + `toggleCameraMode()`、HUDボタンで操作 |
| 3人称カメラ | 純粋関数 `computeThirdPersonCamera` で後方上方の位置と注視点を算出、lookAt |
| アバター | buildNpcMesh を流用し3人称時のみ現在シーンへ(位置=足元・向き=yaw) |
| 不変 | ドメイン(移動/当たり/ポータル/吹き出し)は変更なし |
