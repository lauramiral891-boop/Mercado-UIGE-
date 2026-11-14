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
