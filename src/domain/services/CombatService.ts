import { CombatActor, CombatArena } from '../entities/CombatArena';
import {
  ACTOR_MIN_GAP,
  ARENA_RADIUS,
  CombatAction,
  CombatInput,
  DASH_COOLDOWN,
  DASH_SPEED,
  DASH_TIME,
  IDLE_INPUT,
  MOVE_SPEED,
} from '../values/Combat';

/** 敵の行動を決めるポート(DIP)。差し替え可能・テストで固定できる */
export interface EnemyController {
  decide(arena: CombatArena, dt: number): CombatInput;
}

/**
 * アクション戦闘を1フレーム進めるドメインサービス(単一責務・純粋・決定的)。
 * three.js/DOM・乱数・時計に依存しない。ワールドの進行状態にも触れない(副作用ゼロ)。
 * ジャスト回避は「ダッシュ中は無敵」という規則だけで表現する。
 */
export class CombatService {
  constructor(private readonly enemy: EnemyController) {}

  /** プレイヤー入力と敵AIで戦闘を dt 秒進める */
  tick(arena: CombatArena, dt: number, playerInput: CombatInput): void {
    if (arena.outcome || dt <= 0) return;

    const enemyInput = arena.enemy.state === 'idle' ? this.enemy.decide(arena, dt) : IDLE_INPUT;

    // 先にプレイヤー、次に敵。命中判定は相手の「現時点の状態(無敵か)」で行う
    this.updateActor(arena, arena.player, arena.enemy, playerInput, dt);
    if (!arena.enemy.alive) {
      arena.outcome = 'win';
      return;
    }
    this.updateActor(arena, arena.enemy, arena.player, enemyInput, dt);
    if (!arena.player.alive) {
      arena.outcome = 'lose';
      return;
    }
    if (!arena.enemy.alive) arena.outcome = 'win';
  }

  /** 1アクターの状態遷移・移動・命中処理 */
  private updateActor(
    arena: CombatArena,
    self: CombatActor,
    foe: CombatActor,
    input: CombatInput,
    dt: number,
  ): void {
    // クールダウンを進める(状態に関わらず常に減る)
    for (let i = 0; i < self.techCd.length; i++) {
      if (self.techCd[i] > 0) self.techCd[i] = Math.max(0, self.techCd[i] - dt);
    }
    if (self.dashCd > 0) self.dashCd = Math.max(0, self.dashCd - dt);

    // 相手方向の単位ベクトル(常に相手を向く)
    let ux = foe.x - self.x;
    let uz = foe.z - self.z;
    const dist = Math.hypot(ux, uz) || 1;
    ux /= dist;
    uz /= dist;
    self.facing = Math.atan2(ux, uz);

    switch (self.state) {
      case 'dash': {
        self.timer -= dt;
        this.move(self, self.dashX * DASH_SPEED * dt, self.dashZ * DASH_SPEED * dt, foe);
        if (self.timer <= 0) self.state = 'idle';
        return;
      }
      case 'windup': {
        self.timer -= dt;
        if (self.timer <= 0) this.resolveHit(arena, self, foe);
        return;
      }
      case 'recovery': {
        self.timer -= dt;
        if (self.timer <= 0) {
          self.state = 'idle';
          self.tech = null;
        }
        return;
      }
      case 'idle': {
        if (input.action === 'dash') {
          if (self.dashCd > 0) return; // リードタイム中は回避できない
          self.state = 'dash';
          self.timer = DASH_TIME;
          self.dashCd = DASH_COOLDOWN;
          self.dashX = -ux; // 相手から離れる方向
          self.dashZ = -uz;
          return;
        }
        if (input.action === 0 || input.action === 1 || input.action === 2) {
          if (self.techCd[input.action] > 0) return; // リードタイム中は出せない
          const tech = self.fighter.techniques[input.action];
          self.state = 'windup';
          self.tech = tech;
          self.timer = tech.windup;
          self.techCd[input.action] = tech.cooldown;
          // 発動エフェクト(技が出たことを見せる)
          arena.effects.push({
            kind: 'cast',
            x: self.x,
            z: self.z,
            fromX: self.x,
            fromZ: self.z,
            color: self.fighter.color,
            ranged: tech.ranged ?? false,
          });
          return;
        }
        // 移動: 前後(相手方向)+左右(直交方向)
        const perpX = -uz;
        const perpZ = ux;
        const vx = (ux * input.forward + perpX * input.strafe) * MOVE_SPEED;
        const vz = (uz * input.forward + perpZ * input.strafe) * MOVE_SPEED;
        this.move(self, vx * dt, vz * dt, foe);
        return;
      }
    }
  }

