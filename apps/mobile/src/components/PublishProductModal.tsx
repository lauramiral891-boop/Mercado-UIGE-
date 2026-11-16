import React, { useState } from "react";
import {
  X,
  Camera,
  Video,
  Upload,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Store as StoreIcon,
} from "lucide-react";
import {
  Category,
  Product,
  Store,
  SystemConfig,
  User,
  UIGE_MUNICIPALITIES,
  MAX_PRODUCT_VIDEO_BYTES,
  MAX_VIDEO_DURATION_SEC,
  compressImage,
  compressVideoOnDevice,
  productRepo,
  uploadMediaFile,
  isSupabaseConfigured,
  translateErrorMessage,
} from "@mercado-uige/shared";

interface PublishProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  myStore: Store | null;
  categories: Category[];
  systemConfig: SystemConfig;
  onPublished: (product: Product) => Promise<void> | void;
  onGoToSeller: () => void;
  showToast: (msg: string) => void;
}

interface CompressedPhotoItem {
  id: string;
  dataUrl: string;
  blob: Blob;
  fileName: string;
  sizeKB: number;
}

export const PublishProductModal: React.FC<PublishProductModalProps> = ({
  isOpen,
  onClose,
  user,
  myStore,
  categories,
  systemConfig,
  onPublished,
  onGoToSeller,
  showToast,
}) => {
  const [mediaKind, setMediaKind] = useState<"imagem" | "video">("imagem");
  const [photos, setPhotos] = useState<CompressedPhotoItem[]>([]);
  const [videoState, setVideoState] = useState<{
    blob: Blob;
    previewUrl: string;
    fileName: string;
    durationSec: number;
    sizeMB: number;
  } | null>(null);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [condition, setCondition] = useState<"novo" | "usado">("novo");
  const [categoryName, setCategoryName] = useState(categories[0]?.name || "Electrónicos");
  const [municipality, setMunicipality] = useState(
    myStore?.municipality || user?.municipality || "Uíge"
  );
  const [stock, setStock] = useState("1");
  const [description, setDescription] = useState("");

  const [processingMedia, setProcessingMedia] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen || !user) return null;

  const resetForm = () => {
    setMediaKind("imagem");
    setPhotos([]);
    setVideoState(null);
    setName("");
    setPrice("");
    setCondition("novo");
    setCategoryName(categories[0]?.name || "Electrónicos");
    setStock("1");
    setDescription("");
    setErrorMsg("");
  };

  const handleSelectPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrorMsg("");
    setProcessingMedia(true);
    try {
      const remainingSlots = Math.max(0, 4 - photos.length);
      const selected = Array.from(files).slice(0, remainingSlots);
      const next: CompressedPhotoItem[] = [];
      for (const file of selected) {
        const res = await compressImage(file);
        next.push({
          id: `ph_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          dataUrl: res.dataUrl,
          blob: res.blob,
          fileName: file.name || `artigo_${Date.now()}.jpg`,
          sizeKB: res.sizeKB,
        });
      }
      setPhotos((prev) => [...prev, ...next].slice(0, 4));
      if (next.length > 0) {
        showToast(`${next.length} fotografia(s) comprimida(s) ✓`);
      }
    } catch (err: unknown) {
      setErrorMsg(translateErrorMessage(err, "Não foi possível comprimir a fotografia."));
    } finally {
      setProcessingMedia(false);
    }
  };

  const handleSelectVideo = async (file: File | undefined) => {
    if (!file) return;
    setErrorMsg("");
    setProcessingMedia(true);
    try {
      const compressed = await compressVideoOnDevice(file, {
        maxDurationSec: MAX_VIDEO_DURATION_SEC,
        maxBytes: MAX_PRODUCT_VIDEO_BYTES,
        targetBytes: 8 * 1024 * 1024,
      });
      setVideoState({
        blob: compressed.blob,
        previewUrl: compressed.previewUrl,
        fileName: file.name.replace(/\.[^.]+$/, "") + ".webm",
        durationSec: compressed.durationSec,
        sizeMB: compressed.sizeMB,
      });
      showToast(`Vídeo pronto (${compressed.durationSec}s · ${compressed.sizeMB} MB) ✓`);
    } catch (err: unknown) {
      setVideoState(null);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "O vídeo deve ter até 15 segundos e no máximo 10 MB."
      );
    } finally {
      setProcessingMedia(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!myStore) {
      setErrorMsg("Regista primeiro a tua loja no Painel do Comerciante.");
      return;
    }

    const numericPrice = Number(price);
    if (!name.trim() || !Number.isFinite(numericPrice) || numericPrice <= 0) {
      setErrorMsg("Preenche o nome e um preço válido em Kz.");
      return;
    }

    if (mediaKind === "imagem" && photos.length === 0) {
      setErrorMsg("Adiciona pelo menos 1 fotografia do artigo (ou troca para Vídeo).");
      return;
    }
    if (mediaKind === "video" && !videoState) {
      setErrorMsg("Carrega um vídeo até 15 s e 10 MB (ou troca para Fotos).");
      return;
    }

    setSubmitting(true);
    try {
      const uploadedImages: string[] = [];
      let uploadedVideoUrl: string | null = null;

      if (mediaKind === "imagem") {
        for (const ph of photos) {
          if (isSupabaseConfigured && navigator.onLine) {
            const { url, error } = await uploadMediaFile(ph.blob, ph.fileName, "produtos");
            if (error || !url) {
              throw error || new Error("Falha ao enviar fotografia.");
            }
            uploadedImages.push(url);
          } else {
            uploadedImages.push(ph.dataUrl);
          }
        }
      } else if (videoState) {
        if (isSupabaseConfigured && navigator.onLine) {
          const { url, error } = await uploadMediaFile(
            videoState.blob,
            videoState.fileName,
            "produtos_video"
          );
          if (error || !url) {
            throw error || new Error("Falha ao carregar o vídeo do artigo.");
          }
          uploadedVideoUrl = url;
        } else {
          uploadedVideoUrl = videoState.previewUrl;
        }
      }

      const created = await productRepo.create({
        sellerId: user.id,
        storeId: myStore.id,
        storeName: myStore.name,
        storeType: myStore.storeType,
        name: name.trim(),
        price: numericPrice,
        stock: Math.max(1, Number(stock || 1)),
        condition,
        categoryName,
        municipality,
        description: description.trim(),
        image: uploadedImages[0] || myStore.facadeImage || myStore.logo || "",
        images: uploadedImages,
        videoUrl: uploadedVideoUrl,
        mediaType: mediaKind,
        isApproved: !systemConfig.requireProductApproval,
      });

      const needsApproval = Boolean(systemConfig.requireProductApproval) || created.isApproved === false;
      showToast(
        needsApproval
          ? "Artigo enviado! Aguarda aprovação do administrador para aparecer no catálogo."
          : "Artigo publicado no Mercado Uíge ✓"
      );

      resetForm();
      await onPublished(created);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(translateErrorMessage(err, "Não foi possível publicar o artigo. Tenta novamente."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-3 sm:p-4 bg-black/75 backdrop-blur-md anim-fadeUp"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl p-4 sm:p-6 border shadow-2xl anim-pop max-h-[92vh] overflow-y-auto"
        style={{
          backgroundColor: "var(--surface)",
          borderColor: "var(--border)",
          color: "var(--text-primary)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 className="font-black text-base sm:text-lg">Publicar Novo Artigo</h2>
            <p className="text-[11px] opacity-70">
              {myStore ? `${myStore.name} (${myStore.code || "Loja"})` : "Publicação rápida para comerciante aprovado"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] rounded-full border grid place-items-center hover:bg-slate-500/10 cursor-pointer shrink-0"
            style={{ borderColor: "var(--border)" }}
            aria-label="Fechar publicação de artigo"
          >
            <X size={18} />
          </button>
        </div>

        {!myStore ? (
          <div className="mt-4 p-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 space-y-3 text-xs">
            <div className="flex items-start gap-2 text-amber-300 font-bold">
              <StoreIcon size={16} className="shrink-0 mt-0.5" />
              <span>Antes de publicar um artigo, regista os dados da tua loja ou banca no Uíge.</span>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onGoToSeller();
              }}
              className="w-full min-h-[44px] rounded-xl font-black text-slate-950 cursor-pointer"
              style={{ backgroundColor: "var(--accent)" }}
            >
              Registar a Minha Loja
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-xs">
            {systemConfig.requireProductApproval && (
              <div className="p-2.5 rounded-xl bg-[#246BFD]/15 border border-[#246BFD]/35 text-[11px] text-blue-200 flex items-start gap-2">
                <CheckCircle2 size={14} className="text-[#B7F34A] shrink-0 mt-0.5" />
                <span>
                  A moderação está activa: após enviar, o artigo aguarda aprovação do administrador antes de ficar visível.
                </span>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/35 text-red-400 font-bold flex items-start gap-2">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Selector de Mídia: Fotos ou Vídeo */}
            <div className="space-y-2">
              <span className="font-bold block">Fotos ou Vídeo do Artigo *</span>
              <div
                className="grid grid-cols-2 p-1 rounded-2xl border gap-1"
                style={{ backgroundColor: "var(--surface-secondary)", borderColor: "var(--border)" }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMediaKind("imagem");
                    setErrorMsg("");
                  }}
                  className={`min-h-[44px] rounded-xl font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                    mediaKind === "imagem" ? "bg-[#246BFD] text-white" : "opacity-75"
                  }`}
                >
                  <Camera size={15} />
                  <span>Fotos (até 4)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMediaKind("video");
                    setErrorMsg("");
                  }}
                  className={`min-h-[44px] rounded-xl font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                    mediaKind === "video" ? "bg-[#246BFD] text-white" : "opacity-75"
                  }`}
                >
                  <Video size={15} />
                  <span>Vídeo (≤ 15s / 10MB)</span>
                </button>
              </div>

              {mediaKind === "imagem" ? (
                <div className="space-y-2">
                  {photos.length < 4 && (
                    <label
                      className="min-h-[48px] p-3 rounded-2xl border border-dashed flex items-center justify-center gap-2 cursor-pointer hover:border-[#246BFD]"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <Upload size={16} className="text-[#246BFD]" />
                      <span className="font-bold">
                        {processingMedia
                          ? "A comprimir fotografias..."
                          : `Carregar fotos (${photos.length}/4 · compressão automática)`}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={processingMedia}
                        onChange={(e) => handleSelectPhotos(e.target.files)}
                        className="hidden"
                      />
                    </label>
                  )}

                  {photos.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {photos.map((ph) => (
                        <div key={ph.id} className="relative aspect-square rounded-xl overflow-hidden border border-[#26354B]">
                          <img src={ph.dataUrl} alt="Pré-visualização" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setPhotos((prev) => prev.filter((item) => item.id !== ph.id))}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/75 text-white grid place-items-center cursor-pointer"
                            aria-label="Remover fotografia"
                          >
                            <Trash2 size={12} />
                          </button>
                          <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/75 text-[9px] text-white font-bold">
                            {ph.sizeKB}KB
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <label
                    className="min-h-[48px] p-3 rounded-2xl border border-dashed flex items-center justify-center gap-2 cursor-pointer hover:border-[#246BFD]"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <Video size={16} className="text-[#B7F34A]" />
                    <span className="font-bold">
                      {processingMedia
                        ? "A comprimir e validar vídeo (≤ 15s, 10MB)..."
                        : videoState
                        ? `Vídeo pronto (${videoState.durationSec}s · ${videoState.sizeMB} MB) — Trocar`
                        : "Escolher vídeo curto (máx. 15s e 10 MB)"}
                    </span>
                    <input
                      type="file"
                      accept="video/*"
                      disabled={processingMedia}
                      onChange={(e) => handleSelectVideo(e.target.files?.[0])}
                      className="hidden"
                    />
                  </label>

                  {videoState && (
                    <div className="relative rounded-2xl overflow-hidden border border-[#26354B] bg-black">
                      <video
                        src={videoState.previewUrl}
                        controls
                        muted
                        playsInline
                        className="w-full max-h-48 object-contain"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Nome */}
            <div>
              <label className="block font-bold mb-1">Nome do Artigo *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Samsung Galaxy A15 ou Saco de Fuba 25Kg"
                className="w-full min-h-[44px] px-3 rounded-xl border bg-transparent font-medium outline-none focus:border-[#246BFD]"
                style={{ borderColor: "var(--border)" }}
              />
            </div>

            {/* Preço e Stock */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold mb-1">Preço em Kz *</label>
                <input
                  type="number"
                  required
                  min="50"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="15000"
                  className="w-full min-h-[44px] px-3 rounded-xl border bg-transparent font-bold outline-none focus:border-[#246BFD]"
                  style={{ borderColor: "var(--border)" }}
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Stock</label>
                <input
                  type="number"
                  min="1"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border bg-transparent font-bold outline-none focus:border-[#246BFD]"
                  style={{ borderColor: "var(--border)" }}
                />
              </div>
            </div>

            {/* Condição Novo / Usado */}
            <div>
              <label className="block font-bold mb-1">Estado do Artigo *</label>
              <div
                className="grid grid-cols-2 p-1 rounded-2xl border gap-1"
                style={{ backgroundColor: "var(--surface-secondary)", borderColor: "var(--border)" }}
              >
                <button
                  type="button"
                  onClick={() => setCondition("novo")}
                  className={`min-h-[44px] rounded-xl font-black cursor-pointer ${
                    condition === "novo" ? "bg-[#B7F34A] text-slate-950" : "opacity-75"
                  }`}
                >
                  Novo
                </button>
                <button
                  type="button"
                  onClick={() => setCondition("usado")}
                  className={`min-h-[44px] rounded-xl font-black cursor-pointer ${
                    condition === "usado" ? "bg-amber-400 text-slate-950" : "opacity-75"
                  }`}
                >
                  Usado
                </button>
              </div>
            </div>

            {/* Categoria e Município */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold mb-1">Categoria *</label>
                <select
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border font-bold outline-none"
                  style={{
                    borderColor: "var(--border)",
                    backgroundColor: "var(--surface-secondary)",
                    color: "var(--text-primary)",
                  }}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.name} className="bg-slate-900 text-white">
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1">Município</label>
                <select
                  value={municipality}
                  onChange={(e) => setMunicipality(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border font-bold outline-none"
                  style={{
                    borderColor: "var(--border)",
                    backgroundColor: "var(--surface-secondary)",
                    color: "var(--text-primary)",
                  }}
                >
                  {UIGE_MUNICIPALITIES.map((m) => (
                    <option key={m} value={m} className="bg-slate-900 text-white">
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block font-bold mb-1">Descrição curta</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalhes, cor, garantia ou ponto de entrega..."
                className="w-full p-2.5 rounded-xl border bg-transparent outline-none focus:border-[#246BFD]"
                style={{ borderColor: "var(--border)" }}
              />
            </div>

            <button
              type="submit"
              disabled={processingMedia || submitting}
              className="w-full min-h-[48px] rounded-2xl font-black text-sm text-slate-950 shadow-lg cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundColor: "var(--accent)" }}
            >
              <CheckCircle2 size={17} />
              <span>{submitting ? "A publicar artigo..." : "Publicar Artigo"}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
