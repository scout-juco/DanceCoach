/**
 * CountColumn: B2's column of tick bars and numbers (BUILD_SPEC §6.12), shared by the count-in (05 06 07 08, volt)
 * and the Lookback countdown (03 02 01, pink).
 *
 * 152 wide: an eyebrow, then a row per count, 12 apart. The current row's bar is 40 wide in the accent colour, done rows are
 * 24 and white, upcoming rows 24 in tick-off with a disabled number. It steps on the beat, no easing.
 * The column's centre is its parent object's origin.
 */
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { pxToCm } from "./Layout"
import { ColorToken, RADIUS, SIZE, SPACE, TEXT } from "./Theme"
import { childObject, makeRect, makeText, setRectSize, themeColor } from "./Visuals"

export const COLUMN_WIDTH = 152
const ROW = TEXT.countMd.lineHeight
const Z = 0.05

/** The column's height (px) for this many counts: the eyebrow's line, then each row 12 apart. */
export const columnHeight = (rows: number) => TEXT.eyebrow.lineHeight + rows * (SPACE.between + ROW)

type RowState = "upcoming" | "current" | "done"
const NUMBER: Record<RowState, ColorToken> = { upcoming: "textDisabled", current: "text", done: "text" }

/** Which way a row looks when the column is on `number`; counts run in either direction, "done" being the ones already passed. */
export const rowState = (count: number, number: number, ascending: boolean): RowState =>
  count === number ? "current" : (ascending ? count < number : count > number) ? "done" : "upcoming"

interface Row {
  bar: RoundedRectangle
  barObject: SceneObject
  numberObject: SceneObject
  number: Text
  y: number
}

export class CountColumn {
  private eyebrow: Text
  private rows: Row[] = []
  private lastNumber = -1
  private readonly height: number

  constructor(parent: SceneObject, private readonly counts: number[], private readonly accent: "volt" | "pink") {
    this.height = columnHeight(counts.length)
    const eyebrowObject = childObject("Eyebrow", parent)
    this.eyebrow = makeText(eyebrowObject, "eyebrow", "textSubtle", 2, "left")
    this.at(eyebrowObject, 0, TEXT.eyebrow.lineHeight / 2)
    counts.forEach((n, i) => {
      const y = TEXT.eyebrow.lineHeight + SPACE.between + i * (SPACE.between + ROW) + ROW / 2
      const barObject = childObject(`Bar${n}`, parent)
      const bar = makeRect(barObject, "tickOff", 1)
      const numberObject = childObject(`Count${n}`, parent)
      const number = makeText(numberObject, "countMd", "textDisabled", 2, "left")
      number.text = `0${n}`
      this.rows.push({ bar, barObject, numberObject, number, y })
    })
    this.setNumber(counts[0])
  }

  setEyebrow(text: string) {
    this.eyebrow.text = text
  }

  /** Shows or hides the rows (the eyebrow stays). */
  showRows(show: boolean) {
    this.rows.forEach((r) => {
      r.barObject.enabled = show
      r.numberObject.enabled = show
    })
  }

  /** Steps the rows to a count: each bar's width and colour, and its number just right of it. */
  setNumber(number: number) {
    this.lastNumber = number
    const ascending = this.counts[0] < this.counts[this.counts.length - 1]
    this.rows.forEach((row, i) => {
      const state = rowState(this.counts[i], number, ascending)
      const w = state === "current" ? SIZE.barWidthCurrent : SIZE.barWidth
      setRectSize(row.bar, w, SIZE.bar, RADIUS.sm)
      row.bar.backgroundColor = themeColor(state === "current" ? this.accent : state === "done" ? "text" : "tickOff")
      row.number.textFill.color = themeColor(state === "current" ? this.accent : NUMBER[state])
      this.at(row.barObject, w / 2, row.y)
      this.at(row.numberObject, w + SPACE.between, row.y)
    })
  }

  get current(): number {
    return this.lastNumber
  }

  /** Places a part of the column, x from its left edge and y down from its top (px). */
  private at(so: SceneObject, x: number, y: number) {
    so.getTransform().setLocalPosition(new vec3(pxToCm(x - COLUMN_WIDTH / 2), pxToCm(this.height / 2 - y), Z))
  }
}
