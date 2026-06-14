# review0_house_cliff — 事実確認

親Issue: [家のドア上辺ちらつきと崖上面のテクスチャ.md](./家のドア上辺ちらつきと崖上面のテクスチャ.md)

## 確認1: 家の前面壁は「ドア幅のまぐさ」+「左右脇壁(全高)」で、同一平面に接する

src/adapters/rendering/ThreeRendererAdapter.ts(buildHouse)
```
    // 前面壁(中央にドア開口: 幅1.4 × 高さ2.2)+ドア枠
    const dw = HOUSE.doorWidth / 2;
    box(w - dw, h, t, -(dw + (w - dw) / 2), h / 2, d);
    box(w - dw, h, t, dw + (w - dw) / 2, h / 2, d);
    box(HOUSE.doorWidth, h - 2.2, t, 0, (2.2 + h) / 2, d); // まぐさ
    box(0.1, 2.2, t + 0.06, -dw, 1.1, d, trimMat);
    box(0.1, 2.2, t + 0.06, dw, 1.1, d, trimMat);
    box(HOUSE.doorWidth + 0.2, 0.1, t + 0.06, 0, 2.25, d, trimMat);
```
→ まぐさ(x∈[-dw,dw], y2.2..h)と左右脇壁(全高 y0..h)が **x=±dw, y2.2..h で同一平面に接する**。
さらに まぐさ天面 y=h と脇壁天面 y=h が同高。接合面が重なり Zファイティング。
**前面壁を「開口上の全幅帯(y2.2..h)」+「脇壁(y0..2.2)」に組み替え**れば縦の接合重なりが消える。

## 確認2: buildCliff は単一マテリアル(上面も岩色)

src/adapters/rendering/ThreeRendererAdapter.ts(buildCliff)
```
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(topR, botR, CLIFF.height + buried, 4, 1),
      new THREE.MeshLambertMaterial({ color: 0x8d7f6a, flatShading: true }),
    );
```
→ CylinderGeometry はマテリアルグループ[0:側面 1:上面 2:底面]を持つ。マテリアル配列で
**上面のみ地面テクスチャ**にできる。

## 確認3: 地面テクスチャ生成と種別が存在(崖上面に流用できる)

src/adapters/rendering/ThreeRendererAdapter.ts
```
   type GroundPattern = 'grass' | 'dirt' | 'snow' | 'stone';
   function createGroundTexture(pattern: GroundPattern): THREE.CanvasTexture { ... }
```
src/adapters/rendering/ThreeRendererAdapter.ts(buildEnvironment の対応)
```
   case 'day':  ... this.addGround(scene, 'grass', terrain);
   case 'night':... this.addGround(scene, 'dirt', terrain);
   case 'snow': ... this.addGround(scene, 'snow', terrain);
   case 'ruins':... this.addGround(scene, 'stone', terrain);
```
→ worldId→pattern の対応がある。`groundPatternOf(worldId)` に切り出し、崖上面の `map` に
`createGroundTexture(pattern)` を使う(repeat/colorSpace は addGround に倣う)。

## 結論(設計確定)

| 項目 | 内容 |
| --- | --- |
| 家のドア上辺 | 前面壁を「開口上の全幅帯」+「脇壁(開口高さまで)」に組み替え、縦の接合重なりを除去 |
| 崖の上面 | CylinderGeometry のマテリアル配列[側面=岩, 上面=地面テクスチャ, 底面=岩] |
| pattern | `groundPatternOf(worldId)`(day=grass/night=dirt/snow=snow/ruins=stone) |
