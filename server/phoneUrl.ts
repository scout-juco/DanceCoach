/** The address the phone opens, and the terminal banner (URL + QR) printed at server start. */
import { networkInterfaces } from "node:os"
import QRCode from "qrcode"

type Interfaces = ReturnType<typeof networkInterfaces>

/** First private IPv4 address of this machine (the Wi-Fi address), or undefined when offline. */
export function lanAddress(interfaces: Interfaces = networkInterfaces()): string | undefined {
  for (const list of Object.values(interfaces)) {
    for (const i of list ?? []) {
      if (i.family === "IPv4" && !i.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address)) return i.address
    }
  }
  return undefined
}

/** PUBLIC_URL (a tunnel / Tailscale Funnel address, https) wins; otherwise the LAN address over http. */
export function phoneUrl(port: number, publicUrl: string | null | undefined = process.env.PUBLIC_URL, lan: string | null | undefined = lanAddress()): string | undefined {
  if (publicUrl) return publicUrl.replace(/\/+$/, "")
  return lan ? `http://${lan}:${port}` : undefined
}

export async function startupBanner(port: number, url = phoneUrl(port)): Promise<string> {
  const lines = [`Ingest server on http://localhost:${port}`]
  if (!url) return lines.join("\n") + "\nNo network address found: connect to Wi-Fi for the phone."
  lines.push(`Phone: ${url}`)
  if (url.startsWith("http:")) lines.push("(http only: the phone camera needs https. Set PUBLIC_URL to a tunnel address.)")
  lines.push(await QRCode.toString(url, { type: "terminal", small: true }))
  return lines.join("\n")
}
