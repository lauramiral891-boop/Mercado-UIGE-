import { Store, User } from "../types";

export const MAX_VIDEO_DURATION_SEC = 15;
export const MAX_PRODUCT_VIDEO_BYTES = 10 * 1024 * 1024; // 10 MB (artigos de comerciantes)
export const MAX_VIDEO_BYTES = MAX_PRODUCT_VIDEO_BYTES; // Alias para artigos (10 MB)

export const MAX_AD_VIDEO_DURATION_SEC = 30;
export const MAX_AD_VIDEO_BYTES = 20 * 1024 * 1024; // 20 MB (anúncios do admin)
export const AD_VIDEO_TARGET_BYTES = 8 * 1024 * 1024; // Alvo ~8 MB após compressão no dispositivo

export type PublishActionTarget = "publish" | "want_to_sell" | "login";

export interface VideoConstraintOptions {
  maxDurationSec?: number;
  maxBytes?: number;
  targetBytes?: number;
}

/**
 * Garante que apenas comerciantes aprovados (e não suspensos) abrem directamente a publicação de artigos.
 */
export function canMerchantPublishFloating(user: User | null, store?: Store | null): boolean {
  if (!user || user.role !== "comerciante") return false;
  if (user.isApproved !== true || user.isSuspended) return false;
  if (store && (store.isApproved === false || store.isSuspended)) return false;
  return true;
}

/**
 * Resolve o destino do botão Publicar na barra inferior:
 * - Visitante sem conta -> login
 * - Comerciante aprovado -> publish
 * - Cliente normal ou comerciante ainda em aprovação -> want_to_sell ("Quero vender")
 */
export function resolvePublishAction(user: User | null, store?: Store | null): PublishActionTarget {
  if (!user) return "login";
  if (canMerchantPublishFloating(user, store)) return "publish";
  return "want_to_sell";
}

/**
 * Valida regras estritas de duração e tamanho:
 * - Artigos de comerciantes: até 15 s e 10 MB
 * - Anúncios do admin: até 30 s e 20 MB (comprimidos no dispositivo para ~8 MB)
 */
export function validateVideoConstraints(
  durationSec: number,
  sizeBytes: number,
  opts?: VideoConstraintOptions
): { ok: boolean; error?: string } {
  const maxDurationSec = opts?.maxDurationSec ?? MAX_VIDEO_DURATION_SEC;
  const maxBytes = opts?.maxBytes ?? MAX_PRODUCT_VIDEO_BYTES;
  const maxMbLabel = Math.round(maxBytes / (1024 * 1024));

  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return { ok: false, error: "Não foi possível ler a duração do vídeo." };
  }
  if (durationSec > maxDurationSec) {
    return {
      ok: false,
      error: `O vídeo tem ${Math.ceil(durationSec)}s. O limite máximo é ${maxDurationSec} segundos.`,
    };
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, error: "Ficheiro de vídeo inválido ou vazio." };
  }
  if (sizeBytes > maxBytes) {
    return {
      ok: false,
      error: `O vídeo excede ${maxMbLabel} MB. Escolhe um vídeo mais curto ou com menor resolução.`,
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

export function computeTargetVideoBitrate(durationSec: number, targetBytes: number): number {
  const safeDuration = Math.max(1, durationSec);
  const rawBps = Math.floor((targetBytes * 8 * 0.85) / safeDuration);
  return Math.max(450_000, Math.min(2_000_000, rawBps));
}

async function transcodeVideoLowerBitrate(
  file: File,
  durationSec: number,
  maxDurationSec: number,
  targetBytes: number
): Promise<Blob> {
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
      const maxW = 720;
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

      const videoBitsPerSecond = computeTargetVideoBitrate(durationSec, targetBytes);
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond })
        : new MediaRecorder(stream, { videoBitsPerSecond });

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
          const maxMs = Math.min(maxDurationSec, Math.max(1, durationSec)) * 1000 + 250;
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
 * Valida duração e tamanho, e comprime no telemóvel antes do envio quando excede o tamanho-alvo.
 */
export async function compressVideoOnDevice(
  file: File,
  opts?: VideoConstraintOptions
): Promise<{
  blob: Blob;
  previewUrl: string;
  durationSec: number;
  sizeMB: number;
}> {
  const maxDurationSec = opts?.maxDurationSec ?? MAX_VIDEO_DURATION_SEC;
  const maxBytes = opts?.maxBytes ?? MAX_PRODUCT_VIDEO_BYTES;
  const targetBytes = opts?.targetBytes ?? Math.min(maxBytes, AD_VIDEO_TARGET_BYTES);
  const maxMbLabel = Math.round(maxBytes / (1024 * 1024));

  const durationSec = await getVideoDuration(file);
  if (durationSec > maxDurationSec) {
    throw new Error(
      `O vídeo tem ${Math.ceil(durationSec)}s. O limite máximo é ${maxDurationSec} segundos.`
    );
  }

  let finalBlob: Blob = file;
  if (file.size > targetBytes) {
    try {
      const compressed = await transcodeVideoLowerBitrate(
        file,
        durationSec,
        maxDurationSec,
        targetBytes
      );
      if (compressed.size > 0 && compressed.size < file.size) {
        finalBlob = compressed;
      }
    } catch (err) {
      if (file.size > maxBytes) {
        throw err;
      }
      finalBlob = file;
    }
  }

  const check = validateVideoConstraints(durationSec, finalBlob.size, {
    maxDurationSec,
    maxBytes,
  });
  if (!check.ok) {
    throw new Error(
      check.error ||
        `O vídeo excede os limites permitidos (${maxDurationSec} s e ${maxMbLabel} MB).`
    );
  }

  return {
    blob: finalBlob,
    previewUrl: URL.createObjectURL(finalBlob),
    durationSec: Number(durationSec.toFixed(1)),
    sizeMB: Number((finalBlob.size / (1024 * 1024)).toFixed(2)),
  };
}
