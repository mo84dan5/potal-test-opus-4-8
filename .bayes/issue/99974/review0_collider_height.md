# review0_collider_height — 事実確認

親Issue: [階段裏侵入の防止と2階に影響しないコライダー.md](./階段裏侵入の防止と2階に影響しないコライダー.md)

## 確認1: コライダーは無限高さの円柱(y を無視)→ 2階も巻き込む

src/domain/values/Collider.ts
```
1 import { Vec3 } from './Vec3';
2
3 /** XZ平面の円(無限高さの円柱)として扱う衝突体 */
4 export interface Collider {
5   readonly position: Vec3;
6   readonly radius: number;
7 }
```
src/domain/services/CollisionService.ts
```
20       const dx = player.position.x - c.position.x;
21       const dz = player.position.z - c.position.z;
22       const dist = Math.hypot(dx, dz);
23       const minDist = c.radius + this.playerRadius;
24       if (dist >= minDist) continue;
```
→ y を一切見ないため、階段フットプリントを塞ぐコライダーは**登坂中の人やロフト(2階)も**ブロックする。
高さ範囲(yMin/yMax)を持たせ、プレイヤーの足元高さで効く/効かないを切り替える必要がある。

## 確認2: #99975 で階段脇の手すりのみになり、階段の裏(ロフト前縁側)が開いている

src/config/worldContent.ts(twoFloorRailingColliderSpots)
```
   const step = 0.6;
   // 階段の開放側(左側)に沿った手すりのみ
   for (let z = TWO_FLOOR.stairZBottom; z <= TWO_FLOOR.loftFrontZ - step + 1e-6; z += step) {
     spots.push({ x: TWO_FLOOR.stairXMin, z });
   }
```
→ 階段脇(x=stairXMin)の手すりだけで、(1)ロフト前縁側 z=loftFrontZ(階段の裏)が無防備、
(2)脇の手すりも z=loftFrontZ-step 手前までで上端(z∈[-0.7,0])に隙間がある。
ここから1階のプレイヤーが階段フットプリント(下)へ入り込める。

## 確認3: 階段は床から立ち上がるソリッドな箱(裏は本来塞がっているべき)

src/adapters/rendering/ThreeRendererAdapter.ts(buildTwoFloorInterior)
```
    const steps = 12;
    ...
    for (let i = 0; i < steps; i++) {
      const topY = ((i + 1) / steps) * FH;
      box(stairW, topY, stepDepth, stairCx, topY / 2, c.stairZBottom + (i + 0.5) * stepDepth, woodMat);
    }
```
→ 各段は y=0 から topY までのソリッドな箱。よって階段の下は本来詰まっており、
裏から入ると箱の中に潜り込む見た目になる。地面レベルのコライダーで侵入を防ぐべき。

## 確認4: TwoFloorField の階段高さ(裏側で最も高い)

src/domain/values/Terrain.ts
```
    if (x >= c.stairXMin && z >= c.stairZBottom && z < c.stairZTop) {
      const run = c.stairZTop - c.stairZBottom;
      const t = run > 0 ? (z - c.stairZBottom) / run : 1;
      surfaces.push(t * c.floorHeight); // 階段ランプ
    }
    if (z >= c.loftFrontZ) surfaces.push(c.floorHeight); // ロフト(2階)
```
→ 階段は裏(z→loftFrontZ)で floorHeight に達する。地面(足元0)とロフト(足元floorHeight)を
高さで区別できるので、`yMax < floorHeight` のコライダーなら1階だけ塞いで2階に影響しない。

## 結論(設計確定)

| 項目 | 内容 |
| --- | --- |
| 高さ制限 | `Collider.yMin?/yMax?` を追加。CollisionService は feet〜feet+PLAYER_HEIGHT と範囲が重なる時のみ解決 |
| 階段ブロッカー | 裏(z=loftFrontZ, x∈[stairXMin,w])+脇(x=stairXMin, z∈[stairZBottom,loftFrontZ])に yMin=0/yMax=STAIR_BLOCK_YMAX(<floorHeight) |
| 後方互換 | yMin/yMax 未指定のコライダーは従来どおり無限高さ |
