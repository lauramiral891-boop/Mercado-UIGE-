import React, { useState } from "react";
import {
  Store as StoreIcon,
  Trash2,
  Eye,
  MousePointerClick,
  Package,
  Crown,
  Megaphone,
  CreditCard,
  Clock,
  Upload,
} from "lucide-react";
import {
  User,
  Store,
  Product,
  Category,
  Order,
  SponsoredAd,
  MerchantPayment,
  SystemConfig,
  StoreType,
  AdPosition,
  PlanType,
  UIGE_MUNICIPALITIES,
  getBairrosByMunicipality,
  fmtKz,
  fmtDate,
  formatStoreType,
  formatPlanType,
  getPlanPriceForType,
  productRepo,
  storeRepo,
  orderRepo,
  adRepo,
  paymentRepo,
  compressImage,
  uploadProductImage,
  isSupabaseConfigured,
  translateErrorMessage,
} from "@mercado-uige/shared";

interface SellerStudioViewProps {
  user: User | null;
  myStore: Store | null;
  myProducts: Product[];
  categories: Category[];
  storeOrders: Order[];
  myAds: SponsoredAd[];
  myPayments: MerchantPayment[];
  systemConfig: SystemConfig;
  onOpenAuth: () => void;
  onReload: () => Promise<void>;
  onProductDeleted: (id: string) => void;
  showToast: (msg: string) => void;
}

