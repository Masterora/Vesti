import Image from "next/image";
import { getProfileAvatarSrc } from "@/lib/avatar";
import { cn } from "@/lib/utils";

type ProfileAvatarProps = {
  walletAddress?: string | null;
  displayName?: string | null;
  avatarImage?: string | null;
  className?: string;
  imageClassName?: string;
  loading?: "eager" | "lazy";
  sizes?: string;
};

export function ProfileAvatar({
  walletAddress,
  displayName,
  avatarImage,
  className,
  imageClassName,
  loading = "lazy",
  sizes = "64px"
}: ProfileAvatarProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border/70 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]",
        className
      )}
    >
      <Image
        src={getProfileAvatarSrc({ walletAddress, displayName, avatarImage })}
        alt=""
        loading={loading}
        aria-hidden="true"
        unoptimized
        fill
        sizes={sizes}
        draggable={false}
        className={cn("h-full w-full object-cover", imageClassName)}
        style={{ imageRendering: "pixelated" }}
      />
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/5" />
    </div>
  );
}