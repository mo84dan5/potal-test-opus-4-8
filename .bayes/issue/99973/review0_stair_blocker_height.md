# review0_stair_blocker_height — 事実確認

親Issue: [階段ブロッカーの高さ上限を下げて登坂可能にする.md](./階段ブロッカーの高さ上限を下げて登坂可能にする.md)

## 確認1: 階段ブロッカーの yMax が 2.6(=floorHeight-0.4)

src/config/worldContent.ts
```
200   floorHeight: 3.0,
...
204   stairZBottom: -4, // 階段下端(h=0)
205   stairZTop: 0, // 階段上端(h=floorHeight)=ロフト前縁
...
217   /** 階段ブロッカーが作用する高さ上限 [m](2階の足元 floorHeight には影響しない値) */
218   export const TWO_FLOOR_STAIR_BLOCKER_YMAX = TWO_FLOOR.floorHeight - 0.4;
```
→ yMax = 3.0 - 0.4 = **2.6**。

## 確認2: 裏側ブロッカーは z=loftFrontZ(0)。階段は z で 0→3 に傾斜

src/config/worldContent.ts(twoFloorStairBlockerSpots)
```
   // 裏側(z=loftFrontZ、階段幅 x∈[stairXMin,w])
   for (let x = TWO_FLOOR.stairXMin; x <= w + 1e-6; x += step) {
     spots.push({ x, z: TWO_FLOOR.loftFrontZ });
   }
```
src/domain/values/Terrain.ts
```
   if (x >= c.stairXMin && z >= c.stairZBottom && z < c.stairZTop) {
     const run = c.stairZTop - c.stairZBottom;       // 4
     const t = run > 0 ? (z - c.stairZBottom) / run : 1;
     surfaces.push(t * c.floorHeight);               // 0→3
   }
```
→ 階段面の高さ `h(z) = (z+4)/4 × 3`。

## 確認3: 衝突は feet > yMax のとき作用しない。半径合計0.7

src/domain/services/CollisionService.ts
```
   const feet = player.position.y;
   const head = feet + PLAYER_HEIGHT;
   for (const c of colliders) {
     if (c.yMax !== undefined && feet > c.yMax) continue;
     if (c.yMin !== undefined && head < c.yMin) continue;
```
→ プレイヤーは `feet <= yMax` のとき押し出される。
裏側ブロッカー(z=0, r=0.35)+プレイヤー(r=0.35)で、中心 `z > -0.7` のとき XZ 干渉。
`z=-0.7` の階段面 = `(−0.7+4)/4×3 = 2.475m`。

**結論**: 登坂中の足元 2.475m < yMax 2.6m のため、上端付近でブロッカーに引っかかり登れない。
yMax を 2.475 未満(かつ 0 超)にすれば、登坂を妨げず1階侵入だけ阻止できる。**1.2m が安全**。

## 修正の提案

| 項目 | 現状 | 提案 |
| --- | --- | --- |
| TWO_FLOOR_STAIR_BLOCKER_YMAX | 2.6 (= floorHeight-0.4) | **1.2**(腰高の低い壁。登坂を妨げず1階侵入を阻止) |
