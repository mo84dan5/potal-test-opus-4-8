# review0_door_mechanics — 事実確認

親Issue: [大広間の扉をタップ入室式にする.md](./大広間の扉をタップ入室式にする.md)

## 確認1: 現状は「面を横切ると自動で瞬間移動」=移動で入ってしまう

src/application/usecases/TickUseCase.ts
```
89   private checkPortals(before: Vec3): TickResult {
90     const player = this.session.player;
91     for (const portal of this.session.currentWorld.portals) {
92       if (!this.traversal.hasCrossed(portal, before, player.position)) continue;
93       const dest = this.session.getWorld(portal.targetWorldId);
94       this.traversal.traverse(player, portal, dest.getPortal(portal.targetPortalId));
95       this.session.moveToWorld(dest.id);
96       return { traversed: true };
97     }
98     return { traversed: false };
99   }
```
→ すべてのポータルが「歩いて面を横切る」と発火。**扉(door)はここから除外する必要がある**(isDoor をスキップ)。

## 確認2: 扉のドア開口は現状コライダーの隙間(通れる)。固くするには塞ぐ必要

src/config/worldContent.ts(portalHouseWallColliderSpots)
```
    if (Math.abs(x) > PORTAL_HOUSE.doorWidth / 2 + 0.2) {
      spots.push({ x: hx + x, z: hz + d }); // 前面(ドア開口を除く)
    }
```
→ ドア部分は壁コライダーが無く通り抜けられる。**扉を固くするには開口に扉コライダーを並べる**。

## 確認3: タップは「前方コーン内・近接・dialogue を持つ対象」を会話で開く

src/application/usecases/TapInteractUseCase.ts
```
38     const target = this.interaction.nearestInFrontWithin(
39       this.session.player.position,
40       this.session.player.forward,
41       this.session.currentWorld.interactables.filter((i) => i.dialogue.length > 0),
42       this.interactRange,
43       this.frontMinDot,
44     );
45     if (target) {
46       this.session.dialogue = new DialogueSession(target.dialogue);
```
→ 対象抽出が `dialogue.length > 0` 限定。**扉(dialogue 無し)もタップ対象に含め、扉なら会話でなく入室処理**へ分岐する。
既存テストは `new TapInteractUseCase(session, interaction, 3.5)`(3引数)で生成 → **traversal は既定値注入**で後方互換維持。

## 確認4: 通過の写像は180°反転(横断前提)。タップ入室には不向き → 正面配置を新設

src/domain/services/PortalTraversalService.ts
```
44   mapPoint(p: Vec3, from: Portal, to: Portal): Vec3 {
45     const local = p.sub(from.position).rotateY(-from.yaw);
46     const flipped = new Vec3(-local.x, local.y, -local.z);
47     return flipped.rotateY(to.yaw).add(to.position);
48   }
```
→ 横断(扉の裏側に出た位置)を前提に反転するため、扉の**正面**に立ってタップすると接続先扉の**裏(室外)**へ出てしまう。
そこで「接続先の扉の法線方向(室内側)に offset だけ離して立たせ、室内を向く」`placeInFrontOf` を追加する。

src/domain/entities/Portal.ts(法線が使える)
```
24   get normal(): Vec3 {
25     return new Vec3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
26   }
```
src/domain/entities/Player.ts(前方の定義)
```
26   get forward(): Vec3 {
27     return new Vec3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
28   }
```
→ 法線 n=(nx,nz) を向く yaw は forward=n より `yaw = atan2(-nx, -nz)`。

## 結論(設計確定)

| 要件 | 実装 |
| --- | --- |
| 扉を描画 | レンダラで透過面の代わりに閉じた扉メッシュ(枠+板)を描画、RT描画をスキップ |
| 移動で入らない | Portal.isDoor を交差判定から除外 + ドア開口を扉コライダーで塞ぐ |
| タップで入室 | doorPortalId 付き扉インタラクタブル + TapInteractUseCase が placeInFrontOf で接続先扉の正面(室内)へ配置 |
