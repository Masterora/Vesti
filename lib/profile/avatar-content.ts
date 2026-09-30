import sharp from "sharp";
import { ServiceError } from "@/lib/services/errors";

const rasterDataUrl = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/;

/** Re-encode at both storage and delivery boundaries, including historical uploads. */
export async function normalizeAvatarImage(value: string) {
  const match = value.trim().match(rasterDataUrl);
  if (!match || value.length > 200_000)
    throw new ServiceError("Avatar must be a PNG, JPEG or WebP image", 400);
  try {
    const input = Buffer.from(match[2].replace(/\s/g, ""), "base64");
    const image = sharp(input, { limitInputPixels: 4_000_000, animated: false });
    const metadata = await image.metadata();
    if (!metadata.format || !["png", "jpeg", "webp"].includes(metadata.format) ||
        `image/${metadata.format}` !== match[1] || (metadata.pages ?? 1) !== 1)
      throw new Error("Unsupported image");
    let bytes = await image.rotate().resize(256, 256, { fit: "inside", withoutEnlargement: true })
      .png().toBuffer();
    // A compressed WebP can expand beyond the upload budget when stored as PNG.
    // Bound the canonical representation too, so it is accepted on later reads.
    if (bytes.toString("base64").length + 22 > 200_000)
      bytes = await sharp(bytes).resize(192, 192, { fit: "inside" }).png().toBuffer();
    if (bytes.toString("base64").length + 22 > 200_000) throw new Error("Avatar output is too large");
    return { bytes, dataUrl: `data:image/png;base64,${bytes.toString("base64")}` };
  } catch {
    throw new ServiceError("Avatar image is invalid", 400);
  }
}
