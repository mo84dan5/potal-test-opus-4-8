# review0_combat_move

親Issue: [戦闘移動をカメラ相対にする](./戦闘移動をカメラ相対にする.md)

現状の移動入力と適用箇所を事実確認する。

## src/domain/values/Combat.ts(入力の形)
```
54 export interface CombatInput {
56   readonly strafe: number;
58   readonly forward: number;
60   readonly action: CombatAction | null;
62 }
64 export const IDLE_INPUT: CombatInput = { strafe: 0, forward: 0, action: null };
```
事実: 入力は strafe/forward(相手基準の前後左右)。
→ `{moveX, moveZ}`(ワールド空間)に変更。カメラ相対変換はビューが担う。

## src/domain/services/CombatService.ts(移動の適用)
```
117         // 移動: 前後(相手方向)+左右(直交方向)
118         const perpX = -uz;
119         const perpZ = ux;
120         const vx = (ux * input.forward + perpX * input.strafe) * MOVE_SPEED;
121         const vz = (uz * input.forward + perpZ * input.strafe) * MOVE_SPEED;
122         this.move(self, vx * dt, vz * dt, foe);
```
事実: 移動が相手方向(ux,uz)とその直交で構成され、カメラと無関係。
→ ワールド入力 moveX/moveZ をそのまま(長さ1にクランプして)適用する。ux/uz は facing/dash で引き続き使用。

## src/domain/services/CombatService.ts(敵AI)
```
227       return dist > 3 ? { strafe: 0, forward: 1, action: null } : IDLE_INPUT;
233       return { strafe: 0, forward: 1, action: null };
239       return { strafe: 0, forward: 0, action: slot as CombatAction };
```
事実: 敵AIは forward 基準で返す。
→ 相手へ向かうワールド方向 moveX/moveZ を返すよう更新。

## src/adapters/ui/BattleArena3DAdapter.ts(入力生成)
```
251     this.service.tick(this.arena, dt, {
252       strafe: stick ? stick.x : 0,
253       forward: stick ? -stick.y : 0,
254       action: this.pendingAction,
255     });
```
事実: スティックをそのまま strafe/forward に渡している(相手基準で解釈される)。
→ カメラの水平 forward/right でスティックを回し、ワールド moveX/moveZ を渡す(カメラ相対)。

## 結論
- 移動入力をワールド空間ベクトルに統一。カメラ相対変換はカメラを持つアダプタが担い、ドメインは非依存。
- 記載と実コードに齟齬なし。`## 修正の提案` は不要。
