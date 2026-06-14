import { CombatActor, CombatArena } from '../entities/CombatArena';
import {
  ACTOR_MIN_GAP,
  ARENA_RADIUS,
  CombatInput,
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
          self.state = 'dash';
          self.timer = DASH_TIME;
          self.dashX = -ux; // 相手から離れる方向
          self.dashZ = -uz;
          return;
        }
        if (input.action === 0 || input.action === 1 || input.action === 2) {
          self.state = 'windup';
          self.tech = self.fighter.techniques[input.action];
          self.timer = self.tech.windup;
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
      const dist = Math.hypot(self.x - foe.x, self.z - foe.z);
      if (dist > tech.range) {
        arena.lastEvent = `${tech.name} は届かなかった`;
      } else if (foe.invulnerable) {
        arena.lastEvent = 'ジャスト回避!';
      } else {
        foe.hp = Math.max(0, foe.hp - tech.damage);
        arena.lastEvent = `${self.fighter.name}の${tech.name}!`;
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
    const slot = this.techCycle % 3;
    const range = enemy.fighter.techniques[slot].range;
    const dist = arena.distance;

    if (dist > range * 0.85) {
      // 間合いが遠い: 相手へ近づく
      return { strafe: 0, forward: 1, action: null };
    }
    if (this.decisionTimer <= 0) {
      // 間合い内: 技を出す(次回は別の技へ。少し間を置く)
      this.techCycle = (this.techCycle + 1) % 3;
      this.decisionTimer = 0.7;
      return { strafe: 0, forward: 0, action: slot as CombatInput['action'] };
    }
    // 間合いを保って待機
    return IDLE_INPUT;
  }
}
