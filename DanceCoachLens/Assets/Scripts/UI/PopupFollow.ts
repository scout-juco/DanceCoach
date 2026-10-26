/**
 * PopupFollow: which way a pop-up sits from you, as a yaw about the vertical.
 *
 * A pop-up opens straight ahead of you and stays put while you look around it. Once you turn
 * more than POPUP.followDeg away, it glides back in front of you and settles there again.
 *
 * Pure: angles in radians, no Lens Studio APIs, so Vitest can drive it.
 */
import { POPUP } from "./Layout"

// How fast it glides back (the share of the way it closes per second), and how near counts as back in front.
const GLIDE_PER_SEC = 4
const SETTLE_DEG = 2

const rad = (deg: number) => (deg * Math.PI) / 180

/** a − b, wrapped to −π…π. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI)
  if (d > Math.PI) d -= 2 * Math.PI
  if (d < -Math.PI) d += 2 * Math.PI
  return d
}

export class PopupFollow {
  /** The pop-up's yaw. */
  yaw = 0
  private following = false

  /** Opens the pop-up straight ahead of the head. */
  open(headYaw: number) {
    this.yaw = headYaw
    this.following = false
  }

  /**
   * Follows the head for one frame. Returns how far (0–1) the pop-up moves toward the head
   * this frame, so its position can glide with it; 0 while it stays put.
   */
  step(headYaw: number, dtSec: number): number {
    if (Math.abs(angleDiff(headYaw, this.yaw)) > rad(POPUP.followDeg)) this.following = true
    if (!this.following) return 0
    const a = Math.min(1, dtSec * GLIDE_PER_SEC)
    this.yaw += angleDiff(headYaw, this.yaw) * a
    if (Math.abs(angleDiff(headYaw, this.yaw)) < rad(SETTLE_DEG)) this.following = false
    return a
  }
}
