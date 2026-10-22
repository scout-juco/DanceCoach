import { defineConfig } from "vitest/config"

// Tests cover the pure logic in DanceCoachLens/Assets/Scripts/Core, outside Lens Studio.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
})
