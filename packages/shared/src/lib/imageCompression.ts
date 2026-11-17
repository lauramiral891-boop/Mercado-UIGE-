/**
 * Utilitário de Compressão de Imagens no Cliente (≤800 KB)
 * Reduz resolução para máximo de 1280px e optimiza JPEG para poupar dados móveis no Uíge.
 */

const MAX_FILE_SIZE_BYTES = 800 * 1024; // 800 KB
const MAX_DIMENSION = 1280; // 1280px

export async function compressImage(file: File): Promise<{ blob: Blob; dataUrl: string; sizeKB: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height && width > MAX_DIMENSION) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else if (height > MAX_DIMENSION) {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Não foi possível processar a imagem."));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.82;

        const attemptCompression = () => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Erro ao comprimir imagem."));
                return;
              }

              if (blob.size > MAX_FILE_SIZE_BYTES && quality > 0.4) {
                quality -= 0.12;
                attemptCompression();
              } else {
                const dataUrl = canvas.toDataURL("image/jpeg", quality);
                resolve({
                  blob,
                  dataUrl,
                  sizeKB: Math.round(blob.size / 1024),
                });
              }
            },
            "image/jpeg",
            quality
          );
        };

        attemptCompression();
      };

      img.onerror = () => reject(new Error("Ficheiro de imagem inválido."));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error("Erro ao ler ficheiro de imagem."));
    reader.readAsDataURL(file);
  });
}

export const BANNER_TARGET_WIDTH = 1600;
export const BANNER_TARGET_HEIGHT = 900;
export const MAX_BANNER_IMAGE_BYTES = 300 * 1024; // 300 KB máximo

export interface BannerImageResult {
  blob: Blob;
  dataUrl: string;
  sizeKB: number;
  width: number;
  height: number;
  mimeType: "image/webp" | "image/jpeg";
}

function encodeCanvasBlob(
  canvas: HTMLCanvasElement,
  mimeType: "image/webp" | "image/jpeg",
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), mimeType, quality);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Redimensiona/corta ao centro (16:9) e comprime para WebP ou JPEG <= 300 KB.
 */
export async function compressSourceToBanner(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number
): Promise<BannerImageResult> {
  if (typeof document === "undefined") {
    throw new Error("Compressão de imagem indisponível fora do browser.");
  }

  const safeSw = Math.max(1, sourceWidth);
  const safeSh = Math.max(1, sourceHeight);
  const targetRatio = BANNER_TARGET_WIDTH / BANNER_TARGET_HEIGHT;
  const sourceRatio = safeSw / safeSh;

  let sx = 0;
  let sy = 0;
  let sw = safeSw;
  let sh = safeSh;

  if (sourceRatio > targetRatio) {
    sw = Math.round(safeSh * targetRatio);
    sx = Math.round((safeSw - sw) / 2);
  } else {
    sh = Math.round(safeSw / targetRatio);
    sy = Math.round((safeSh - sh) / 2);
  }

  const resolutions = [
    { w: BANNER_TARGET_WIDTH, h: BANNER_TARGET_HEIGHT },
    { w: 1280, h: 720 },
    { w: 960, h: 540 },
  ];

  let lastBlob: Blob | null = null;
  let lastMime: "image/webp" | "image/jpeg" = "image/jpeg";
  let lastQuality = 0.84;
  let lastWidth = BANNER_TARGET_WIDTH;
  let lastHeight = BANNER_TARGET_HEIGHT;
  let lastCanvas: HTMLCanvasElement | null = null;

  for (const res of resolutions) {
    const canvas = document.createElement("canvas");
    canvas.width = res.w;
    canvas.height = res.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Não foi possível processar a imagem do banner.");
    }
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, res.w, res.h);
    lastCanvas = canvas;
    lastWidth = res.w;
    lastHeight = res.h;

    const webpProbe = await encodeCanvasBlob(canvas, "image/webp", 0.84);
    const mimeType: "image/webp" | "image/jpeg" =
      webpProbe && webpProbe.type === "image/webp" ? "image/webp" : "image/jpeg";
    lastMime = mimeType;

    for (const quality of [0.84, 0.72, 0.6, 0.48, 0.36]) {
      const blob =
        quality === 0.84 && mimeType === "image/webp" && webpProbe
          ? webpProbe
          : await encodeCanvasBlob(canvas, mimeType, quality);
      if (blob) {
        lastBlob = blob;
        lastQuality = quality;
        if (blob.size <= MAX_BANNER_IMAGE_BYTES) {
          return {
            blob,
            dataUrl: canvas.toDataURL(mimeType, quality),
            sizeKB: Math.max(1, Math.round(blob.size / 1024)),
            width: res.w,
            height: res.h,
            mimeType,
          };
        }
      }
    }
  }

  if (!lastBlob || !lastCanvas) {
    throw new Error("Erro ao comprimir banner.");
  }

  return {
    blob: lastBlob,
    dataUrl: lastCanvas.toDataURL(lastMime, lastQuality),
    sizeKB: Math.max(1, Math.round(lastBlob.size / 1024)),
    width: lastWidth,
    height: lastHeight,
    mimeType: lastMime,
  };
}

/**
 * Comprime e redimensiona uma imagem de banner para 1600x900 px (16:9, WebP ou JPEG <= 300 KB)
 * usando corte proporcional centrado (cover).
 */
export async function compressBannerImage(file: File): Promise<BannerImageResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        compressSourceToBanner(img, img.width, img.height).then(resolve).catch(reject);
      };

      img.onerror = () => reject(new Error("Ficheiro de imagem de banner inválido."));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error("Erro ao ler ficheiro de imagem do banner."));
    reader.readAsDataURL(file);
  });
}
