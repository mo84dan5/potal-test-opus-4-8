/** 不変の3次元ベクトル値オブジェクト(three.js 非依存) */
export class Vec3 {
  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly z: number,
  ) {}

  static readonly ZERO = new Vec3(0, 0, 0);

  add(v: Vec3): Vec3 {
    return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z);
  }

  sub(v: Vec3): Vec3 {
    return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z);
  }

  scale(s: number): Vec3 {
    return new Vec3(this.x * s, this.y * s, this.z * s);
  }

  dot(v: Vec3): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  length(): number {
    return Math.sqrt(this.dot(this));
  }

  /** XZ平面上でY軸まわりに回転(右手系、ヨー角ラジアン) */
  rotateY(yaw: number): Vec3 {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return new Vec3(c * this.x + s * this.z, this.y, -s * this.x + c * this.z);
  }

  withY(y: number): Vec3 {
    return new Vec3(this.x, y, this.z);
  }
}
