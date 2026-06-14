# review0_cliff_climb — 事実確認

親Issue: [各世界によじ登れる崖を追加.md](./各世界によじ登れる崖を追加.md)

## 確認1: 上りは段差に関係なく即スナップ(現状はどんな高さも登れてしまう)

src/domain/services/MovementService.ts
```
   floorY(terrain, x, z, currentY, dt): number {
     const floor = this.surfaceAt(terrain, x, z, currentY);
     const drop = currentY - floor;
     if (drop <= FALL_STEP_THRESHOLD) return floor; // 段差越え(上り含む)は即スナップ
     return Math.max(floor, currentY - FALL_SPEED * dt); // 大きな落差は滑らかに降下
   }
```
→ `drop = currentY - floor`。床が上(floor>currentY)だと drop は負 → 常に `<= threshold` → 即スナップ。
つまり高い壁でも一瞬で登れる。**急な上りはレート制限してよじ登りにする**必要がある。

## 確認2: 地面メッシュは terrain.heightAt を頂点変位で描画 → 崖は地形に組み込めば出る

src/adapters/rendering/ThreeRendererAdapter.ts(addGround)
```
   const geometry = new THREE.PlaneGeometry(80, 80, 64, 64);
   geometry.rotateX(-Math.PI / 2);
   const positions = geometry.attributes.position;
   for (let i = 0; i < positions.count; i++) {
     positions.setY(i, terrain.heightAt(positions.getX(i), positions.getZ(i)));
   }
```
→ 地面は world.terrain.heightAt に追従。CliffField を地形にすればメサが地面に現れる(ただし64分割は粗い)。
見栄えのため崖メッシュ(フラスタム)を別途重ねる。

## 確認3: 落下/滑空が既にある(崖から飛び降りる動線に再利用)

src/domain/services/MovementService.ts
```
   export const FALL_SPEED = 6;
   export const GLIDE_FALL_SPEED = 1.5;
   export const GLIDE_MOVE_SPEED = 3;
```
src/domain/entities/Player.ts
```
   public airborne = false;
   public gliding = false;
```
→ 崖の頂上から踏み外すと delta<0 で落下分岐→滑空可能。`climbing` フラグを追加して登坂状態も管理する。

## 確認4: 多層床(2階建て)では floorAt が床を抑える → 誤登坂しない

src/domain/values/Terrain.ts(TwoFloorField.floorAt)
```
   floorAt(x, z, currentY): number {
     const surfaces = this.surfacesAt(x, z);
     let best = -Infinity;
     for (const s of surfaces) if (s <= currentY + TWO_FLOOR_STEP_UP && s > best) best = s;
     return best === -Infinity ? Math.min(...surfaces) : best;
   }
```
→ ロフト等は currentY+STEP_UP 以下の床を返すため、地上の delta は 0 付近。よって登坂分岐は発火せず、
2階建ての挙動は不変。崖(CliffField)は単層 heightAt なので急 delta が出てよじ登りになる。

## 結論(設計確定)

| 項目 | 内容 |
| --- | --- |
| 崖 | CliffField(メサ: 平頂+急斜面)を各世界の HillyTerrain に合成 |
| よじ登り | tick で `delta>FALL_STEP_THRESHOLD` の急上昇を `CLIMB_SPEED` に制限+水平同率縮小、climbing=true |
| 下り | 既存の落下/滑空(FN-012) |
| 描画 | 地面の高さ場追従 + 崖フラスタムメッシュ |
