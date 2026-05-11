import { ImageResponse } from "next/og";
import { BrandCard } from "@/lib/brand-image";
import { siteDescription, siteName } from "@/lib/site";

export const size = {
  width: 1200,
  height: 600
};

export const alt = `${siteName} Twitter image`;
export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(
    <BrandCard
      width={1200}
      height={600}
      eyebrow="Remote work escrow"
      title={siteName}
      subtitle={siteDescription}
    />,
    size
  );
}