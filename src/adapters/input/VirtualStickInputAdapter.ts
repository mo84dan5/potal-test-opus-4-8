export interface StickState {
  /** 正規化済みスティック値(右が正、|(x,y)| ≤ 1) */
  x: number;
  /** 正規化済みスティック値(下が正) */
  y: number;
}

export interface VirtualStickCallbacks {
  /** 移動スティックの指を離した瞬間。はじき判定より先に呼ばれる */
  onStickEnd(): void;
  /** はじいて離した瞬間(ダッシュ)。dx/dy はスワイプ全体の移動量 [px] */
  onDash(dx: number, dy: number): void;
  /** 見回しスワイプの移動デルタ [px](右・下が正、見回し役の指の本数で平均化済み) */
  onLook(dx: number, dy: number): void;
  /** タップ(短時間・微小移動で離した)した瞬間 */
  onTap(x: number, y: number): void;
}

const STICK_RADIUS = 70; // [px] ベース円の半径(正規化の分母)
const DASH_MAX_TIME = 250; // [ms] はじき とみなす最大接触時間
const DASH_MIN_DISTANCE = 40; // [px] はじき とみなす最小距離
const TAP_MAX_TIME = 300; // [ms] タップとみなす最大接触時間
const TAP_MAX_DISTANCE = 10; // [px] タップとみなす最大移動量

type Role = 'stick' | 'look';

/**
 * タッチ開始位置から操作ゾーンを判定する。
 * 画面の上半分(境界含まず)= 見回し、下半分(中央線含む)= 移動。
 */
export function zoneForTouch(y: number, screenHeight: number): 'look' | 'stick' {
  return y < screenHeight / 2 ? 'look' : 'stick';
}

/**
 * 新しいタッチの役割を決める。
 * 最初の指はタッチ開始ゾーンで決まり(上半分=見回し / 下半分=移動)、
 * 2本目以降の指は位置によらず「もう一方の役割」になる:
 * スティック役がいれば見回し、いなければ移動。
 */
export function roleForTouch(
  hasStickPointer: boolean,
  hasAnyPointer: boolean,
  zone: 'look' | 'stick',
): Role {
  if (!hasAnyPointer) return zone;
  return hasStickPointer ? 'look' : 'stick';
}

/**
 * タッチ入力アダプタ(ツインスティック型)。
 * 指ごとに役割を割り当てる: 最初の指はゾーンで決まり(下半分=移動 / 上半分=見回し)、
 * 2本目の指は位置によらずもう一方の役割になる。移動と見回しを同時に操作できる。
 * パッドUI(ベース円+ノブ)のDOM表示もこのアダプタが担う。
 */
export class VirtualStickInputAdapter {
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private readonly roles = new Map<number, Role>();
  /** タップ判定用: ポインタごとの開始位置・時刻 */
  private readonly starts = new Map<number, { x: number; y: number; t: number }>();

  private stickPointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private startTime = 0;
  private stick: StickState | null = null;

  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;

  constructor(
    private readonly element: HTMLElement,
    private readonly callbacks: VirtualStickCallbacks,
  ) {
    this.base = createOverlay('stick-base');
    this.knob = createOverlay('stick-knob');

    element.addEventListener('pointerdown', this.onDown);
    element.addEventListener('pointermove', this.onMove);
    element.addEventListener('pointerup', this.onUp);
    element.addEventListener('pointercancel', this.onCancel);
  }

  /** 現在のスティック値。移動操作中でなければ null */
  getStick(): StickState | null {
    return this.stick;
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.onDown);
    this.element.removeEventListener('pointermove', this.onMove);
    this.element.removeEventListener('pointerup', this.onUp);
    this.element.removeEventListener('pointercancel', this.onCancel);
    this.base.remove();
    this.knob.remove();
  }

  private lookPointerCount(): number {
    let count = 0;
    for (const role of this.roles.values()) if (role === 'look') count++;
    return count;
  }

  private readonly onDown = (e: PointerEvent): void => {
    // 役割はこの指を登録する前の状態(他の指の有無)で決める
    const role = roleForTouch(
      this.stickPointerId !== null,
      this.pointers.size > 0,
      zoneForTouch(e.clientY, window.innerHeight),
    );
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.starts.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
    this.element.setPointerCapture(e.pointerId);
    this.roles.set(e.pointerId, role);
    if (role !== 'stick') return;

    this.stickPointerId = e.pointerId;
    this.originX = e.clientX;
    this.originY = e.clientY;
    this.startTime = e.timeStamp;
    this.stick = { x: 0, y: 0 };
    moveTo(this.base, this.originX, this.originY);
    moveTo(this.knob, this.originX, this.originY);
    this.base.style.display = 'block';
    this.knob.style.display = 'block';
  };

  private readonly onMove = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;

    if (e.pointerId === this.stickPointerId) {
      let dx = e.clientX - this.originX;
      let dy = e.clientY - this.originY;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) {
        dx *= STICK_RADIUS / len;
        dy *= STICK_RADIUS / len;
      }
      this.stick = { x: dx / STICK_RADIUS, y: dy / STICK_RADIUS };
      moveTo(this.knob, this.originX + dx, this.originY + dy);
    } else if (this.roles.get(e.pointerId) === 'look') {
      // 見回し役の指ごとのデルタを本数で平均化して適用する
      const scale = 1 / Math.max(1, this.lookPointerCount());
      this.callbacks.onLook(
        (e.clientX - prev.x) * scale,
        (e.clientY - prev.y) * scale,
      );
    }

    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    this.roles.delete(e.pointerId);
    const start = this.starts.get(e.pointerId);
    this.starts.delete(e.pointerId);

    if (e.pointerId === this.stickPointerId) {
      // 停止 → ダッシュの順で通知し、はじいた場合はダッシュの勢いだけが残る
      this.endStick();

      const elapsed = e.timeStamp - this.startTime;
      const dx = e.clientX - this.originX;
      const dy = e.clientY - this.originY;
      if (elapsed < DASH_MAX_TIME && Math.hypot(dx, dy) > DASH_MIN_DISTANCE) {
        this.callbacks.onDash(dx, dy);
      }
    }

    // タップ: 最後の1本が短時間・微小移動で離れたとき(ダッシュとは距離で排他)
    if (start && this.pointers.size === 0) {
      const elapsed = e.timeStamp - start.t;
      const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (elapsed < TAP_MAX_TIME && dist < TAP_MAX_DISTANCE) {
        this.callbacks.onTap(e.clientX, e.clientY);
      }
    }
  };

  private readonly onCancel = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    this.roles.delete(e.pointerId);
    this.starts.delete(e.pointerId);
    if (e.pointerId === this.stickPointerId) this.endStick();
  };

  /** スティック操作を終了して停止を通知し、パッドUIを隠す */
  private endStick(): void {
    this.callbacks.onStickEnd();
    this.stickPointerId = null;
    this.stick = null;
    this.base.style.display = 'none';
    this.knob.style.display = 'none';
  }
}

function createOverlay(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  el.style.display = 'none';
  document.body.appendChild(el);
  return el;
}

function moveTo(el: HTMLElement, x: number, y: number): void {
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}
