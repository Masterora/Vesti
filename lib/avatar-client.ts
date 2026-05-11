const pixelAvatarOutputSize = 96;
const pixelAvatarGridSize = 24;

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Failed to read avatar image"));
    };

    reader.onerror = () => reject(new Error("Failed to read avatar image"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load avatar image"));
    image.src = src;
  });
}

export async function convertImageFileToPixelAvatar(file: File) {
  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const cropSize = Math.min(image.width, image.height);
  const sourceX = (image.width - cropSize) / 2;
  const sourceY = (image.height - cropSize) / 2;
  const pixelCanvas = document.createElement("canvas");
  const outputCanvas = document.createElement("canvas");
  const pixelContext = pixelCanvas.getContext("2d");
  const outputContext = outputCanvas.getContext("2d");

  if (!pixelContext || !outputContext) {
    throw new Error("Canvas is not available for avatar processing");
  }

  pixelCanvas.width = pixelAvatarGridSize;
  pixelCanvas.height = pixelAvatarGridSize;
  pixelContext.imageSmoothingEnabled = true;
  pixelContext.drawImage(image, sourceX, sourceY, cropSize, cropSize, 0, 0, pixelAvatarGridSize, pixelAvatarGridSize);

  outputCanvas.width = pixelAvatarOutputSize;
  outputCanvas.height = pixelAvatarOutputSize;
  outputContext.imageSmoothingEnabled = false;
  outputContext.drawImage(pixelCanvas, 0, 0, pixelAvatarOutputSize, pixelAvatarOutputSize);

  return outputCanvas.toDataURL("image/png");
}