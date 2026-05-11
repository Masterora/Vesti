type AvatarInput = {
  walletAddress?: string | null;
  displayName?: string | null;
  avatarImage?: string | null;
};

const avatarBackgrounds = ["#F7F0D8", "#DBF0FF", "#E8F6E1", "#FDE7DC", "#E8E3FF", "#FFE8F3"];
const avatarSkins = ["#F7D7B4", "#E9BC90", "#C98C64", "#8B5A3C"];
const avatarHairs = ["#1C2433", "#5C3D2E", "#7D5A50", "#A26D3D", "#2F5E4E", "#4B3F72"];
const avatarAccents = ["#FF7A59", "#2B7FFF", "#00A878", "#E0A100", "#D64D8B", "#5A4FCF"];
const avatarShadows = ["#D9CDB4", "#BED8EA", "#CFE3C9", "#E6CDC2", "#CEC8ED", "#F0CADB"];

function hashAvatarSeed(seed: string) {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function pickColor(palette: string[], hash: number, shift: number) {
  return palette[(hash >>> shift) % palette.length] ?? palette[0];
}

function pixelRect(x: number, y: number, width: number, height: number, fill: string) {
  return `<rect x="${x * 8}" y="${y * 8}" width="${width * 8}" height="${height * 8}" fill="${fill}" />`;
}

export function getProfileAvatarSeed(input: AvatarInput) {
  return `${input.walletAddress?.trim() || "guest"}:${input.displayName?.trim() || "anonymous"}`;
}

export function createPixelAvatarDataUrl(seed: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(createPixelAvatarSvg(seed))}`;
}

export function createPixelAvatarSvg(seed: string) {
  const hash = hashAvatarSeed(seed || "vesti");
  const background = pickColor(avatarBackgrounds, hash, 0);
  const shadow = pickColor(avatarShadows, hash, 4);
  const skin = pickColor(avatarSkins, hash, 8);
  const hair = pickColor(avatarHairs, hash, 12);
  const accent = pickColor(avatarAccents, hash, 16);
  const eye = (hash & 1) === 0 ? "#101828" : "#2D3748";
  const mouth = (hash & 2) === 0 ? accent : hair;
  const hairStyle = hash % 3;
  const eyeStyle = (hash >>> 2) % 3;
  const outfitStyle = (hash >>> 4) % 3;

  const shapes = [
    pixelRect(0, 0, 12, 12, shadow),
    pixelRect(1, 1, 10, 10, background),
    pixelRect(2, 3, 8, 6, skin),
    pixelRect(3, 9, 6, 1, skin),
    pixelRect(2, 10, 8, 2, accent)
  ];

  if (hairStyle === 0) {
    shapes.push(pixelRect(2, 2, 8, 2, hair), pixelRect(2, 4, 1, 2, hair), pixelRect(9, 4, 1, 2, hair));
  } else if (hairStyle === 1) {
    shapes.push(pixelRect(2, 2, 8, 1, hair), pixelRect(2, 3, 7, 1, hair), pixelRect(2, 4, 1, 2, hair), pixelRect(8, 3, 2, 3, hair));
  } else {
    shapes.push(pixelRect(2, 2, 8, 1, hair), pixelRect(2, 3, 8, 1, hair), pixelRect(2, 4, 2, 2, hair), pixelRect(8, 4, 2, 1, hair));
  }

  if (eyeStyle === 0) {
    shapes.push(pixelRect(4, 5, 1, 1, eye), pixelRect(7, 5, 1, 1, eye));
  } else if (eyeStyle === 1) {
    shapes.push(pixelRect(4, 5, 1, 1, eye), pixelRect(7, 5, 1, 1, eye), pixelRect(4, 6, 1, 1, eye), pixelRect(7, 6, 1, 1, eye));
  } else {
    shapes.push(pixelRect(4, 5, 2, 1, eye), pixelRect(6, 5, 2, 1, eye));
  }

  shapes.push(pixelRect(5, 7, 2, 1, mouth));

  if (outfitStyle === 0) {
    shapes.push(pixelRect(4, 10, 4, 2, "#F9FAFB"), pixelRect(5, 10, 2, 1, accent));
  } else if (outfitStyle === 1) {
    shapes.push(pixelRect(3, 10, 6, 2, accent), pixelRect(5, 10, 2, 1, "#F8FAFC"));
  } else {
    shapes.push(pixelRect(2, 10, 8, 2, accent), pixelRect(4, 10, 4, 1, "#111827"));
  }

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" shape-rendering="crispEdges">',
    ...shapes,
    "</svg>"
  ].join("");

  return svg;
}

export function buildStoredProfileAvatarUrl(walletAddress: string, avatarVersion: string) {
  const searchParams = new URLSearchParams({
    wallet: walletAddress,
    v: avatarVersion
  });

  return `/api/profile/avatar?${searchParams.toString()}`;
}

export function getProfileAvatarSrc(input: AvatarInput) {
  const avatarImage = input.avatarImage?.trim();

  if (avatarImage) {
    return avatarImage;
  }

  return createPixelAvatarDataUrl(getProfileAvatarSeed(input));
}