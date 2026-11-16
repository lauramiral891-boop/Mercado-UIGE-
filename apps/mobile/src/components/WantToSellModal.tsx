import React, { useState } from "react";
import { Clock, ShieldAlert, Store as StoreIcon, Upload, X } from "lucide-react";
import {
  Category,
  Store,
  StoreType,
  UIGE_MUNICIPALITIES,
  User,
  compressImage,
  getBairrosByMunicipality,
  isSupabaseConfigured,
  storeRepo,
  translateErrorMessage,
  uploadProductImage,
  userRepo,
} from "@mercado-uige/shared";

interface WantToSellModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  myStore: Store | null;
  categories: Category[];
  onSubmitted: () => Promise<void>;
  onGoToSeller: () => void;
  showToast: (msg: string) => void;
}

export const WantToSellModal: React.FC<WantToSellModalProps> = ({
  isOpen,
  onClose,
  user,
  myStore,
  categories,
  onSubmitted,
  onGoToSeller,
  showToast,
}) => {
  const [storeType, setStoreType] = useState<StoreType>("loja_fixa");
  const [storeName, setStoreName] = useState("");
  const [category, setCategory] = useState(categories[0]?.name || "Electrónicos");
  const [municipality, setMunicipality] = useState(user?.municipality || "Uíge");
  const [bairro, setBairro] = useState(
    user?.bairro || getBairrosByMunicipality(user?.municipality || "Uíge")[0]
  );
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState(user?.phone || "");
  const [facadePreview, setFacadePreview] = useState("");
  const [biPreview, setBiPreview] = useState("");
  const [facadeBlob, setFacadeBlob] = useState<{ blob: Blob; fileName: string } | null>(null);
  const [biBlob, setBiBlob] = useState<{ blob: Blob; fileName: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || !user) return null;

  const isPendingMerchant =
    user.role === "comerciante" || Boolean(myStore);

  const handleImagePick = async (
    file: File,
    kind: "facade" | "bi"
  ) => {
    try {
      const { blob, dataUrl, sizeKB } = await compressImage(file);
      if (kind === "facade") {
        setFacadePreview(dataUrl);
        setFacadeBlob({ blob, fileName: file.name || `fachada_${Date.now()}.jpg` });
      } else {
        setBiPreview(dataUrl);
        setBiBlob({ blob, fileName: file.name || `bi_${Date.now()}.jpg` });
      }
      showToast(`Fotografia carregada (${sizeKB} KB) ✓`);
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível processar a fotografia."));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim()) {
      showToast("Indica o nome da tua loja ou banca.");
      return;
    }
    if (storeType === "loja_fixa") {
      if (!address.trim() || !bairro.trim() || !facadePreview) {
        showToast("Loja fixa exige morada, bairro e fotografia da fachada.");
        return;
      }
    } else if (!biPreview || !phone.trim()) {
      showToast("Vendedor ambulante exige fotografia do BI e contacto telefónico.");
      return;
    }

    setSubmitting(true);
    try {
      let facadeUrl = facadePreview;
      let biUrl = biPreview;

      if (isSupabaseConfigured && navigator.onLine) {
        if (facadeBlob) {
          const res = await uploadProductImage(facadeBlob.blob, facadeBlob.fileName, "lojas");
          if (res.error) throw res.error;
          if (res.url) facadeUrl = res.url;
        }
        if (biBlob) {
          const res = await uploadProductImage(biBlob.blob, biBlob.fileName, "documentos");
          if (res.error) throw res.error;
          if (res.url) biUrl = res.url;
        }
      }

      await userRepo.requestMerchantUpgrade(user.id, {
        phone: phone.trim() || undefined,
        municipality,
        bairro,
      });

      if (!myStore) {
        await storeRepo.create({
          ownerId: user.id,
          name: storeName.trim(),
          description: "",
          category,
          storeType,
          municipality,
          bairro,
          address: address.trim(),
          facadeImage: facadeUrl,
          biPhotoUrl: biUrl,
          logo: facadeUrl || biUrl,
          phone: phone.trim(),
          isApproved: false,
        });
      }

      showToast("Pedido para vender enviado! Aguarda aprovação do administrador.");
      await onSubmitted();
      onClose();
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível enviar o pedido de vendedor."));
    } finally {
      setSubmitting(false);
    }
  };

  const bairros = getBairrosByMunicipality(municipality);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Quero vender no Mercado Uíge"
    >
      <div
        className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border shadow-2xl p-4 sm:p-6 space-y-4 anim-pop"
        style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <StoreIcon size={18} className="text-[#B7F34A] shrink-0" />
            <h2 className="font-black text-base truncate">Quero Vender no Uíge</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela Quero vender"
            className="min-w-[44px] min-h-[44px] grid place-items-center rounded-xl border cursor-pointer shrink-0"
            style={{ borderColor: "var(--border)" }}
          >
            <X size={18} />
          </button>
        </div>

        {isPendingMerchant ? (
          <div className="space-y-3 text-xs">
            <div className="p-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 space-y-2">
              <div className="flex items-center gap-2 font-black text-amber-300">
                {user.isSuspended || myStore?.isSuspended ? (
                  <ShieldAlert size={16} />
                ) : (
                  <Clock size={16} />
                )}
                <span>
                  {user.isSuspended || myStore?.isSuspended
                    ? "Conta ou loja suspensa"
                    : user.approvalStatus === "rejeitado" || myStore?.approvalStatus === "rejeitado"
                    ? "Registo de vendedor rejeitado"
                    : user.approvalStatus === "correcao" || myStore?.approvalStatus === "correcao"
                    ? "Pedido necessita de correcção"
                    : "Registo como comerciante pendente de aprovação"}
                </span>
              </div>
              <p className="opacity-85 leading-relaxed">
                {user.correctionNote ||
                  myStore?.correctionNote ||
                  user.rejectionReason ||
                  myStore?.rejectionReason ||
                  myStore?.suspensionReason ||
                  "A nossa equipa está a validar os teus documentos. Assim que o administrador aprovar, poderás publicar artigos directamente no botão +."}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                onGoToSeller();
              }}
              className="w-full py-3 rounded-2xl font-black text-xs text-slate-950 cursor-pointer"
              style={{ backgroundColor: "var(--accent)" }}
            >
              Ver Painel do Comerciante
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3 text-xs">
            <p className="opacity-80 leading-relaxed">
              Solicita a tua conta de comerciante para publicar produtos. O pedido fica pendente até aprovação do administrador.
            </p>

            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "loja_fixa" as StoreType, label: "Loja fixa" },
                { id: "vendedor_ambulante" as StoreType, label: "Vendedor ambulante" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setStoreType(t.id)}
                  className={`py-2.5 px-3 rounded-xl font-black border cursor-pointer ${
                    storeType === t.id
                      ? "bg-[#246BFD] text-white border-[#246BFD]"
                      : "border-[var(--border)]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div>
              <label className="block font-bold mb-1">Nome da loja ou negócio *</label>
              <input
                type="text"
                required
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Ex: Comercial Kizomba do Uíge"
                className="w-full p-2.5 rounded-xl border bg-transparent outline-none focus:border-[#246BFD]"
                style={{ borderColor: "var(--border)" }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold mb-1">Categoria principal</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full p-2.5 rounded-xl border outline-none"
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
                <label className="block font-bold mb-1">Telemóvel / WhatsApp *</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="923000000"
                  className="w-full p-2.5 rounded-xl border bg-transparent outline-none focus:border-[#246BFD]"
                  style={{ borderColor: "var(--border)" }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold mb-1">Município</label>
                <select
                  value={municipality}
                  onChange={(e) => {
                    const nextMun = e.target.value;
                    setMunicipality(nextMun);
                    const nextBairros = getBairrosByMunicipality(nextMun);
                    if (!nextBairros.includes(bairro)) setBairro(nextBairros[0]);
                  }}
                  className="w-full p-2.5 rounded-xl border outline-none"
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
              <div>
                <label className="block font-bold mb-1">Bairro *</label>
                <select
                  value={bairro}
                  onChange={(e) => setBairro(e.target.value)}
                  className="w-full p-2.5 rounded-xl border outline-none"
                  style={{
                    borderColor: "var(--border)",
                    backgroundColor: "var(--surface-secondary)",
                    color: "var(--text-primary)",
                  }}
                >
                  {bairros.map((b) => (
                    <option key={b} value={b} className="bg-slate-900 text-white">
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {storeType === "loja_fixa" && (
              <div>
                <label className="block font-bold mb-1">Morada / Rua da Loja *</label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ex: Rua do Comércio, N.º 14"
                  className="w-full p-2.5 rounded-xl border bg-transparent outline-none focus:border-[#246BFD]"
                  style={{ borderColor: "var(--border)" }}
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {storeType === "loja_fixa" && (
                <label
                  className="p-3 rounded-2xl border border-dashed flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center"
                  style={{ borderColor: "var(--border)" }}
                >
                  <Upload size={16} className="text-[#246BFD]" />
                  <span className="font-bold">
                    {facadePreview ? "Foto da fachada carregada ✓" : "Foto da fachada *"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImagePick(f, "facade");
                    }}
                  />
                </label>
              )}

              <label
                className="p-3 rounded-2xl border border-dashed flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center"
                style={{ borderColor: "var(--border)" }}
              >
                <Upload size={16} className="text-[#246BFD]" />
                <span className="font-bold">
                  {biPreview
                    ? "Foto do BI carregada ✓"
                    : storeType === "vendedor_ambulante"
                    ? "Foto do BI *"
                    : "Foto do BI (opcional)"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImagePick(f, "bi");
                  }}
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-2xl font-black text-sm text-slate-950 shadow-lg cursor-pointer disabled:opacity-60"
              style={{ backgroundColor: "var(--accent)" }}
            >
              {submitting ? "A enviar pedido…" : "Enviar Pedido para Aprovação"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