export const SellerStudioView: React.FC<SellerStudioViewProps> = ({
  user,
  myStore,
  myProducts,
  categories,
  storeOrders,
  myAds,
  myPayments,
  systemConfig,
  onOpenAuth,
  onReload,
  onProductDeleted,
  showToast,
}) => {
  const [sellerTab, setSellerTab] = useState<"catalog" | "orders" | "plans">("catalog");

  // Store creation form (Loja fixa vs Vendedor ambulante)
  const [storeType, setStoreType] = useState<StoreType>("loja_fixa");
  const [storeForm, setStoreForm] = useState({
    name: "",
    description: "",
    category: "Electrónicos",
    municipality: "Uíge",
    bairro: getBairrosByMunicipality("Uíge")[0],
    address: "",
    phone: "",
    facadeImage: "",
    biPhotoUrl: "",
  });
  const [facadeBlob, setFacadeBlob] = useState<{ blob: Blob; fileName: string } | null>(null);
  const [biBlob, setBiBlob] = useState<{ blob: Blob; fileName: string } | null>(null);

  // Product form
  const [sellerForm, setSellerForm] = useState({
    name: "",
    description: "",
    price: "",
    oldPrice: "",
    stock: "10",
    categoryName: "Electrónicos",
    brand: "",
    condition: "novo" as "novo" | "usado",
    image: "",
    municipality: "Uíge",
  });
  const [compressingImage, setCompressingImage] = useState(false);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const [pendingUploadBlob, setPendingUploadBlob] = useState<{ blob: Blob; fileName: string } | null>(null);

  // Plan & Ad payment form
  const [paymentKind, setPaymentKind] = useState<"plano" | "anuncio">("plano");
  const [targetPlan, setTargetPlan] = useState<PlanType>("basico");
  const [paymentMethod, setPaymentMethod] = useState<"Multicaixa Express" | "Referência" | "Transferência">(
    "Multicaixa Express"
  );
  const [paymentRef, setPaymentRef] = useState("");
  const [proofPreview, setProofPreview] = useState("");
  const [proofBlob, setProofBlob] = useState<{ blob: Blob; fileName: string } | null>(null);

  // New Ad form
  const [adTitle, setAdTitle] = useState("");
  const [adSubtitle, setAdSubtitle] = useState("");
  const [adPosition, setAdPosition] = useState<AdPosition>("topo");
  const [adProductId, setAdProductId] = useState("");
  const [adDays, setAdDays] = useState("15");
  const [adImagePreview, setAdImagePreview] = useState("");
  const [adImageBlob, setAdImageBlob] = useState<{ blob: Blob; fileName: string } | null>(null);

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto space-y-5 anim-fadeUp">
        <h1 className="text-xl sm:text-2xl font-black">Vender no Mercado Uíge</h1>
        <div
          className="p-6 sm:p-8 text-center rounded-3xl border space-y-3"
          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
        >
          <StoreIcon size={38} className="mx-auto text-[#246BFD] opacity-70" />
          <h3 className="font-black text-base">Entre com a sua conta para vender</h3>
          <p className="text-xs opacity-70">
            Entra com o teu e-mail e palavra-passe para abrir a sua loja ou anunciar artigos no Uíge.
          </p>
          <button
            type="button"
            onClick={onOpenAuth}
            className="px-6 py-2.5 rounded-2xl font-black text-xs text-white cursor-pointer"
            style={{ backgroundColor: "var(--primary)" }}
          >
            Entrar / Criar Conta de Vendedor
          </button>
        </div>
      </div>
    );
  }

  const totalViews = myAds.reduce((s, a) => s + Number(a.views || 0), 0);
  const totalClicks = myAds.reduce((s, a) => s + Number(a.clicks || 0), 0);
  const storeBairros = getBairrosByMunicipality(storeForm.municipality);
  const merchantRoleType: "loja_fixa" | "vendedor_ambulante" =
    myStore?.storeType === "vendedor_ambulante" ? "vendedor_ambulante" : "loja_fixa";
  const basicPlanPrice = getPlanPriceForType(systemConfig, merchantRoleType, "basico");
  const vipPlanPrice = getPlanPriceForType(systemConfig, merchantRoleType, "vip");

  const handleCompressFile = async (
    file: File,
    onDone: (dataUrl: string, blob: Blob, fileName: string, sizeKB: number) => void
  ) => {
    setCompressingImage(true);
    try {
      const { blob, dataUrl, sizeKB } = await compressImage(file);
      onDone(dataUrl, blob, file.name || `img_${Date.now()}.jpg`, sizeKB);
      showToast(`Fotografia comprimida: ${sizeKB} KB ✓`);
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível processar a fotografia."));
    } finally {
      setCompressingImage(false);
    }
  };

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (storeType === "loja_fixa") {
      if (!storeForm.address.trim() || !storeForm.bairro.trim() || !storeForm.facadeImage) {
        showToast("Loja fixa exige morada, bairro e fotografia da fachada.");
        return;
      }
    } else {
      if (!storeForm.biPhotoUrl || !storeForm.phone.trim()) {
        showToast("Vendedor ambulante exige fotografia do BI e contacto telefónico.");
        return;
      }
    }

    try {
      let facadeUrl = storeForm.facadeImage;
      let biUrl = storeForm.biPhotoUrl;
      if (isSupabaseConfigured && navigator.onLine) {
        if (facadeBlob) {
          const res = await uploadProductImage(facadeBlob.blob, facadeBlob.fileName, "lojas");
          if (res.url) facadeUrl = res.url;
        }
        if (biBlob) {
          const res = await uploadProductImage(biBlob.blob, biBlob.fileName, "documentos");
          if (res.url) biUrl = res.url;
        }
      }

      await storeRepo.create({
        ownerId: user.id,
        name: storeForm.name.trim(),
        description: storeForm.description.trim(),
        category: storeForm.category,
        storeType,
        municipality: storeForm.municipality,
        bairro: storeForm.bairro,
        address: storeForm.address.trim(),
        facadeImage: facadeUrl,
        biPhotoUrl: biUrl,
        logo: facadeUrl || biUrl,
        phone: storeForm.phone.trim(),
      });

      showToast(
        storeType === "vendedor_ambulante"
          ? "Registo de vendedor ambulante enviado! Aguarda aprovação do administrador."
          : "Loja registada! Aguarda validação para activar no catálogo."
      );
      await onReload();
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível registar a loja."));
    }
  };

  const handlePublishProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let imageUrl = sellerForm.image;
      if (isSupabaseConfigured && pendingUploadBlob && navigator.onLine) {
        const { url } = await uploadProductImage(pendingUploadBlob.blob, pendingUploadBlob.fileName);
        if (url) imageUrl = url;
      }

      const created = await productRepo.create({
        name: sellerForm.name,
        description: sellerForm.description,
        price: Number(sellerForm.price),
        oldPrice: sellerForm.oldPrice ? Number(sellerForm.oldPrice) : null,
        stock: Number(sellerForm.stock),
        categoryName: sellerForm.categoryName,
        brand: sellerForm.brand,
        condition: sellerForm.condition,
        image: imageUrl,
        municipality: sellerForm.municipality,
        sellerId: user.id,
        storeId: myStore?.id,
        storeName: myStore?.name,
        storeType: myStore?.storeType,
        isApproved: !systemConfig.requireProductApproval,
      });

      setSellerForm({
        name: "",
        description: "",
        price: "",
        oldPrice: "",
        stock: "10",
        categoryName: "Electrónicos",
        brand: "",
        condition: "novo",
        image: "",
        municipality: "Uíge",
      });
      setPendingUploadBlob(null);
      setCompressedSize(null);
      const pending = Boolean(systemConfig.requireProductApproval) || created.isApproved === false;
      showToast(
        pending
          ? "Artigo enviado! Aguarda aprovação do administrador."
          : "Artigo anunciado com sucesso no Mercado Uíge!"
      );
      await onReload();
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível publicar o artigo."));
    }
  };

  const handleSubmitPaymentAndCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myStore) {
      showToast("Regista primeiro a tua loja antes de contratar um plano ou anúncio.");
      return;
    }
    if (!proofPreview) {
      showToast("Anexa a imagem do comprovativo de pagamento.");
      return;
    }

    try {
      let finalProofUrl = proofPreview;
      let finalAdImage = adImagePreview || myStore.logo || "";

      if (isSupabaseConfigured && navigator.onLine) {
        if (proofBlob) {
          const res = await uploadProductImage(proofBlob.blob, proofBlob.fileName, "comprovativos");
          if (res.url) finalProofUrl = res.url;
        }
        if (adImageBlob) {
          const res = await uploadProductImage(adImageBlob.blob, adImageBlob.fileName, "anuncios");
          if (res.url) finalAdImage = res.url;
        }
      }

      let createdAdId: string | undefined;
      if (paymentKind === "anuncio") {
        if (!adTitle.trim()) {
          showToast("Indica o título do anúncio patrocinado.");
          return;
        }
        const days = Math.max(1, Number(adDays || 15));
        const ad = await adRepo.create({
          storeId: myStore.id,
          sellerId: user.id,
          productId: adProductId || undefined,
          storeName: myStore.name,
          title: adTitle.trim(),
          subtitle: adSubtitle.trim(),
          imageUrl: finalAdImage,
          position: adPosition,
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + days * 86400000).toISOString(),
          active: false,
          status: "pendente",
        });
        createdAdId = ad.id;
      }

      const amountKz =
        paymentKind === "plano"
          ? targetPlan === "vip"
            ? vipPlanPrice
            : basicPlanPrice
          : basicPlanPrice;

      await paymentRepo.create({
        sellerId: user.id,
        sellerName: user.name,
        storeId: myStore.id,
        storeName: myStore.name,
        userRoleType: merchantRoleType,
        type: paymentKind,
        targetPlan: paymentKind === "plano" ? targetPlan : undefined,
        adId: createdAdId,
        amountKz,
        method: paymentMethod,
        reference: paymentRef.trim(),
        proofUrl: finalProofUrl,
      });

      setProofPreview("");
      setProofBlob(null);
      setPaymentRef("");
      setAdTitle("");
      setAdSubtitle("");
      showToast("Comprovativo enviado! O plano ou anúncio será activado após confirmação.");
      await onReload();
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível enviar o comprovativo."));
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5 anim-fadeUp">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-black">Painel do Comerciante</h1>
        {myStore?.code && (
          <span className="text-xs font-black px-2.5 py-1 rounded-full bg-[#246BFD]/15 text-[#246BFD]">
            {myStore.code} · {formatStoreType(myStore.storeType)}
          </span>
        )}
      </div>

      {user.isApproved === false && (
        <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
          <Clock size={16} className="shrink-0" />
          <span>A tua conta de comerciante aguarda validação inicial do administrador.</span>
        </div>
      )}

      {myStore && (!myStore.isApproved || myStore.isSuspended) && (
        <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
          <Clock size={16} className="shrink-0" />
          <span>
            {myStore.isSuspended
              ? `Loja suspensa: ${myStore.suspensionReason || "Contacta o suporte."}`
              : "A tua loja está em análise pelo administrador e ficará visível após aprovação."}
          </span>
        </div>
      )}

      {/* Merchant KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        <div className="p-3.5 rounded-2xl border" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
          <span className="opacity-65 flex items-center gap-1"><Eye size={12} /> Visualizações</span>
          <span className="text-lg font-black tabular-nums mt-0.5 block">{totalViews}</span>
        </div>
        <div className="p-3.5 rounded-2xl border" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
          <span className="opacity-65 flex items-center gap-1"><MousePointerClick size={12} /> Cliques</span>
          <span className="text-lg font-black tabular-nums mt-0.5 block">{totalClicks}</span>
        </div>
        <div className="p-3.5 rounded-2xl border" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
          <span className="opacity-65 flex items-center gap-1"><Package size={12} /> Encomendas</span>
          <span className="text-lg font-black tabular-nums mt-0.5 block">{storeOrders.length}</span>
        </div>
        <div className="p-3.5 rounded-2xl border" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
          <span className="opacity-65 flex items-center gap-1"><Crown size={12} className="text-amber-400" /> Plano Actual</span>
          <span className="text-sm font-black mt-0.5 block" style={{ color: "var(--accent)" }}>
            {formatPlanType(myStore?.planType)}
          </span>
          {myStore?.planExpiresAt && myStore.planType !== "gratis" && (
            <span className="text-[10px] opacity-65 block">Até {fmtDate(myStore.planExpiresAt)}</span>
          )}
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="grid grid-cols-3 gap-1.5 text-xs font-bold">
        {[
          { id: "catalog", label: "Loja e Artigos" },
          { id: "orders", label: `Encomendas (${storeOrders.length})` },
          { id: "plans", label: "Planos e Anúncios" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSellerTab(t.id as any)}
            className={`py-2 px-2 rounded-2xl border cursor-pointer transition-colors truncate ${
              sellerTab === t.id ? "bg-[#246BFD] text-white border-[#246BFD]" : "border-[var(--border)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sellerTab === "catalog" && (
        <>
          {!myStore && (
            <form
              onSubmit={handleCreateStore}
              className="p-4 sm:p-5 rounded-3xl border space-y-3 text-xs"
              style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
            >
              <h2 className="font-black text-sm">1. Abrir a Sua Loja no Uíge</h2>

              <div>
                <label className="block font-bold mb-1">Tipo de Comerciante *</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "loja_fixa", label: "Loja fixa" },
                    { id: "vendedor_ambulante", label: "Vendedor ambulante" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setStoreType(opt.id as StoreType)}
                      className={`p-2.5 rounded-xl font-bold border cursor-pointer ${
                        storeType === opt.id ? "bg-[#246BFD] text-white border-[#246BFD]" : "border-[var(--border)]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  required
                  value={storeForm.name}
                  onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
                  placeholder="Nome da Loja *"
                  className="w-full p-2.5 rounded-xl border bg-transparent outline-none"
                  style={{ borderColor: "var(--border)" }}
                />
                <input
                  type="tel"
                  required={storeType === "vendedor_ambulante"}
                  value={storeForm.phone}
                  onChange={(e) => setStoreForm({ ...storeForm, phone: e.target.value })}
                  placeholder={storeType === "vendedor_ambulante" ? "WhatsApp / Telefone *" : "WhatsApp da loja (ex: 923000000)"}
                  className="w-full p-2.5 rounded-xl border bg-transparent outline-none"
                  style={{ borderColor: "var(--border)" }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <select
                  value={storeForm.municipality}
                  onChange={(e) => {
                    const mun = e.target.value;
                    setStoreForm({ ...storeForm, municipality: mun, bairro: getBairrosByMunicipality(mun)[0] });
                  }}
                  className="w-full p-2.5 rounded-xl border outline-none"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)", color: "var(--text-primary)" }}
                >
                  {UIGE_MUNICIPALITIES.map((m) => (
                    <option key={m} value={m} className="bg-slate-900 text-white">{m}</option>
                  ))}
                </select>

                <select
                  value={storeForm.bairro}
                  onChange={(e) => setStoreForm({ ...storeForm, bairro: e.target.value })}
                  className="w-full p-2.5 rounded-xl border outline-none"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)", color: "var(--text-primary)" }}
                >
                  {storeBairros.map((b) => (
                    <option key={b} value={b} className="bg-slate-900 text-white">{b}</option>
                  ))}
                </select>
              </div>

              {storeType === "loja_fixa" ? (
                <div className="space-y-2.5">
                  <input
                    type="text"
                    required
                    value={storeForm.address}
                    onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })}
                    placeholder="Morada exata da loja (Rua / Referência) *"
                    className="w-full p-2.5 rounded-xl border bg-transparent outline-none"
                    style={{ borderColor: "var(--border)" }}
                  />
                  <label className="flex items-center justify-center gap-2 p-3 rounded-2xl border border-dashed cursor-pointer hover:border-[#246BFD]" style={{ borderColor: "var(--border)" }}>
                    <Upload size={15} className="text-[#246BFD]" />
                    <span>{storeForm.facadeImage ? "Foto da fachada carregada ✓" : "Carregar fotografia da fachada da loja *"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          handleCompressFile(f, (dataUrl, blob, fileName) => {
                            setStoreForm((prev) => ({ ...prev, facadeImage: dataUrl }));
                            setFacadeBlob({ blob, fileName });
                          });
                        }
                      }}
                    />
                  </label>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="flex items-center justify-center gap-2 p-3 rounded-2xl border border-dashed cursor-pointer hover:border-[#246BFD]" style={{ borderColor: "var(--border)" }}>
                    <Upload size={15} className="text-[#246BFD]" />
                    <span>{storeForm.biPhotoUrl ? "Fotografia do BI carregada ✓" : "Carregar fotografia do BI (obrigatório) *"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          handleCompressFile(f, (dataUrl, blob, fileName) => {
                            setStoreForm((prev) => ({ ...prev, biPhotoUrl: dataUrl }));
                            setBiBlob({ blob, fileName });
                          });
                        }
                      }}
                    />
                  </label>
                  <p className="text-[11px] text-amber-400">
                    Vendedores ambulantes só ficam activos no mercado depois da aprovação do administrador.
                  </p>
                </div>
              )}

              <input
                type="text"
                value={storeForm.description}
                onChange={(e) => setStoreForm({ ...storeForm, description: e.target.value })}
                placeholder="Descrição curta dos produtos da sua loja..."
                className="w-full p-2.5 rounded-xl border bg-transparent outline-none"
                style={{ borderColor: "var(--border)" }}
              />
              <button
                type="submit"
                disabled={compressingImage}
                className="px-5 py-2.5 rounded-2xl font-black text-xs text-white cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: "var(--primary)" }}
              >
                Registar Loja
              </button>
            </form>
          )}

          {/* Publish Product Form */}
          <div className="p-4 sm:p-5 rounded-3xl border space-y-3" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
            <h2 className="font-black text-sm pb-2 border-b" style={{ borderColor: "var(--border)" }}>
              Publicar Novo Artigo
            </h2>
            <form onSubmit={handlePublishProduct} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1">Nome do Artigo *</label>
                <input
                  type="text"
                  required
                  value={sellerForm.name}
                  onChange={(e) => setSellerForm({ ...sellerForm, name: e.target.value })}
                  placeholder="Ex: iPhone 13 128GB ou Café do Uíge"
                  className="w-full p-2.5 rounded-xl border bg-transparent font-medium outline-none"
                  style={{ borderColor: "var(--border)" }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold mb-1">Marca</label>
                  <input
                    type="text"
                    value={sellerForm.brand}
                    onChange={(e) => setSellerForm({ ...sellerForm, brand: e.target.value })}
                    placeholder="Ex: Apple, Samsung, Local"
                    className="w-full p-2.5 rounded-xl border bg-transparent font-medium outline-none"
                    style={{ borderColor: "var(--border)" }}
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Estado do Artigo *</label>
                  <select
                    value={sellerForm.condition}
                    onChange={(e) => setSellerForm({ ...sellerForm, condition: e.target.value as "novo" | "usado" })}
                    className="w-full p-2.5 rounded-xl border outline-none"
                    style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)", color: "var(--text-primary)" }}
                  >
                    <option value="novo" className="bg-slate-900 text-white">Novo</option>
                    <option value="usado" className="bg-slate-900 text-white">Usado</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={sellerForm.description}
                  onChange={(e) => setSellerForm({ ...sellerForm, description: e.target.value })}
                  placeholder="Detalhes, estado e condições de entrega..."
                  className="w-full p-2.5 rounded-xl border bg-transparent font-medium outline-none"
                  style={{ borderColor: "var(--border)" }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold mb-1">Preço em Kz *</label>
                  <input
                    type="number"
                    required
                    min="100"
                    value={sellerForm.price}
                    onChange={(e) => setSellerForm({ ...sellerForm, price: e.target.value })}
                    placeholder="5000"
                    className="w-full p-2.5 rounded-xl border bg-transparent font-medium outline-none"
                    style={{ borderColor: "var(--border)" }}
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Stock *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={sellerForm.stock}
                    onChange={(e) => setSellerForm({ ...sellerForm, stock: e.target.value })}
                    className="w-full p-2.5 rounded-xl border bg-transparent font-medium outline-none"
                    style={{ borderColor: "var(--border)" }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold mb-1">Categoria</label>
                  <select
                    value={sellerForm.categoryName}
                    onChange={(e) => setSellerForm({ ...sellerForm, categoryName: e.target.value })}
                    className="w-full p-2.5 rounded-xl border outline-none"
                    style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)", color: "var(--text-primary)" }}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.name} className="bg-slate-900 text-white">{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold mb-1">Município</label>
                  <select
                    value={sellerForm.municipality}
                    onChange={(e) => setSellerForm({ ...sellerForm, municipality: e.target.value })}
                    className="w-full p-2.5 rounded-xl border outline-none"
                    style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)", color: "var(--text-primary)" }}
                  >
                    {UIGE_MUNICIPALITIES.map((m) => (
                      <option key={m} value={m} className="bg-slate-900 text-white">{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1">Fotografia do Artigo (Compressão automática)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      handleCompressFile(f, (dataUrl, blob, fileName, sizeKB) => {
                        setSellerForm((prev) => ({ ...prev, image: dataUrl }));
                        setPendingUploadBlob({ blob, fileName });
                        setCompressedSize(sizeKB);
                      });
                    }
                  }}
                  className="w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#246BFD] file:text-white cursor-pointer"
                />
                {compressedSize && (
                  <span className="text-[11px] text-emerald-400 font-bold block mt-1">
                    Fotografia optimizada ({compressedSize} KB)
                  </span>
                )}
              </div>

              <button
                type="submit"
                disabled={compressingImage}
                className="w-full py-3 rounded-2xl font-black text-xs text-slate-950 shadow-md cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: "var(--accent)" }}
              >
                Publicar no Mercado Uíge
              </button>
            </form>
          </div>

          {myProducts.length === 0 ? (
            <div className="p-6 text-center rounded-3xl border space-y-1" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
              <p className="font-bold text-xs">Ainda não publicou nenhum artigo</p>
              <p className="text-[11px] opacity-65">Use o formulário acima para anunciar os seus primeiros produtos.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="font-black text-sm">Os Meus Artigos Publicados ({myProducts.length})</h3>
              {myProducts.map((mp) => (
                <div
                  key={mp.id}
                  className="p-3 rounded-2xl border flex items-center justify-between gap-3 text-xs"
                  style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
                >
                  <div className="min-w-0">
                    <span className="font-bold block truncate">
                      {mp.name} {mp.condition === "usado" ? "(Usado)" : ""}
                    </span>
                    <span className="text-[#B7F34A] font-black tabular-nums">{fmtKz(mp.price)}</span>
                    <span className="opacity-65 ml-2">Stock: {mp.stock} un.</span>
                    {mp.isApproved === false && (
                      <span className="ml-2 text-amber-400 font-bold">· Em aprovação</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await productRepo.delete(mp.id);
                        onProductDeleted(mp.id);
                        showToast("Artigo removido.");
                      } catch (err: unknown) {
                        showToast(translateErrorMessage(err, "Não foi possível remover o artigo."));
                      }
                    }}
                    className="p-2 text-red-400 hover:text-red-500 cursor-pointer shrink-0"
                    title="Eliminar artigo"
                    aria-label="Eliminar artigo"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* TAB: STORE ORDERS */}
      {sellerTab === "orders" && (
        <div className="space-y-3">
          {storeOrders.length === 0 ? (
            <div className="p-8 text-center rounded-3xl border space-y-1" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
              <Package size={36} className="mx-auto opacity-40 text-[#246BFD]" />
              <p className="font-bold text-sm">Sem encomendas recebidas</p>
              <p className="text-xs opacity-65">As compras feitas na sua loja aparecerão aqui.</p>
            </div>
          ) : (
            storeOrders.map((ord) => (
              <div
                key={ord.id}
                className="p-4 rounded-3xl border space-y-2.5 text-xs"
                style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 font-bold">
                  <span>#{ord.code}</span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        ord.paymentStatus === "pago"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-amber-500/20 text-amber-300"
                      }`}
                    >
                      {ord.paymentStatus === "pago" ? "Pago" : "Por pagar"}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-[#246BFD] text-white text-[10px]">{ord.status}</span>
                  </div>
                </div>
                <p className="opacity-85">
                  Cliente: <b>{ord.userName || "Cliente Uíge"}</b>
                  {ord.userPhone ? ` (${ord.userPhone})` : ""}
                </p>
                <p className="opacity-80">
                  {ord.deliveryType === "levantamento" ? "Levantamento na loja" : ord.address} · Total:{" "}
                  <b style={{ color: "var(--accent)" }}>{fmtKz(ord.total)}</b>
                </p>
                {ord.items.length > 0 && (
                  <p className="text-[11px] opacity-65">{ord.items.map((it) => `${it.qty}x ${it.productName}`).join(" • ")}</p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  {ord.paymentStatus !== "pago" && ord.status !== "Cancelada" && (
                    <button
                      type="button"
                      onClick={async () => {
                        await orderRepo.markPaid(ord.id);
                        showToast("Pagamento confirmado na encomenda ✓");
                        await onReload();
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-500 text-slate-950 font-black cursor-pointer"
                    >
                      Confirmar Pago
                    </button>
                  )}
                  {ord.status === "Pendente" && (
                    <button
                      type="button"
                      onClick={async () => {
                        await orderRepo.updateStatus(ord.id, "Confirmada");
                        showToast("Encomenda confirmada!");
                        await onReload();
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-[#246BFD]/20 text-[#246BFD] font-black cursor-pointer"
                    >
                      Confirmar Pedido
                    </button>
                  )}
                  {ord.status === "Confirmada" && (
                    <button
                      type="button"
                      onClick={async () => {
                        await orderRepo.updateStatus(
                          ord.id,
                          ord.deliveryType === "levantamento" ? "Pronta para levantamento" : "Em preparação"
                        );
                        showToast("Estado da encomenda actualizado.");
                        await onReload();
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-[#246BFD] text-white font-black cursor-pointer"
                    >
                      {ord.deliveryType === "levantamento" ? "Pronta para Levantamento" : "Marcar Em Preparação"}
                    </button>
                  )}
                  {ord.status !== "Entregue" && ord.status !== "Cancelada" && (
                    <button
                      type="button"
                      onClick={async () => {
                        await orderRepo.updateStatus(ord.id, "Entregue");
                        showToast("Encomenda marcada como Entregue ✓");
                        await onReload();
                      }}
                      className="px-3.5 py-1.5 rounded-xl font-black text-slate-950 cursor-pointer"
                      style={{ backgroundColor: "var(--accent)" }}
                    >
                      Marcar Entregue
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB: PLANS, ADS & PAYMENT PROOF */}
      {sellerTab === "plans" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-black">Tabela de Planos ({formatStoreType(merchantRoleType)})</span>
            <span className="opacity-70">Preços definidos pela administração</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            {[
              { id: "gratis", title: "Grátis", price: 0, desc: "Catálogo normal da loja." },
              { id: "basico", title: "Básico", price: basicPlanPrice, desc: "Maior visibilidade e 1 anúncio." },
              { id: "vip", title: "Destaque / VIP", price: vipPlanPrice, desc: "Selo VIP e destaque máximo." },
            ].map((pl) => {
              const isCurrent = (myStore?.planType || "gratis") === pl.id;
              return (
                <div
                  key={pl.id}
                  className={`p-3.5 rounded-2xl border space-y-1 ${isCurrent ? "border-[#B7F34A]" : ""}`}
                  style={{ backgroundColor: "var(--surface)", borderColor: isCurrent ? "var(--accent)" : "var(--border)" }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-sm">{pl.title}</span>
                    {isCurrent && <span className="text-[10px] font-black text-[#B7F34A]">Actual</span>}
                  </div>
                  <div className="font-black text-base tabular-nums" style={{ color: "var(--accent)" }}>
                    {pl.price === 0 ? "0 Kz" : `${fmtKz(pl.price)} / mês`}
                  </div>
                  <p className="opacity-70 text-[11px]">{pl.desc}</p>
                </div>
              );
            })}
          </div>

          <form
            onSubmit={handleSubmitPaymentAndCampaign}
            className="p-4 sm:p-5 rounded-3xl border space-y-3 text-xs"
            style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
          >
            <h3 className="font-black text-sm flex items-center gap-1.5">
              <CreditCard size={15} className="text-[#246BFD]" /> Activar Plano ou Anúncio Patrocinado
            </h3>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentKind("plano")}
                className={`p-2 rounded-xl font-bold border cursor-pointer ${
                  paymentKind === "plano" ? "bg-[#246BFD] text-white border-[#246BFD]" : "border-[var(--border)]"
                }`}
              >
                Plano da Loja
              </button>
              <button
                type="button"
                onClick={() => setPaymentKind("anuncio")}
                className={`p-2 rounded-xl font-bold border cursor-pointer ${
                  paymentKind === "anuncio" ? "bg-[#246BFD] text-white border-[#246BFD]" : "border-[var(--border)]"
                }`}
              >
                Anúncio Patrocinado
              </button>
            </div>

            {paymentKind === "plano" ? (
              <div>
                <label className="block font-bold mb-1">Escolher Plano (30 dias)</label>
                <select
                  value={targetPlan}
                  onChange={(e) => setTargetPlan(e.target.value as PlanType)}
                  className="w-full p-2.5 rounded-xl border outline-none"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)", color: "var(--text-primary)" }}
                >
                  <option value="basico" className="bg-slate-900 text-white">
                    Plano Básico — {fmtKz(basicPlanPrice)}
                  </option>
                  <option value="vip" className="bg-slate-900 text-white">
                    Plano Destaque / VIP — {fmtKz(vipPlanPrice)}
                  </option>
                </select>
              </div>
            ) : (
              <div className="space-y-2.5">
                <input
                  type="text"
                  required
                  value={adTitle}
                  onChange={(e) => setAdTitle(e.target.value)}
                  placeholder="Título do anúncio (ex: Promoção Café do Uíge) *"
                  className="w-full p-2.5 rounded-xl border bg-transparent outline-none"
                  style={{ borderColor: "var(--border)" }}
                />
                <input
                  type="text"
                  value={adSubtitle}
                  onChange={(e) => setAdSubtitle(e.target.value)}
                  placeholder="Texto curto promocional..."
                  className="w-full p-2.5 rounded-xl border bg-transparent outline-none"
                  style={{ borderColor: "var(--border)" }}
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={adPosition}
                    onChange={(e) => setAdPosition(e.target.value as AdPosition)}
                    className="w-full p-2.5 rounded-xl border outline-none"
                    style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)", color: "var(--text-primary)" }}
                  >
                    <option value="topo" className="bg-slate-900 text-white">Posição: Topo (Início)</option>
                    <option value="categoria" className="bg-slate-900 text-white">Posição: Categorias</option>
                    <option value="pesquisa" className="bg-slate-900 text-white">Posição: Pesquisa</option>
                  </select>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={adDays}
                    onChange={(e) => setAdDays(e.target.value)}
                    placeholder="Duração (dias)"
                    className="w-full p-2.5 rounded-xl border bg-transparent outline-none"
                    style={{ borderColor: "var(--border)" }}
                  />
                </div>
                {myProducts.length > 0 && (
                  <select
                    value={adProductId}
                    onChange={(e) => setAdProductId(e.target.value)}
                    className="w-full p-2.5 rounded-xl border outline-none"
                    style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)", color: "var(--text-primary)" }}
                  >
                    <option value="" className="bg-slate-900 text-white">Abrir a minha loja ao tocar</option>
                    {myProducts.map((mp) => (
                      <option key={mp.id} value={mp.id} className="bg-slate-900 text-white">
                        Abrir produto: {mp.name}
                      </option>
                    ))}
                  </select>
                )}
                <label className="flex items-center justify-center gap-2 p-2.5 rounded-xl border border-dashed cursor-pointer" style={{ borderColor: "var(--border)" }}>
                  <Upload size={14} className="text-[#246BFD]" />
                  <span>{adImagePreview ? "Banner carregado ✓" : "Imagem do anúncio (opcional)"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        handleCompressFile(f, (dataUrl, blob, fileName) => {
                          setAdImagePreview(dataUrl);
                          setAdImageBlob({ blob, fileName });
                        });
                      }
                    }}
                  />
                </label>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full p-2.5 rounded-xl border outline-none"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)", color: "var(--text-primary)" }}
              >
                <option value="Multicaixa Express" className="bg-slate-900 text-white">Multicaixa Express</option>
                <option value="Referência" className="bg-slate-900 text-white">Pagamento por Referência</option>
                <option value="Transferência" className="bg-slate-900 text-white">Transferência Bancária</option>
              </select>
              <input
                type="text"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="Nº da operação / Referência"
                className="w-full p-2.5 rounded-xl border bg-transparent outline-none"
                style={{ borderColor: "var(--border)" }}
              />
            </div>

            <label className="flex items-center justify-center gap-2 p-3 rounded-2xl border border-dashed cursor-pointer hover:border-[#246BFD]" style={{ borderColor: "var(--border)" }}>
              <Upload size={15} className="text-[#246BFD]" />
              <span>{proofPreview ? "Comprovativo anexado ✓" : "Carregar imagem do comprovativo *"}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    handleCompressFile(f, (dataUrl, blob, fileName) => {
                      setProofPreview(dataUrl);
                      setProofBlob({ blob, fileName });
                    });
                  }
                }}
              />
            </label>

            <button
              type="submit"
              className="w-full py-3 rounded-2xl font-black text-slate-950 cursor-pointer"
              style={{ backgroundColor: "var(--accent)" }}
            >
              Enviar Comprovativo para Activação
            </button>
          </form>

          {/* My Ads list */}
          {myAds.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-black text-xs flex items-center gap-1.5">
                <Megaphone size={14} className="text-[#246BFD]" /> As Minhas Campanhas ({myAds.length})
              </h4>
              {myAds.map((ad) => (
                <div
                  key={ad.id}
                  className="p-3 rounded-2xl border flex items-center justify-between gap-2 text-xs"
                  style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
                >
                  <div className="min-w-0">
                    <span className="font-bold block truncate">{ad.title} ({ad.position})</span>
                    <span className="text-[11px] opacity-65">
                      {ad.views} visualizações · {ad.clicks} cliques ·{" "}
                      {ad.endDate ? `Até ${fmtDate(ad.endDate)}` : "Sem data de fim"}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#246BFD]/15 text-[#246BFD] capitalize shrink-0">
                    {ad.status}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* My Payments list */}
          {myPayments.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-black text-xs">Os Meus Pagamentos ({myPayments.length})</h4>
              {myPayments.map((p) => (
                <div
                  key={p.id}
                  className="p-3 rounded-2xl border flex items-center justify-between gap-2 text-xs"
                  style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
                >
                  <div>
                    <span className="font-bold block">
                      {p.type === "plano" ? `Plano ${formatPlanType(p.targetPlan)}` : "Anúncio Patrocinado"} · {p.method}
                    </span>
                    <span className="text-[11px] opacity-65">{fmtKz(p.amountKz)} · {fmtDate(p.createdAt)}</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                      p.status === "confirmado"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : p.status === "rejeitado"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-amber-500/20 text-amber-400"
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
