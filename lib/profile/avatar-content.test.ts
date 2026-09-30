import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { normalizeAvatarImage } from "./avatar-content";

describe("avatar content boundary", () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString("base64");
  it("rejects active content and spoofed raster MIME", async () => {
    await expect(normalizeAvatarImage(`data:image/svg+xml;base64,${svg}`)).rejects.toThrow();
    await expect(normalizeAvatarImage(`data:image/png;base64,${svg}`)).rejects.toThrow();
    await expect(normalizeAvatarImage("data:image/png;base64,Zm9v")).rejects.toThrow();
  });
  it.each(["png", "jpeg", "webp"] as const)("preserves legitimate %s images as bounded PNG", async (format) => {
    const original = await sharp({ create: { width: 300, height: 100, channels: 3, background: "red" } }).toFormat(format).toBuffer();
    const normalized = await normalizeAvatarImage(`data:image/${format};base64,${original.toString("base64")}`);
    expect(normalized.dataUrl).toMatch(/^data:image\/png;base64,/);
    const metadata = await sharp(normalized.bytes).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(256);
    expect(metadata.exif).toBeUndefined();
  });
  it("keeps an incompressible upload readable after canonical PNG expansion", async () => {
    const webp = await sharp(randomBytes(256 * 256 * 4), { raw: { width: 256, height: 256, channels: 4 } }).webp({ quality: 60 }).toBuffer();
    const value = `data:image/webp;base64,${webp.toString("base64")}`;
    expect(value.length).toBeLessThan(200_000);
    const normalized = await normalizeAvatarImage(value);
    expect(normalized.dataUrl.length).toBeLessThanOrEqual(200_000);
    await expect(normalizeAvatarImage(normalized.dataUrl)).resolves.toHaveProperty("bytes");
  });
});
