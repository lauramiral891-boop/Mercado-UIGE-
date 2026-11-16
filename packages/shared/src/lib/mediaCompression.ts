import { Store, User } from "../types";

export const MAX_VIDEO_DURATION_SEC = 15;
export const MAX_VIDEO_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Garante que apenas comerciantes aprovados (e não suspensos) vêem o botão flutuante "+ Publicar".
 */
export function canMerchantPublishFloating(user: User | null, store?: Store | null): boolean {
  if (!user || user.role !== "comerciante") return false;
  if (user.isApproved !== true || user.isSuspended) return false;
  if (store && (store.isApproved === false || store.isSuspended)) return false;
  return true;
}

/**
 * Valida regras estritas de duração (<= 15s) e tamanho (<= 5 MB) para vídeos de artigos e anúncios.
 */
export function validateVideoConstraints(
  durationSec: number,
  sizeBytes: number
): { ok: boolean; error?: string } {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return { ok: false, error: "Não foi possível ler a duração do vídeo." };
  }
  if (durationSec > MAX_VIDEO_DURATION_SEC) {
    return {
      ok: false,
      error: `O vídeo tem ${Math.ceil(durationSec)}s. O limite máximo é ${MAX_VIDEO_DURATION_SEC} segundos.`,
    };
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, error: "Ficheiro de vídeo inválido ou vazio." };
  }
  if (sizeBytes > MAX_VIDEO_BYTES) {
    return {
      ok: false,
      error: "O vídeo comprimido excede 5 MB. Escolhe um vídeo mais curto ou com menor resolução.",
    };
  }
  return { ok: true };
}

export async function getVideoDuration(file: File | Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined" || typeof URL === "undefined") {
      reject(new Error("Ambiente sem suporte para leitura de vídeo."));
      return;
    }
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    video.preload = "metadata";
    video.muted = true;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
    };

    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      cleanup();
      resolve(duration);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Formato de vídeo não suportado neste dispositivo."));
    };

    video.src = objectUrl;
  });
}

async function transcodeVideoLowerBitrate(file: File, durationSec: number): Promise<Blob> {
  if (
    typeof document === "undefined" ||
    typeof MediaRecorder === "undefined" ||
    typeof HTMLCanvasElement === "undefined"
  ) {
    throw new Error("Compressão automática indisponível neste dispositivo.");
  }

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.pause();
    };

    video.onloadeddata = () => {
      const srcW = video.videoWidth || 640;
      const srcH = video.videoHeight || 360;
      const maxW = 640;
      const scale = srcW > maxW ? maxW / srcW : 1;
      const w = Math.max(240, Math.round(srcW * scale));
      const h = Math.max(180, Math.round(srcH * scale));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx || typeof (canvas as any).captureStream !== "function") {
        cleanup();
        reject(new Error("Compressão automática indisponível neste dispositivo."));
        return;
      }

      const stream: MediaStream = (canvas as any).captureStream(24);
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
        ? "video/webm;codecs=vp8"
        : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "";

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 750_000 })
        : new MediaRecorder(stream, { videoBitsPerSecond: 750_000 });

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      recorder.onstop = () => {
        cleanup();
        const blob = new Blob(chunks, { type: mimeType || "video/webm" });
        resolve(blob);
      };

      recorder.onerror = () => {
        cleanup();
        reject(new Error("Falha ao comprimir o vídeo no dispositivo."));
      };

      let rafId = 0;
      const drawFrame = () => {
        if (!video.paused && !video.ended) {
          ctx.drawImage(video, 0, 0, w, h);
          rafId = requestAnimationFrame(drawFrame);
        }
      };

      video.onended = () => {
        cancelAnimationFrame(rafId);
        if (recorder.state !== "inactive") recorder.stop();
      };

      recorder.start(250);
      video
        .play()
        .then(() => {
          drawFrame();
          const maxMs = Math.min(MAX_VIDEO_DURATION_SEC, Math.max(1, durationSec)) * 1000 + 250;
          setTimeout(() => {
            cancelAnimationFrame(rafId);
            if (recorder.state !== "inactive") recorder.stop();
          }, maxMs);
        })
        .catch(() => {
          cancelAnimationFrame(rafId);
          if (recorder.state !== "inactive") recorder.stop();
          cleanup();
          reject(new Error("Não foi possível reproduzir o vídeo para compressão."));
        });
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Não foi possível ler o vídeo selecionado."));
    };
  });
}

/**
 * Valida duração (<= 15s), comprime no telemóvel quando > 5 MB e garante limite final <= 5 MB.
 */
export async function compressVideoOnDevice(file: File): Promise<{
  blob: Blob;
  previewUrl: string;
  durationSec: number;
  sizeMB: number;
}> {
  const durationSec = await getVideoDuration(file);
  if (durationSec > MAX_VIDEO_DURATION_SEC) {
    throw new Error(
      `O vídeo tem ${Math.ceil(durationSec)}s. O limite máximo é ${MAX_VIDEO_DURATION_SEC} segundos.`
    );
  }

  let finalBlob: Blob = file;
  if (file.size > MAX_VIDEO_BYTES) {
    finalBlob = await transcodeVideoLowerBitrate(file, durationSec);
  }

  const check = validateVideoConstraints(durationSec, finalBlob.size);
  if (!check.ok) {
    throw new Error(check.error || "O vídeo excede os limites permitidos (15 s e 5 MB).");
  }

  return {
    blob: finalBlob,
    previewUrl: URL.createObjectURL(finalBlob),
    durationSec: Number(durationSec.toFixed(1)),
    sizeMB: Number((finalBlob.size / (1024 * 1024)).toFixed(2)),
  };
}
