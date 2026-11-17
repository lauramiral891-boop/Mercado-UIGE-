import React, { useMemo, useState } from "react";
import { Camera, CheckCircle2, Image as ImageIcon, Lock, Star, Trash2 } from "lucide-react";
import {
  Avatar,
  ProductReview,
  ReviewFilterMode,
  SafeImage,
  StoreReview,
  User,
  compressImage,
  computeReviewStats,
  filterReviews,
  fmtDate,
  uploadMediaFile,
} from "@mercado-uige/shared";
import { ImageGalleryModal } from "./ImageGalleryModal";

export type ReviewRecord = StoreReview | ProductReview;

interface ReviewsSectionProps {
  title?: string;
  reviews: ReviewRecord[];
  currentUser: User | null;
  canReview: boolean;
  emptyEligibilityHint?: string;
  onRequireAuth?: () => void;
  onSubmitReview?: (payload: {
    stars: number;
    comment: string;
    photos: string[];
  }) => Promise<void>;
}

export const ReviewsSection: React.FC<ReviewsSectionProps> = ({
  title = "Avaliações",
  reviews,
  currentUser,
  canReview,
  emptyEligibilityHint = "Apenas clientes com encomenda entregue podem publicar avaliação.",
  onRequireAuth,
  onSubmitReview,
}) => {
  const [filter, setFilter] = useState<ReviewFilterMode>("todas");
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [pendingPhotos, setPendingPhotos] = useState<
    { previewUrl: string; uploadedUrl: string }[]
  >([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [galleryState, setGalleryState] = useState<{
    images: string[];
    index: number;
    title: string;
  } | null>(null);

  const stats = useMemo(() => computeReviewStats(reviews), [reviews]);
  const visibleReviews = useMemo(() => filterReviews(reviews, filter), [reviews, filter]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    const remaining = Math.max(0, 3 - pendingPhotos.length);
    if (remaining === 0) return;

    setUploadingPhoto(true);
    setFormError(null);
    try {
      const additions: { previewUrl: string; uploadedUrl: string }[] = [];
      for (const f of files.slice(0, remaining)) {
        const compressed = await compressImage(f);
        const { url } = await uploadMediaFile(compressed.blob, f.name || "avaliacao.jpg", "produtos");
        additions.push({
          previewUrl: compressed.dataUrl,
          uploadedUrl: url || compressed.dataUrl,
        });
      }
      setPendingPhotos((prev) => [...prev, ...additions].slice(0, 3));
    } catch {
      setFormError("Não foi possível processar a fotografia seleccionada.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSubmitReview || !canReview) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await onSubmitReview({
        stars,
        comment: comment.trim(),
        photos: pendingPhotos.map((p) => p.uploadedUrl),
      });
      setComment("");
      setPendingPhotos([]);
      setStars(5);
    } catch (err: any) {
      setFormError(err?.message || "Não foi possível publicar a avaliação.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      data-testid="reviews-section"
      className="rounded-2xl border p-4 space-y-4"
      style={{
        backgroundColor: "var(--rbw-surface)",
        borderColor: "var(--rbw-border)",
        color: "var(--rbw-text)",
      }}
    >
      {/* Header + Resumo */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black tracking-tight">{title}</h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--rbw-muted)" }}>
            {stats.total > 0
              ? `${stats.total} avaliação${stats.total > 1 ? "ões" : ""} de compras entregues`
              : "Ainda sem avaliações"}
          </p>
        </div>

        <div className="text-right shrink-0">
          <div className="flex items-center justify-end gap-1">
            <Star size={16} className={stats.total > 0 ? "text-red-600 fill-red-600" : "opacity-30"} />
            <span className="text-xl font-black tabular-nums">
              {stats.total > 0 ? stats.average.toFixed(1) : "0.0"}
            </span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--rbw-muted)" }}>
            de 5.0
          </span>
        </div>
      </div>

      {/* Barras de estrelas (5★ -> 1★) */}
      <div className="space-y-1.5">
        {stats.breakdown.map((row) => (
          <div key={row.stars} className="flex items-center gap-2 text-xs">
            <span className="w-8 font-bold tabular-nums shrink-0">{row.stars} ★</span>
            <div
              className="flex-1 h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: "var(--rbw-surface-2)" }}
            >
              <div
                className="h-full rounded-full bg-red-600 transition-all duration-300"
                style={{ width: `${row.percent}%` }}
              />
            </div>
            <span
              className="w-8 text-right text-[11px] font-semibold tabular-nums shrink-0"
              style={{ color: "var(--rbw-muted)" }}
            >
              {row.count}
            </span>
          </div>
        ))}
      </div>

      {/* Filtros: Todas / Com fotos / Verificadas */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
        {(
          [
            { id: "todas", label: `Todas (${stats.total})` },
            { id: "fotos", label: `Com fotos (${stats.withPhotosCount})` },
            { id: "verificadas", label: `Verificadas (${stats.verifiedCount})` },
          ] as { id: ReviewFilterMode; label: string }[]
        ).map((tab) => {
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold border whitespace-nowrap cursor-pointer transition-colors ${
                active
                  ? "bg-red-600 text-white border-red-600"
                  : "hover:border-red-600/50"
              }`}
              style={
                active
                  ? undefined
                  : {
                      backgroundColor: "var(--rbw-surface-2)",
                      borderColor: "var(--rbw-border)",
                      color: "var(--rbw-text)",
                    }
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Formulário restrito a clientes com encomenda entregue */}
      {onSubmitReview && (
        <div
          className="rounded-xl border p-3 space-y-2.5"
          style={{
            backgroundColor: "var(--rbw-surface-2)",
            borderColor: "var(--rbw-border)",
          }}
        >
          {!currentUser ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 font-medium" style={{ color: "var(--rbw-muted)" }}>
                <Lock size={14} className="shrink-0 text-red-600" />
                Inicia sessão para avaliar após receberes a encomenda.
              </span>
              {onRequireAuth && (
                <button
                  type="button"
                  onClick={onRequireAuth}
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-bold text-xs cursor-pointer"
                >
                  Entrar
                </button>
              )}
            </div>
          ) : !canReview ? (
            <div
              data-testid="review-locked-notice"
              className="flex items-start gap-2 text-xs font-medium"
              style={{ color: "var(--rbw-muted)" }}
            >
              <Lock size={14} className="shrink-0 mt-0.5 text-red-600" />
              <span>{emptyEligibilityHint}</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black">Deixa a tua avaliação verificada</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setStars(n)}
                      className="p-1 cursor-pointer"
                      aria-label={`${n} estrelas`}
                    >
                      <Star
                        size={18}
                        className={n <= stars ? "text-red-600 fill-red-600" : "opacity-30"}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Partilha a tua experiência real com o produto ou atendimento..."
                className="w-full rounded-xl border px-3 py-2 text-xs outline-none focus:border-red-600 bg-transparent"
                style={{ borderColor: "var(--rbw-border)" }}
              />

              {pendingPhotos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pendingPhotos.map((ph, idx) => (
                    <div key={idx} className="relative w-14 h-14 rounded-lg overflow-hidden border border-red-600/40">
                      <img src={ph.previewUrl} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setPendingPhotos((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/80 text-white grid place-items-center cursor-pointer"
                        aria-label="Remover foto da avaliação"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {formError && <p className="text-xs font-bold text-red-500">{formError}</p>}

              <div className="flex items-center justify-between gap-2">
                <label
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer ${
                    pendingPhotos.length >= 3 || uploadingPhoto ? "opacity-50 pointer-events-none" : ""
                  }`}
                  style={{ borderColor: "var(--rbw-border)" }}
                >
                  <Camera size={14} className="text-red-600" />
                  <span>{uploadingPhoto ? "A carregar..." : `Adicionar fotos (${pendingPhotos.length}/3)`}</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={pendingPhotos.length >= 3 || uploadingPhoto}
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>

                <button
                  type="submit"
                  disabled={submitting || uploadingPhoto}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs cursor-pointer disabled:opacity-50"
                >
                  {submitting ? "A enviar..." : "Publicar avaliação"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Lista de Avaliações */}
      {visibleReviews.length === 0 ? (
        <div
          data-testid="reviews-empty-state"
          className="py-6 text-center space-y-1 border-t"
          style={{ borderColor: "var(--rbw-border)" }}
        >
          <ImageIcon size={24} className="mx-auto opacity-40" />
          <p className="text-xs font-bold">
            {reviews.length === 0
              ? "Ainda sem avaliações"
              : filter === "fotos"
              ? "Nenhuma avaliação com fotografias"
              : "Nenhuma avaliação verificada"}
          </p>
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: "var(--rbw-border)" }}>
          {visibleReviews.map((rev) => {
            const photos = Array.isArray(rev.photos) ? rev.photos.filter(Boolean) : [];
            return (
              <article key={rev.id} className="py-3 first:pt-1 last:pb-0 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar src={rev.userAvatar} name={rev.userName || "Cliente Uíge"} size="sm" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-black truncate">
                          {rev.userName || "Cliente Uíge"}
                        </span>
                        {rev.verifiedPurchase && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-red-600">
                            <CheckCircle2 size={11} /> Compra verificada
                          </span>
                        )}
                      </div>
                      <span className="text-[11px]" style={{ color: "var(--rbw-muted)" }}>
                        {fmtDate(rev.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0" aria-label={`${rev.stars} estrelas`}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        size={12}
                        className={s <= rev.stars ? "text-red-600 fill-red-600" : "opacity-25"}
                      />
                    ))}
                  </div>
                </div>

                {rev.comment && <p className="text-xs leading-relaxed break-words">{rev.comment}</p>}

                {photos.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {photos.map((photoUrl, idx) => (
                      <button
                        key={`${rev.id}-ph-${idx}`}
                        type="button"
                        onClick={() =>
                          setGalleryState({
                            images: photos,
                            index: idx,
                            title: `Fotos de ${rev.userName || "Cliente Uíge"}`,
                          })
                        }
                        className="w-16 h-16 rounded-xl overflow-hidden border cursor-pointer"
                        style={{ borderColor: "var(--rbw-border)" }}
                      >
                        <SafeImage src={photoUrl} alt={`Foto da avaliação ${idx + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {galleryState && (
        <ImageGalleryModal
          images={galleryState.images}
          title={galleryState.title}
          initialIndex={galleryState.index}
          isOpen={true}
          onClose={() => setGalleryState(null)}
        />
      )}
    </section>
  );
};
