# review0_Terrain — 事実確認

親Issue: [家の地面を平坦化.md](./家の地面を平坦化.md)

## 確認1: 平坦化は「中心だけ」高さ0で、縁に向かって起伏が復活する

src/domain/values/Terrain.ts
```
29   heightAt(x: number, z: number): number {
30     // [-1, 1] 程度に正規化された波の重ね合わせ
31     const wave =
32       0.6 * Math.sin(x * 0.22) * Math.cos(z * 0.19) +
33       0.4 * Math.sin((x + z) * 0.11);
34     let h = wave * this.amplitude;
35
36     for (const spot of this.flatSpots) {
37       const d = Math.hypot(x - spot.x, z - spot.z);
38       if (d >= spot.radius) continue;
39       const t = d / spot.radius; // 0(中心)→1(縁)
40       h *= t * t * (3 - 2 * t); // smoothstep で滑らかに 0 へ
41     }
42     return h;
43   }
```
→ `t = d / spot.radius` のため、完全に高さ0になるのは `d = 0`(中心)のみ。家の角(中心から約3.9m)では係数が0.59となり、振幅の約59%の起伏が残る。**干渉の根本原因を確認。**

## 確認2: 家の平坦化スポット半径は7、家の寸法は6×5

src/main.ts
```
86   const FLAT_PORTAL_RADIUS = 5; // ポータル周辺の平坦化半径 [m]
87   const FLAT_SPAWN_RADIUS = 4; // スポーン(原点)の平坦化半径 [m]
88
89   // 地形: ワールドごとの振幅+ポータル・スポーン周辺の平坦化
90   const FLAT_HOUSE_RADIUS = 7; // 家の周辺の平坦化半径 [m]
91
92   const buildTerrain = (def: WorldDef): HeightField =>
93     new HillyTerrain(def.terrainAmplitude, [
94       ...def.portals.map((p) => ({ x: p.x, z: p.z, radius: FLAT_PORTAL_RADIUS })),
95       { x: 0, z: 0, radius: FLAT_SPAWN_RADIUS },
96       ...(def.house ? [{ x: def.house.x, z: def.house.z, radius: FLAT_HOUSE_RADIUS }] : []),
97     ]);
```

src/config/worldContent.ts
```
74   export const HOUSE = {
75     width: 6,
76     depth: 5,
77     wallHeight: 2.6,
```
→ 家の半対角 = hypot(6/2, 5/2) = hypot(3, 2.5) ≈ 3.905m。半径7のスポットでは角部分が平坦化しきらない。プラトー(完全平坦域)が必要。

## 確認3: 地面メッシュも家も同一の高さ場を共有 → ドメイン修正で描画も整合

src/adapters/rendering/ThreeRendererAdapter.ts
```
316     const positions = geometry.attributes.position;
317     for (let i = 0; i < positions.count; i++) {
318       positions.setY(i, terrain.heightAt(positions.getX(i), positions.getZ(i)));
319     }
...
429     const group = new THREE.Group();
430     group.position.set(house.x, terrain.heightAt(house.x, house.z), house.z);
```
→ 地面の頂点変位も家の配置も `terrain.heightAt` を参照。`FlatSpot` をプラトー化すれば、地面メッシュが家の足元で平らになり、家の床(中心高さ基準)と一致する。**描画側の追加修正は不要。**

## 修正の提案

| 項目 | 現状 | 提案 |
| --- | --- | --- |
| FlatSpot | `radius` のみ。中心だけ高さ0 | `flatRadius?`(内側プラトー)を追加。`d<=flatRadius`で高さ0 |
| smoothstep | `t = d/radius` | `t = (d-flatRadius)/(radius-flatRadius)` で内縁→外縁を補間 |
| 家スポット | `{x,z,radius:7}` | `{x,z,radius:7, flatRadius: ~4.5}` でフットプリント全体を平坦化 |
