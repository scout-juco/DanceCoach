/** The icon set: 24-unit stroke icons, 2px stroke, round caps and joins (paths from the design screens). */
export const ICON_PATHS = {
  back: "M15 5 L8 12 L15 19",
  plus: "M12 5 V19 M5 12 H19",
  photo: "M4 6 H20 V18 H4 Z M4 15 L9 11 L13 14 L16 12 L20 15",
  play: "M8 5 L19 12 L8 19 Z",
  download: "M12 4 V15 M7 10 L12 15 L17 10 M5 20 H19",
  trash: "M4 7 H20 M9 7 V4 H15 V7 M6 7 L7 20 H17 L18 7",
  close: "M6 6 L18 18 M18 6 L6 18",
  music: "M9 18 V6 L19 4 V16 M9 18 A3 3 0 1 1 3 18 A3 3 0 1 1 9 18 M19 16 A3 3 0 1 1 13 16 A3 3 0 1 1 19 16",
  "chevron-left": "M15 6 L9 12 L15 18",
  "chevron-right": "M9 6 L15 12 L9 18",
} as const

export type IconName = keyof typeof ICON_PATHS
