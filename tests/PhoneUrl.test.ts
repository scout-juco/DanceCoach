import { describe, expect, it } from "vitest"
import { lanAddress, phoneUrl, startupBanner } from "../server/phoneUrl"

const nic = (address: string, internal = false) => ({ address, family: "IPv4", internal }) as any

describe("phone URL", () => {
  it("picks the first private, non-loopback IPv4", () => {
    expect(lanAddress({ lo: [nic("127.0.0.1", true)], vpn: [nic("100.117.10.118")], wifi: [nic("192.168.1.20")] })).toBe("192.168.1.20")
    expect(lanAddress({ lo: [nic("127.0.0.1", true)] })).toBeUndefined()
  })
  it("prefers PUBLIC_URL, trimmed", () => {
    expect(phoneUrl(8787, "https://x.example.com/", "192.168.1.20")).toBe("https://x.example.com")
    expect(phoneUrl(8787, null, "192.168.1.20")).toBe("http://192.168.1.20:8787")
    expect(phoneUrl(8787, null, null)).toBeUndefined()
  })
  it("banner shows the URL and a QR, and warns on http", async () => {
    const b = await startupBanner(8787, "http://192.168.1.20:8787")
    expect(b).toContain("Phone: http://192.168.1.20:8787")
    expect(b).toContain("https")
    expect(b.split("\n").length).toBeGreaterThan(10)
    expect(await startupBanner(8787, "https://a.b")).not.toContain("http only")
  })
})
