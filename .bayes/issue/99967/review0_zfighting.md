# review0_zfighting — 事実確認

親Issue: [3人称デフォルト化とZファイティング改善.md](./3人称デフォルト化とZファイティング改善.md)

## 確認1: カメラ near が極小(0.05)・far 300 → 深度精度が低い

src/adapters/rendering/ThreeRendererAdapter.ts
```
   this.camera = new THREE.PerspectiveCamera(
     70,
     window.innerWidth / window.innerHeight,
     0.05,
     300,
   );
```
→ near/far 比 6000。near を上げ far を下げると深度バッファ精度が大幅に改善し、Zファイティングが減る。
near 0.2 はプレイヤー(半径0.35+壁コライダーで壁面から ≥0.35m)的に安全。

## 確認2: 地面メッシュは高さ場(CliffField)を頂点変位 → 崖で盛り上がり、フラスタムと重なる

src/adapters/rendering/ThreeRendererAdapter.ts(addGround)
```
   const geometry = new THREE.PlaneGeometry(80, 80, 64, 64);
   geometry.rotateX(-Math.PI / 2);
   const positions = geometry.attributes.position;
   for (let i = 0; i < positions.count; i++) {
     positions.setY(i, terrain.heightAt(positions.getX(i), positions.getZ(i)));
   }
```
src/adapters/rendering/ThreeRendererAdapter.ts(buildCliff)
```
   const mesh = new THREE.Mesh(
     new THREE.CylinderGeometry(topR, botR, CLIFF.height, 4, 1),
     new THREE.MeshLambertMaterial({ color: 0x8d7f6a, flatShading: true }),
   );
   mesh.position.set(cliff.x, CLIFF.height / 2, cliff.z);
```
→ `terrain.heightAt` は CliffField の崖を含むので地面が崖位置で盛り上がり、その上にフラスタムを重ねる。
2面がほぼ同一深度 → ちらつく。**地面は base 地形で描き、崖はフラスタムのみ**にすれば解消。

## 確認3: 階段の各段は同一平面で接するソリッド箱

src/adapters/rendering/ThreeRendererAdapter.ts(buildTwoFloorInterior)
```
   for (let i = 0; i < steps; i++) {
     const topY = ((i + 1) / steps) * FH;
     box(stairW, topY, stepDepth, stairCx, topY / 2, c.stairZBottom + (i + 0.5) * stepDepth, woodMat);
   }
```
→ 各段(z 幅 stepDepth)が隣の段と z=境界で接し、共有面(y=0〜低い段の高さ)が重なる → ちらつく。
各段を少し深く(重ねて)配置すれば共有面が消える。

## 確認4: CliffField は base を private で保持(公開すれば地面描画に使える)

src/domain/values/Terrain.ts
```
   export class CliffField implements HeightField {
     constructor(
       private readonly base: HeightField,
       private readonly cliffs: readonly CliffSpec[],
     ) {}
```
→ `base` を public readonly にすれば、レンダラが地面メッシュを base 地形で描ける(崖を二重に描かない)。

## 確認5: 視点モードの既定は現状 1人称

src/adapters/rendering/ThreeRendererAdapter.ts
```
   private cameraMode: 'first' | 'third' = 'first';
```
index.html
```
   <button id="view-btn" type="button">👤 1人称</button>
```
→ 既定を `'third'` に、ボタン初期ラベルを「🧍 3人称」に変更する。

## 結論(設計確定)

| 項目 | 内容 |
| --- | --- |
| 既定3人称 | cameraMode 既定 'third'、ボタン初期「🧍 3人称」 |
| 深度精度 | near 0.05→0.2、far 300→200(対数深度はポータル自作シェーダ非対応のため不採用) |
| 崖の重なり | 地面は base 地形で描画、崖はフラスタムのみ(底は地中へ埋める) |
| 階段の重なり | 各段を重ねて同一平面の接触を除去 |