  /** 技の発生(windup 終了)で命中判定。相手が無敵(ダッシュ中)ならジャスト回避 */
  private resolveHit(arena: CombatArena, self: CombatActor, foe: CombatArena['enemy']): void {
    const tech = self.tech;
    if (tech) {
      const ranged = tech.ranged ?? false;
      const dist = Math.hypot(self.x - foe.x, self.z - foe.z);
      if (dist > tech.range) {
        // 空振り: 射程の端まで届いて消える(描画用に着弾点を計算)
        const dx = (foe.x - self.x) / (dist || 1);
        const dz = (foe.z - self.z) / (dist || 1);
        arena.lastEvent = `${tech.name} は届かなかった`;
        arena.effects.push({
          kind: 'hit',
          x: self.x + dx * tech.range,
          z: self.z + dz * tech.range,
          fromX: self.x,
          fromZ: self.z,
          color: self.fighter.color,
          ranged,
        });
      } else if (foe.invulnerable) {
        arena.lastEvent = 'ジャスト回避!';
        arena.effects.push({
          kind: 'dodge',
          x: foe.x,
          z: foe.z,
          fromX: self.x,
          fromZ: self.z,
          color: 0x66ffcc,
          ranged,
        });
      } else {
        foe.hp = Math.max(0, foe.hp - tech.damage);
        arena.lastEvent = `${self.fighter.name}の${tech.name}!`;
        arena.effects.push({
          kind: 'hit',
          x: foe.x,
          z: foe.z,
          fromX: self.x,
          fromZ: self.z,
          color: self.fighter.color,
          ranged,
        });
      }
      self.state = 'recovery';
      self.timer = tech.recovery;
    } else {
      self.state = 'idle';
    }
  }

  /** 移動を適用し、フィールド外と相手との重なりを補正する */
  private move(self: CombatActor, dx: number, dz: number, foe: CombatActor): void {
    self.x += dx;
    self.z += dz;
    // 円形フィールド内にクランプ
    const r = Math.hypot(self.x, self.z);
    if (r > ARENA_RADIUS) {
      self.x *= ARENA_RADIUS / r;
      self.z *= ARENA_RADIUS / r;
    }
    // 相手と重ならないよう最小間隔を保つ(自分側だけ押し戻す)
    let gx = self.x - foe.x;
    let gz = self.z - foe.z;
    const gap = Math.hypot(gx, gz);
    if (gap > 0 && gap < ACTOR_MIN_GAP) {
      gx /= gap;
      gz /= gap;
      self.x = foe.x + gx * ACTOR_MIN_GAP;
      self.z = foe.z + gz * ACTOR_MIN_GAP;
    }
  }
}

/**
 * 既定の敵AI(決定的)。間合いが遠ければ近づき、間合い内では一定間隔で技を循環使用する。
 * 乱数を使わないためテストで再現可能。プレイヤーの「回避」を主役にするため自身は回避しない。
 */
export class SimpleEnemyController implements EnemyController {
  private decisionTimer = 0.8;
  private techCycle = 0;

  decide(arena: CombatArena, dt: number): CombatInput {
    this.decisionTimer -= dt;
    const enemy = arena.enemy;
    const dist = arena.distance;

    // クールダウン中でない技スロットを techCycle 起点で探す
    let slot = -1;
    for (let i = 0; i < 3; i++) {
      const s = (this.techCycle + i) % 3;
      if (enemy.techCd[s] <= 0) {
        slot = s;
        break;
      }
    }
    if (slot < 0) {
      // 全部クールダウン中: 間合いを詰めて待つ
      return dist > 3 ? { strafe: 0, forward: 1, action: null } : IDLE_INPUT;
    }

    const range = enemy.fighter.techniques[slot].range;
    if (dist > range * 0.85) {
      // 間合いが遠い: 相手へ近づく
      return { strafe: 0, forward: 1, action: null };
    }
    if (this.decisionTimer <= 0) {
      // 間合い内: 技を出す(次回は別の技へ。少し間を置く)
      this.techCycle = (slot + 1) % 3;
      this.decisionTimer = 0.5;
      return { strafe: 0, forward: 0, action: slot as CombatAction };
    }
    // 間合いを保って待機
    return IDLE_INPUT;
  }
}
