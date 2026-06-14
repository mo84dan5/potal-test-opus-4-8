import { GameSession } from '../../domain/entities/GameSession';

/**
 * 落下中(滞空中)にタップ or 2本目の指の接地で「滑空状態」へ移行するユースケース。
 * 滞空していない時、または既に滑空中の時は何もしない。
 */
export class StartGlideUseCase {
  constructor(private readonly session: GameSession) {}

  /** 滑空を開始できたら true(=このタップは滑空用に消費された) */
  execute(): boolean {
    const player = this.session.player;
    if (!player.airborne || player.gliding) return false;
    player.gliding = true;
    return true;
  }
}
