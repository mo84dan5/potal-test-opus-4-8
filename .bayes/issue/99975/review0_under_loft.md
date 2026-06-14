# review0_under_loft — 事実確認

親Issue: [2階建ての家のロフト下に侵入できるようにする.md](./2階建ての家のロフト下に侵入できるようにする.md)

## 確認1: TwoFloorField はロフト領域で常に floorHeight を返す(1階に立てない)

src/domain/values/Terrain.ts
```
85   heightAt(x: number, z: number): number {
86     const c = this.c;
87     if (z >= c.loftFrontZ) return c.floorHeight; // ロフト(2階)
88     if (x >= c.stairXMin && z >= c.stairZBottom && z < c.stairZTop) {
89       const run = c.stairZTop - c.stairZBottom;
90       const t = run > 0 ? (z - c.stairZBottom) / run : 1; // 0(下端)→1(上端)
91       return t * c.floorHeight; // 階段ランプ
92     }
93     return 0; // 1階
94   }
```
→ `z >= loftFrontZ` で無条件に `floorHeight` を返す。これにより足元が常に2階へ持ち上げられ、
**ロフト下の1階(h=0)に立てない**。現在の足元高さ `currentY` を考慮する多層床が必要。

## 確認2: 足元は毎フレーム高さ場へハードスナップされる

src/domain/services/MovementService.ts
```
68     // 足元を地形の高さへスナップ(地形に沿って移動する)
69     player.position = pos.withY(terrain.heightAt(pos.x, pos.z));
```
src/application/usecases/TickUseCase.ts
```
38     // 押し出しで足元がずれた場合も地形へ再スナップ
39     player.position = player.position.withY(
40       currentWorld.terrain.heightAt(player.position.x, player.position.z),
41     );
```
→ 両方が `heightAt(x,z)` を使うため、`floorAt(x,z,currentY)` 対応へ変更が必要。
大きな段差を下る際の瞬間ワープを避けるため、一定速度で滑らかに降下させる。

## 確認3: ロフト前縁の手すりコライダーが1階の水平移動を塞ぐ

src/config/worldContent.ts(twoFloorRailingColliderSpots)
```
   // ロフト前縁(階段開口=右側 x>=stairXMin は空ける)
   for (let x = -w; x <= TWO_FLOOR.stairXMin + 1e-6; x += step) {
     spots.push({ x, z: TWO_FLOOR.loftFrontZ });
   }
```
src/main.ts
```
   const twoFloorRailingColliders = (def: WorldDef): Collider[] => {
     if (def.floorKind !== 'two-floor') return [];
     return twoFloorRailingColliderSpots().map((s) => ({ position: new Vec3(s.x, 0, s.z), radius: ... }));
   };
```
→ コライダーは XZ 円柱で y を無視するため、ロフト前縁(z=loftFrontZ)の手すりは
**1階のプレイヤーがロフト下へ進む経路も塞ぐ**。前縁の手すりは撤去し、階段脇のみ残す。

## 結論(設計確定)

| 要因 | 対応 |
| --- | --- |
| ロフト領域で常に2階高さ | `floorAt(x,z,currentY)`: 候補面のうち currentY+STEP_UP 以下で最も高い面 → 1階に留まれる |
| ハードスナップで段差ワープ | MovementService に段差/落下対応の床スナップ(大段差は一定速度で滑らか降下) |
| 前縁手すりが進路を塞ぐ | 前縁手すりコライダー・描画を撤去(階段脇は残す) |
