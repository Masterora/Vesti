import { ImageResponse } from "next/og";
import { BrandCard } from "@/lib/brand-image";
import { siteDescription, siteName } from "@/lib/site";

export const size = {
  width: 1200,
  height: 630
};

export const alt = `${siteName} Open Graph image`;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <BrandCard
      width={1200}
      height={630}
      eyebrow="USDC milestone escrow"
      title={siteName}
      subtitle={siteDescription}
    />,
    size
  );
}