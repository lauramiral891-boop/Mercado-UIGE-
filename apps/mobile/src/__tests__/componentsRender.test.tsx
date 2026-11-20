import React from "react";
import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ErrorBoundary,
  SafeImage,
  Product,
  DEFAULT_SYSTEM_CONFIG,
  DEFAULT_CATEGORIES,
} from "@mercado-uige/shared";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import { BottomAdStrip } from "../components/BottomAdStrip";
import { WantToSellModal } from "../components/WantToSellModal";
import { ProductCard } from "../components/ProductCard";
import { ProductDetailModal } from "../components/ProductDetailModal";
import { AuthModal } from "../components/AuthModal";
import { LocationModal } from "../components/LocationModal";
import { PrivacyPolicyModal } from "../components/PrivacyPolicyModal";
import { OnlineStatusIndicator } from "../components/OnlineStatusIndicator";
import { CourierView } from "../components/CourierView";
import { SellerStudioView } from "../components/SellerStudioView";
import { PublishProductModal } from "../components/PublishProductModal";
import { SponsoredMediaView } from "../components/SponsoredMediaView";
import { FullscreenAdOverlay } from "../components/FullscreenAdOverlay";
import { HomeBannerCarousel } from "../components/HomeBannerCarousel";
import { StoreDetailView } from "../components/StoreDetailView";
import { CartView } from "../components/CartView";
import { ImageGalleryModal } from "../components/ImageGalleryModal";
import { ReviewsSection } from "../components/ReviewsSection";
import { MobileApp } from "../App";
import { AdminApp } from "../../../admin/src/App";
import { AdsSection, PaymentsSection } from "../../../admin/src/components/OperationalSections";
import { ConfigSection } from "../../../admin/src/components/ConfigSection";

const SAMPLE_PRODUCT: Product = {
  id: "prod_1",
  storeId: "store_1",
  sellerId: "seller_1",
  name: "Café do Uíge em Grão 1Kg",
  description: "Café arábica torrado localmente no município do Negage.",
  price: 4500,
  oldPrice: 5500,
  discount: 18,
  stock: 12,
  categoryName: "Alimentação",
  brand: "Fazenda Uíge",
  condition: "usado",
  image: "",
  images: [],
  province: "Uíge",
  municipality: "Negage",
  isApproved: true,
  sales: 10,
  rating: 0,
  reviewsCount: 0,
  variants: ["1Kg", "500g"],
  storeName: "Cooperativa Negage",
  storeCode: "LJ-0001",
  storeType: "loja_fixa",
  storeRating: 0,
  storeVip: false,
  createdAt: "2026-02-01T10:00:00Z",
};

function assertCleanUiMarkup(html: string) {
  const textOnly = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  expect(textOnly).not.toContain("[object Object]");
  expect(textOnly).not.toContain("Invalid Date");
  expect(textOnly).not.toMatch(/\bNaN\b/);
  expect(textOnly).not.toMatch(/\bundefined\b/);
}

describe("Auditoria de Renderização dos Ecrãs e Componentes (Mobile & Admin)", () => {
  it("renderiza MobileApp e AdminApp sem fugas técnicas", () => {
    const mobileHtml = renderToStaticMarkup(<MobileApp />);
    const adminHtml = renderToStaticMarkup(<AdminApp />);
    assertCleanUiMarkup(mobileHtml);
    assertCleanUiMarkup(adminHtml);
    expect(mobileHtml).toContain("Mercado");
    expect(adminHtml).toContain("Painel Administrativo Web");
  });

  it("renderiza Header e BottomNav alinhado (com badge de quantidade e sem círculo saído)", () => {
    const headerHtml = renderToStaticMarkup(
      <Header
        currentLocation="Uíge, Centro da Cidade"
        onOpenLocationModal={() => {}}
        query=""
        onQueryChange={() => {}}
        onSearch={() => {}}
        onVoiceSearch={() => {}}
        isListening={false}
        onToggleFilters={() => {}}
        filtersActive={false}
        themeMode="dark"
        onSetThemeMode={() => {}}
        unreadCount={2}
        onOpenNotifications={() => {}}
        user={{
          id: "u1",
          name: "Ana Domingos",
          email: "ana@uige.ao",
          role: "comerciante",
          province: "Uíge",
          municipality: "Uíge",
          walletBalance: 0,
          createdAt: "2026-01-01T00:00:00Z",
        }}
        onOpenAuth={() => {}}
        onOpenProfile={() => {}}
        onNavigateHome={() => {}}
        activeView="home"
        onSelectNav={() => {}}
      />
    );
    assertCleanUiMarkup(headerHtml);
    expect(headerHtml).toContain("Comerciante");
    expect(headerHtml).toContain("Usados");

    const navHtml = renderToStaticMarkup(
      <BottomNav activeView="home" onSelectNav={() => {}} cartCount={4} />
    );
    assertCleanUiMarkup(navHtml);
    expect(navHtml).toContain("Início");
    expect(navHtml).toContain("Categorias");
    expect(navHtml).toContain("Publicar");
    expect(navHtml).toContain("Carrinho");
    expect(navHtml).toContain("Conta");
    expect(navHtml).not.toContain("Pesquisa");
    expect(navHtml).toContain(">4<");
    expect(navHtml).not.toContain("-top-5");
    expect(navHtml).not.toContain("-mt-");
    expect(navHtml).toContain("pb-safe");

    const emptyStripHtml = renderToStaticMarkup(
      <BottomAdStrip ad={null} onOpen={() => {}} onDismiss={() => {}} />
    );
    expect(emptyStripHtml).toBe("");

    const activeStripHtml = renderToStaticMarkup(
      <BottomAdStrip
        ad={{
          id: "ad_strip_1",
          sellerId: "u1",
          storeId: "st_1",
          storeName: "Loja Central",
          title: "Promoção Especial no Uíge",
          imageUrl: "",
          position: "faixa",
          startDate: "2026-01-01T00:00:00Z",
          endDate: "2027-01-01T00:00:00Z",
          views: 0,
          clicks: 0,
          active: true,
          status: "aprovado",
          createdAt: "2026-01-01T00:00:00Z",
        }}
        onOpen={() => {}}
        onDismiss={() => {}}
      />
    );
    assertCleanUiMarkup(activeStripHtml);
    expect(activeStripHtml).toContain("Patrocinado");
    expect(activeStripHtml).toContain("Fechar faixa patrocinada");
    expect(activeStripHtml).toContain("Promoção Especial no Uíge");

    const statusHtml = renderToStaticMarkup(<OnlineStatusIndicator />);
    assertCleanUiMarkup(statusHtml);
  });

  it("barra inferior + faixa não cobrem botões no telemóvel (360px) e Quero vender respeita estado do cliente", () => {
    const mobileHtml = renderToStaticMarkup(<MobileApp initialBooted={true} />);
    assertCleanUiMarkup(mobileHtml);
    // O MobileApp reserva margem inferior suficiente (>5rem) e não injeta nenhum botão flutuante sobre os cartões
    expect(mobileHtml).toContain("pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))]");
    expect(mobileHtml).toContain('data-testid="mobile-bottom-dock"');
    expect(mobileHtml).toContain('data-testid="mobile-bottom-nav"');
    expect(mobileHtml).not.toContain('aria-label="Publicar artigo"');

    // Quando há faixa de anúncio activa e barra inferior juntas num dock, a faixa vem ANTES da barra
    const dockOrderHtml = renderToStaticMarkup(
      <div className="flex flex-col">
        <BottomAdStrip
          ad={{
            id: "ad_strip_2",
            sellerId: "u1",
            title: "Banner Fino",
            imageUrl: "",
            position: "faixa",
            startDate: "2026-01-01T00:00:00Z",
            endDate: "2027-01-01T00:00:00Z",
            views: 0,
            clicks: 0,
            active: true,
            status: "aprovado",
            createdAt: "2026-01-01T00:00:00Z",
          }}
          onOpen={() => {}}
          onDismiss={() => {}}
        />
        <BottomNav activeView="home" onSelectNav={() => {}} cartCount={0} embedded={true} />
      </div>
    );
    expect(dockOrderHtml.indexOf('data-testid="bottom-ad-strip"')).toBeLessThan(
      dockOrderHtml.indexOf('data-testid="mobile-bottom-nav"')
    );
    expect(dockOrderHtml).not.toContain("fixed bottom-0");

    const wantToSellHtml = renderToStaticMarkup(
      <WantToSellModal
        isOpen={true}
        onClose={() => {}}
        user={{
          id: "cli_1",
          name: "João Baptista",
          email: "joao@uige.ao",
          role: "cliente",
          walletBalance: 0,
          createdAt: "2026-01-01T00:00:00Z",
        }}
        myStore={null}
        categories={DEFAULT_CATEGORIES}
        onSubmitted={async () => {}}
        onGoToSeller={() => {}}
        showToast={() => {}}
      />
    );
    assertCleanUiMarkup(wantToSellHtml);
    expect(wantToSellHtml).toContain("Quero Vender no Uíge");
    expect(wantToSellHtml).toContain("Criar Loja e Vender Agora");
  });

  it("renderiza ProductCard com selo Usado, tipo de loja, código e preço em Kz", () => {
    const html = renderToStaticMarkup(
      <ProductCard
        product={SAMPLE_PRODUCT}
        isFavorite={false}
        onToggleFavorite={() => {}}
        onAddToCart={() => {}}
        onOpenProduct={() => {}}
      />
    );
    assertCleanUiMarkup(html);
    expect(html).toContain("Kz");
    expect(html).toContain("Usado");
    expect(html).toContain("Loja fixa");
    expect(html).toContain("Sem fotografia");
  });

  it("renderiza CourierView e SellerStudioView sem erros técnicos", () => {
    const courierHtml = renderToStaticMarkup(
      <CourierView
        user={{
          id: "c1",
          code: "CL-0002",
          name: "Pedro Afonso",
          email: "pedro@uige.ao",
          role: "entregador",
          province: "Uíge",
          municipality: "Uíge",
          bairro: "Candombe Velho",
          biNumber: "004912345UE042",
          phone: "923000111",
          isApproved: true,
          walletBalance: 0,
          createdAt: "2026-01-01T00:00:00Z",
        }}
        deliveries={[]}
        monthlyFees={[]}
        myPayments={[]}
        systemConfig={DEFAULT_SYSTEM_CONFIG}
        onOpenAuth={() => {}}
        onReload={async () => {}}
        showToast={() => {}}
      />
    );
    assertCleanUiMarkup(courierHtml);
    expect(courierHtml).toContain("Painel do Entregador");
    expect(courierHtml).toContain("Planos");

    const sellerHtml = renderToStaticMarkup(
      <SellerStudioView
        user={{
          id: "s1",
          code: "CL-0003",
          name: "Maria João",
          email: "maria@uige.ao",
          role: "comerciante",
          province: "Uíge",
          municipality: "Uíge",
          walletBalance: 0,
          createdAt: "2026-01-01T00:00:00Z",
        }}
        myStore={null}
        myProducts={[]}
        categories={DEFAULT_CATEGORIES}
        storeOrders={[]}
        myAds={[]}
        myPayments={[]}
        systemConfig={DEFAULT_SYSTEM_CONFIG}
        onOpenAuth={() => {}}
        onReload={async () => {}}
        onProductDeleted={() => {}}
        showToast={() => {}}
      />
    );
    assertCleanUiMarkup(sellerHtml);
    expect(sellerHtml).toContain("Painel do Comerciante");
    expect(sellerHtml).toContain("Criar loja");
    expect(sellerHtml).toContain('data-testid="create-store-btn"');

    const sellerWithStoreHtml = renderToStaticMarkup(
      <SellerStudioView
        user={{
          id: "s1",
          code: "CL-0003",
          name: "Maria João",
          email: "maria@uige.ao",
          role: "comerciante",
          province: "Uíge",
          municipality: "Uíge",
          walletBalance: 0,
          createdAt: "2026-01-01T00:00:00Z",
        }}
        myStore={{
          id: "st_existing_1",
          code: "LJ-0001",
          ownerId: "s1",
          name: "Loja Existente da Maria",
          description: "",
          category: "Electrónicos",
          storeType: "loja_fixa",
          province: "Uíge",
          municipality: "Uíge",
          bairro: "Centro da Cidade",
          address: "Rua Central",
          logo: "",
          isApproved: true,
          isVip: false,
          rating: 0,
          salesCount: 0,
          createdAt: "2026-01-01T00:00:00Z",
        }}
        myProducts={[]}
        categories={DEFAULT_CATEGORIES}
        storeOrders={[]}
        myAds={[]}
        myPayments={[]}
        systemConfig={DEFAULT_SYSTEM_CONFIG}
        onOpenAuth={() => {}}
        onReload={async () => {}}
        onProductDeleted={() => {}}
        showToast={() => {}}
      />
    );
    assertCleanUiMarkup(sellerWithStoreHtml);
    expect(sellerWithStoreHtml).toContain("LJ-0001");
    expect(sellerWithStoreHtml).not.toContain('data-testid="create-store-btn"');
  });

  it("renderiza ProductDetailModal fechado e aberto sem erro de Hooks do React", () => {
    const closedHtml = renderToStaticMarkup(
      <ProductDetailModal
        product={null}
        isOpen={false}
        onClose={() => {}}
        isFavorite={false}
        onToggleFavorite={() => {}}
        onAddToCart={() => {}}
        similarProducts={[]}
        onSelectProduct={() => {}}
        onSendMessage={() => {}}
        onReportProduct={() => {}}
      />
    );
    expect(closedHtml).toBe("");

    const openHtml = renderToStaticMarkup(
      <ProductDetailModal
        product={SAMPLE_PRODUCT}
        isOpen={true}
        onClose={() => {}}
        isFavorite={true}
        onToggleFavorite={() => {}}
        onAddToCart={() => {}}
        onOpenStore={() => {}}
        similarProducts={[]}
        onSelectProduct={() => {}}
        onSendMessage={() => {}}
        onReportProduct={() => {}}
      />
    );
    assertCleanUiMarkup(openHtml);
    expect(openHtml).toContain("Kz");
    expect(openHtml).toContain("Cooperativa Negage");
  });

  it("renderiza modais Auth, Location e Privacy sem texto técnico", () => {
    const authHtml = renderToStaticMarkup(
      <AuthModal isOpen={true} initialMode="login" onClose={() => {}} onSuccess={() => {}} showToast={() => {}} />
    );
    const authRegisterHtml = renderToStaticMarkup(
      <AuthModal isOpen={true} initialMode="register" onClose={() => {}} onSuccess={() => {}} showToast={() => {}} />
    );
    const locHtml = renderToStaticMarkup(
      <LocationModal
        isOpen={true}
        onClose={() => {}}
        currentLocation="Uíge, Centro da Cidade"
        onSelectLocation={() => {}}
      />
    );
    const privHtml = renderToStaticMarkup(
      <PrivacyPolicyModal isOpen={true} onClose={() => {}} isLoggedIn={false} />
    );

    assertCleanUiMarkup(authHtml);
    assertCleanUiMarkup(authRegisterHtml);
    assertCleanUiMarkup(locHtml);
    assertCleanUiMarkup(privHtml);
    expect(authHtml).toContain("Esqueci a palavra-passe");
    expect(authHtml).toContain("Entrar na Conta");
    expect(authRegisterHtml).toContain("Confirmar Palavra-passe");
    expect(privHtml).toContain("Enviar pedido por WhatsApp");
  });

  it("renderiza SafeImage e ErrorBoundary em cenários de falha", () => {
    const imgFallback = renderToStaticMarkup(<SafeImage src="" alt="Produto teste" />);
    assertCleanUiMarkup(imgFallback);
    expect(imgFallback).toContain("Sem fotografia");

    const okBoundary = renderToStaticMarkup(
      <ErrorBoundary>
        <div>Conteúdo OK</div>
      </ErrorBoundary>
    );
    expect(okBoundary).toContain("Conteúdo OK");

    const publishHtml = renderToStaticMarkup(
      <PublishProductModal
        isOpen={true}
        onClose={() => {}}
        user={{
          id: "u-merc",
          name: "Comerciante Teste",
          email: "merc@uige.ao",
          role: "comerciante",
          isApproved: true,
          province: "Uíge",
          municipality: "Uíge",
          walletBalance: 0,
          createdAt: "2026-01-01T00:00:00Z",
        }}
        myStore={{
          id: "st-1",
          ownerId: "u-merc",
          name: "Banca Teste",
          description: "",
          category: "Moda",
          storeType: "loja_fixa",
          province: "Uíge",
          municipality: "Uíge",
          logo: "",
          isApproved: true,
          isVip: false,
          rating: 5,
          salesCount: 0,
          createdAt: "2026-01-01T00:00:00Z",
        }}
        categories={DEFAULT_CATEGORIES}
        systemConfig={{ ...DEFAULT_SYSTEM_CONFIG, requireProductApproval: true }}
        onPublished={() => {}}
        onGoToSeller={() => {}}
        showToast={() => {}}
      />
    );
    assertCleanUiMarkup(publishHtml);
    expect(publishHtml).toContain("Publicar Novo Artigo");
    expect(publishHtml).toContain("Vídeo (≤ 15s / 10MB)");
    expect(publishHtml).toContain("aguarda aprovação");
  });

  it("renderiza SponsoredMediaView, FullscreenAdOverlay e AdsSection (só plano pago)", () => {
    const sampleAd = {
      id: "ad_1",
      storeId: "st_paid",
      sellerId: "u1",
      storeName: "Super Uíge",
      title: "Campanha em Vídeo",
      subtitle: "Entregas rápidas hoje",
      imageUrl: "https://cdn.example.com/poster.jpg",
      videoUrl: "https://cdn.example.com/ad.mp4",
      mediaType: "video" as const,
      position: "topo" as const,
      startDate: "2026-01-01T00:00:00Z",
      endDate: "2027-01-01T00:00:00Z",
      views: 12,
      clicks: 3,
      active: true,
      status: "aprovado" as const,
      createdAt: "2026-01-01T00:00:00Z",
    };

    const inlineMediaHtml = renderToStaticMarkup(<SponsoredMediaView ad={sampleAd} />);
    assertCleanUiMarkup(inlineMediaHtml);
    expect(inlineMediaHtml).toContain("<video");
    expect(inlineMediaHtml).toContain("muted");

    const origDescriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, "connection");
    Object.defineProperty(globalThis.navigator, "connection", {
      configurable: true,
      value: { type: "cellular" },
    });
    const cellularMediaHtml = renderToStaticMarkup(<SponsoredMediaView ad={sampleAd} />);
    if (origDescriptor) {
      Object.defineProperty(globalThis.navigator, "connection", origDescriptor);
    } else {
      delete (globalThis.navigator as any).connection;
    }
    expect(cellularMediaHtml).not.toContain("<video");
    expect(cellularMediaHtml).toContain("Reproduzir");

    const fullscreenHtml = renderToStaticMarkup(
      <FullscreenAdOverlay ad={sampleAd} store={null} onClose={() => {}} onOpenStore={() => {}} />
    );
    assertCleanUiMarkup(fullscreenHtml);
    expect(fullscreenHtml).toContain("Patrocinado");
    expect(fullscreenHtml).toContain("Fechar em 5s");
    expect(fullscreenHtml).toContain("Visitar Super Uíge");

    const adsAdminHtml = renderToStaticMarkup(
      <AdsSection
        ads={[sampleAd]}
        stores={[
          {
            id: "st_paid",
            code: "LJ-0001",
            ownerId: "u1",
            name: "Loja Paga VIP",
            description: "",
            category: "Moda",
            storeType: "loja_fixa",
            province: "Uíge",
            municipality: "Uíge",
            logo: "",
            isApproved: true,
            isVip: true,
            planType: "vip",
            rating: 5,
            salesCount: 10,
            createdAt: "2026-01-01T00:00:00Z",
          },
          {
            id: "st_free",
            code: "LJ-0002",
            ownerId: "u2",
            name: "Loja Grátis Oculta",
            description: "",
            category: "Moda",
            storeType: "loja_fixa",
            province: "Uíge",
            municipality: "Uíge",
            logo: "",
            isApproved: true,
            isVip: false,
            planType: "gratis",
            rating: 5,
            salesCount: 0,
            createdAt: "2026-01-01T00:00:00Z",
          },
        ]}
        defaultAdvertiserType="loja"
        onCreateAd={async () => {}}
        onUpdateAd={async () => {}}
        onToggleAd={() => {}}
        onDeleteAd={() => {}}
      />
    );
    assertCleanUiMarkup(adsAdminHtml);
    expect(adsAdminHtml).toContain("Plataforma (Mercado Uíge)");
    expect(adsAdminHtml).toContain("Externo (Cliente sem loja)");
    expect(adsAdminHtml).toContain("Faixa acima da barra");
    expect(adsAdminHtml).toContain("Ecrã inteiro");
    expect(adsAdminHtml).toContain('data-testid="admin-ad-preview"');
    expect(adsAdminHtml).toContain("Editar");
    expect(adsAdminHtml).toContain("Loja Paga VIP");
    expect(adsAdminHtml).not.toContain("Loja Grátis Oculta");

    const emptyAdsHtml = renderToStaticMarkup(
      <AdsSection
        ads={[]}
        stores={[]}
        onCreateAd={async () => {}}
        onToggleAd={() => {}}
        onDeleteAd={() => {}}
      />
    );
    assertCleanUiMarkup(emptyAdsHtml);
    expect(emptyAdsHtml).toContain("Criar o primeiro anúncio");

    const paymentsHtml = renderToStaticMarkup(
      <PaymentsSection
        payments={[
          {
            id: "pay_ext_1",
            sellerId: "admin_1",
            advertiserName: "Farmácia Central Uíge",
            type: "anuncio_externo",
            amountKz: 25000,
            method: "Transferência",
            proofUrl: "https://cdn.example.com/comprovativo.jpg",
            status: "pendente",
            createdAt: "2026-02-01T10:00:00Z",
          },
        ]}
        onPreviewImage={() => {}}
        onConfirmPayment={() => {}}
        onRejectPayment={() => {}}
      />
    );
    assertCleanUiMarkup(paymentsHtml);
    expect(paymentsHtml).toContain("Farmácia Central Uíge");
    expect(paymentsHtml).toContain("Anúncio Externo");
    expect(paymentsHtml).toContain("Ver Comprovativo");
  });

  it("renderiza HomeBannerCarousel (16:9 máx 210px, oculto se vazio, campos opcionais, link condicional e vídeo com capa em dados móveis)", () => {
    const emptyCarouselHtml = renderToStaticMarkup(
      <HomeBannerCarousel
        banners={[]}
        autoplay={true}
        defaultDurationSec={8}
        onOpenBanner={() => {}}
      />
    );
    expect(emptyCarouselHtml).toBe("");

    const paidTextLinkBanner = {
      id: "b_paid",
      advertiserType: "externo" as const,
      advertiserName: "Supermercado Uíge",
      bannerCategory: "patrocinado" as const,
      isPaid: true,
      priority: 20,
      order: 1,
      durationSec: 10,
      sellerId: "admin_1",
      title: "Semana dos Frescos",
      description: "Descontos em frutas e legumes do Negage.",
      ctaText: "Aproveitar Agora",
      destinationType: "link" as const,
      destinationValue: "https://superuige.ao/frescos",
      imageUrl: "https://cdn.example.com/banner1.webp",
      position: "topo" as const,
      startDate: "2026-01-01T00:00:00Z",
      endDate: "2027-01-01T00:00:00Z",
      views: 150,
      clicks: 12,
      active: true,
      status: "aprovado" as const,
      createdAt: "2026-01-01T00:00:00Z",
    };

    const freeImageOnlyBanner = {
      id: "b_image_only",
      advertiserType: "plataforma" as const,
      advertiserName: "Mercado Uíge",
      bannerCategory: "publico" as const,
      isPaid: false,
      priority: 5,
      order: 2,
      durationSec: null,
      sellerId: "admin_1",
      title: "",
      description: "",
      ctaText: "",
      destinationType: "nenhum" as const,
      destinationValue: "",
      imageUrl: "https://cdn.example.com/banner2.webp",
      position: "topo" as const,
      startDate: null,
      endDate: null,
      views: 80,
      clicks: 4,
      active: true,
      status: "aprovado" as const,
      createdAt: "2026-01-01T00:00:00Z",
    };

    const videoBanner = {
      id: "b_video",
      advertiserType: "plataforma" as const,
      advertiserName: "Mercado Uíge",
      bannerCategory: "publico" as const,
      isPaid: false,
      priority: 1,
      order: 3,
      durationSec: 15,
      sellerId: "admin_1",
      title: "",
      description: "",
      ctaText: "",
      destinationType: "nenhum" as const,
      imageUrl: "https://cdn.example.com/video-cover.webp",
      videoUrl: "https://cdn.example.com/promo.mp4",
      mediaType: "video" as const,
      position: "topo" as const,
      startDate: null,
      endDate: null,
      views: 20,
      clicks: 1,
      active: true,
      status: "aprovado" as const,
      createdAt: "2026-01-01T00:00:00Z",
    };

    // 1. Banner pago com título, descrição, botão vermelho e link clicável
    const paidFirstHtml = renderToStaticMarkup(
      <HomeBannerCarousel
        banners={[freeImageOnlyBanner, paidTextLinkBanner, videoBanner]}
        autoplay={true}
        defaultDurationSec={8}
        activeIndex={0}
        onOpenBanner={() => {}}
      />
    );
    assertCleanUiMarkup(paidFirstHtml);
    expect(paidFirstHtml).toContain("max-h-[230px]");
    expect(paidFirstHtml).toContain("aspect-[16/9]");
    expect(paidFirstHtml).toContain("max-h-[210px]");
    expect(paidFirstHtml).toContain("object-cover object-center");
    expect(paidFirstHtml).toContain('data-testid="banner-paid-badge"');
    expect(paidFirstHtml).toContain("Patrocinado");
    expect(paidFirstHtml).toContain('data-testid="banner-text-overlay"');
    expect(paidFirstHtml).toContain("text-[14px]");
    expect(paidFirstHtml).toContain("text-[12px]");
    expect(paidFirstHtml).toContain("bg-red-600");
    expect(paidFirstHtml).toContain("Semana dos Frescos");
    expect(paidFirstHtml).toContain("Aproveitar Agora");
    expect(paidFirstHtml).toContain('role="button"');
    expect(paidFirstHtml).toContain("cursor-pointer");
    expect(paidFirstHtml).toContain('data-testid="banner-dots"');

    // 2. Banner gratuito só imagem: tamanho idêntico 16:9 <=210px, SEM faixa de texto, SEM Patrocinado, SEM cursor de clique
    const imageOnlyHtml = renderToStaticMarkup(
      <HomeBannerCarousel
        banners={[freeImageOnlyBanner, paidTextLinkBanner, videoBanner]}
        autoplay={false}
        defaultDurationSec={8}
        activeIndex={1}
        onOpenBanner={() => {}}
      />
    );
    assertCleanUiMarkup(imageOnlyHtml);
    expect(imageOnlyHtml).toContain("aspect-[16/9]");
    expect(imageOnlyHtml).toContain("max-h-[210px]");
    expect(imageOnlyHtml).not.toContain('data-testid="banner-paid-badge"');
    expect(imageOnlyHtml).not.toContain('data-testid="banner-text-overlay"');
    expect(imageOnlyHtml).not.toContain("Ver oferta");
    expect(imageOnlyHtml).not.toContain('role="button"');
    expect(imageOnlyHtml).toContain("cursor-default");

    // 3. Banner em vídeo em Wi-Fi (autoplay muted loop + barra de progresso) vs Dados móveis (capa + botão Reproduzir)
    const wifiVideoHtml = renderToStaticMarkup(
      <HomeBannerCarousel
        banners={[freeImageOnlyBanner, paidTextLinkBanner, videoBanner]}
        autoplay={false}
        defaultDurationSec={8}
        activeIndex={2}
        onOpenBanner={() => {}}
      />
    );
    assertCleanUiMarkup(wifiVideoHtml);
    expect(wifiVideoHtml).toContain("aspect-[16/9]");
    expect(wifiVideoHtml).toContain("max-h-[210px]");
    expect(wifiVideoHtml).toContain("<video");
    expect(wifiVideoHtml).toContain("autoPlay");
    expect(wifiVideoHtml).toContain("loop");
    expect(wifiVideoHtml).toContain('data-testid="banner-video-progress"');

    const prevNav = (globalThis as any).navigator;
    Object.defineProperty(globalThis, "navigator", {
      value: { connection: { type: "cellular" } },
      configurable: true,
    });
    const cellularVideoHtml = renderToStaticMarkup(
      <HomeBannerCarousel
        banners={[freeImageOnlyBanner, paidTextLinkBanner, videoBanner]}
        autoplay={false}
        defaultDurationSec={8}
        activeIndex={2}
        onOpenBanner={() => {}}
      />
    );
    Object.defineProperty(globalThis, "navigator", {
      value: prevNav,
      configurable: true,
    });
    assertCleanUiMarkup(cellularVideoHtml);
    expect(cellularVideoHtml).not.toContain("<video");
    expect(cellularVideoHtml).toContain("Reproduzir");
    expect(cellularVideoHtml).toContain("https://cdn.example.com/video-cover.webp");

    // 4. Painel admin: campos opcionais sem *, recomendação 1600x900 (16:9), vídeo 15s / 5 MB, pré-visualização 16:9
    const adsSectionHtml = renderToStaticMarkup(
      <AdsSection
        ads={[paidTextLinkBanner, freeImageOnlyBanner]}
        stores={[]}
        defaultBannerDurationSec={DEFAULT_SYSTEM_CONFIG.bannerDefaultDurationSec}
        onCreateAd={async () => {}}
        onUpdateAd={async () => {}}
        onToggleAd={() => {}}
        onReviewAd={() => {}}
        onSuspendAd={() => {}}
        onReorderAd={() => {}}
        onDeleteAd={() => {}}
      />
    );
    assertCleanUiMarkup(adsSectionHtml);
    expect(adsSectionHtml).toContain("Título (opcional)");
    expect(adsSectionHtml).toContain("Descrição (opcional)");
    expect(adsSectionHtml).toContain("Texto do botão (opcional)");
    expect(adsSectionHtml).toContain("Sem link (apenas banner)");
    expect(adsSectionHtml).not.toContain("Título do banner *");
    expect(adsSectionHtml).toContain("recomendado 1600x900 (16:9)");
    expect(adsSectionHtml).toContain("15 s e 5 MB");
    expect(adsSectionHtml).toContain('data-testid="admin-ad-preview"');
    expect(adsSectionHtml).toContain("aspect-[16/9] max-h-[210px]");
    expect(adsSectionHtml).toContain("Activos");
    expect(adsSectionHtml).toContain("Suspender");

    const configHtml = renderToStaticMarkup(
      <ConfigSection
        currentUser={{
          id: "adm_1",
          name: "Admin Uíge",
          email: "admin@uige.ao",
          role: "super_admin",
          walletBalance: 0,
          createdAt: "2026-01-01T00:00:00Z",
        }}
        systemConfig={DEFAULT_SYSTEM_CONFIG}
        users={[]}
        onRequestSaveConfig={() => {}}
        onRequestChangeRole={() => {}}
      />
    );
    assertCleanUiMarkup(configHtml);
    expect(configHtml).toContain("Carrossel de Banners (Definição Global)");
    expect(configHtml).toContain("Reprodução automática ligada");
    expect(configHtml).toContain("20s");
  });

  it("renderiza AdsSection com fuso Africa/Luanda (UTC+1), Publicar agora, Rascunho, Agendado e motivo visível (FASE 1)", () => {
    const futureIso = new Date(Date.now() + 3 * 86400_000).toISOString();
    const futureEndIso = new Date(Date.now() + 10 * 86400_000).toISOString();

    const scheduledBanner = {
      id: "ad_sched",
      advertiserType: "plataforma" as const,
      advertiserName: "Mercado Uíge",
      bannerCategory: "publico" as const,
      isPaid: false,
      sellerId: "adm_1",
      title: "Campanha Agendada Luanda",
      imageUrl: "",
      position: "topo" as const,
      startDate: futureIso,
      endDate: futureEndIso,
      views: 0,
      clicks: 0,
      active: true,
      status: "aprovado" as const,
      createdAt: "2026-01-01T00:00:00Z",
    };

    const draftBanner = {
      id: "ad_draft",
      advertiserType: "plataforma" as const,
      advertiserName: "Mercado Uíge",
      bannerCategory: "publico" as const,
      isPaid: false,
      sellerId: "adm_1",
      title: "Banner em Rascunho",
      imageUrl: "",
      position: "topo" as const,
      startDate: null,
      endDate: null,
      views: 0,
      clicks: 0,
      active: false,
      status: "rascunho" as const,
      statusReason: "Falta aprovar arte gráfica",
      createdAt: "2026-01-01T00:00:00Z",
    };

    const html = renderToStaticMarkup(
      <AdsSection
        ads={[scheduledBanner, draftBanner]}
        stores={[]}
        defaultBannerDurationSec={DEFAULT_SYSTEM_CONFIG.bannerDefaultDurationSec}
        onCreateAd={async () => {}}
        onUpdateAd={async () => {}}
        onToggleAd={() => {}}
        onDeleteAd={() => {}}
      />
    );
    assertCleanUiMarkup(html);
    expect(html).toContain("Africa/Luanda");
    expect(html).toContain("Publicar agora");
    expect(html).toContain("Guardar Rascunho");
    expect(html).toContain("Agendado para");
    expect(html).toContain("Rascunho");
    expect(html).toContain("Falta aprovar arte gráfica");
    expect(html).toContain("Sem datas (contínuo)");
  });

  it("renderiza StoreDetailView com isolamento estrito, selo só em loja aprovada, estados vazios reais e barra fixa Chat + Seguir", () => {
    const storeA = {
      id: "st_a",
      code: "LJ-0010",
      ownerId: "seller_shared",
      name: "Loja Centro Uíge",
      description: "Comércio geral no centro.",
      category: "Alimentação",
      storeType: "loja_fixa" as const,
      province: "Uíge",
      municipality: "Uíge",
      bairro: "Centro da Cidade",
      address: "Rua do Comércio, 15",
      phone: "923444555",
      logo: "",
      cover: "https://cdn.example.com/capa.jpg",
      isApproved: true,
      verified: true,
      isVip: false,
      rating: 0,
      reviewsCount: 0,
      salesCount: 0,
      followersCount: 0,
      deliveredOrdersCount: 0,
      createdAt: "2026-01-15T10:00:00Z",
    };

    const unapprovedStore = {
      ...storeA,
      id: "st_pending",
      isApproved: true,
      verified: false,
      name: "Loja Não Verificada",
    };

    const mixedProducts: Product[] = [
      {
        ...SAMPLE_PRODUCT,
        id: "p_store_a",
        storeId: "st_a",
        sellerId: "seller_shared",
        name: "Fuba de Bombó Local",
        price: 3000,
        oldPrice: 4000,
        discount: 25,
        sales: 0,
      },
      {
        ...SAMPLE_PRODUCT,
        id: "p_other_store",
        storeId: "st_b",
        sellerId: "seller_shared",
        name: "Produto Intruso Outra Loja",
      },
    ];

    const approvedHtml = renderToStaticMarkup(
      <StoreDetailView
        store={storeA}
        products={mixedProducts}
        reviews={[]}
        stats={{
          productsCount: 1,
          deliveredOrdersCount: 0,
          followersCount: 0,
          rating: 0,
          reviewsCount: 0,
        }}
        orders={[]}
        currentUser={null}
        favorites={[]}
        isFollowing={false}
        followersCount={0}
        onBack={() => {}}
        onToggleFollow={() => {}}
        onToggleFavorite={() => {}}
        onAddToCart={() => {}}
        onOpenProduct={() => {}}
        onSubmitReview={async () => {}}
        onSubmitReport={async () => {}}
        onRequireAuth={() => {}}
      />
    );
    assertCleanUiMarkup(approvedHtml);
    expect(approvedHtml).toContain("Loja verificada");
    expect(approvedHtml).not.toContain("Suporte 24/7");
    expect(approvedHtml).toContain("Em actividade desde");
    expect(approvedHtml).toContain("Fuba de Bombó Local");
    expect(approvedHtml).not.toContain("Produto Intruso Outra Loja");
    expect(approvedHtml).toContain("-25%");
    expect(approvedHtml).toContain("0 vendidos");
    expect(approvedHtml).toContain("Sem avaliações");
    expect(approvedHtml).toContain('data-testid="store-bottom-bar"');
    expect(approvedHtml).toContain("Chat");
    expect(approvedHtml).toContain("Seguir loja");
    expect(approvedHtml).toContain("https://wa.me/244923444555");

    const pendingHtml = renderToStaticMarkup(
      <StoreDetailView
        store={unapprovedStore}
        products={[]}
        reviews={[]}
        orders={[]}
        currentUser={null}
        favorites={[]}
        isFollowing={true}
        followersCount={1}
        onBack={() => {}}
        onToggleFollow={() => {}}
        onToggleFavorite={() => {}}
        onAddToCart={() => {}}
        onOpenProduct={() => {}}
        onSubmitReview={async () => {}}
        onSubmitReport={async () => {}}
        onRequireAuth={() => {}}
      />
    );
    assertCleanUiMarkup(pendingHtml);
    expect(pendingHtml).not.toContain("Loja verificada");
    expect(pendingHtml).toContain("Vendedor não verificado");
    expect(pendingHtml).toContain("Esta loja ainda não publicou artigos");
    expect(pendingHtml).toContain("A seguir loja");
  });

  it("renderiza ProductDetailModal com galeria 1/N, Ver mais, vendedor verificado, ReviewsSection e Comprar agora", () => {
    const detailedProduct: Product = {
      ...SAMPLE_PRODUCT,
      sales: 0,
      oldPrice: 5500,
      price: 4500,
      image: "https://cdn.example.com/p1.jpg",
      images: ["https://cdn.example.com/p1.jpg", "https://cdn.example.com/p2.jpg"],
      description:
        "Descrição extensa do produto agrícola do Uíge colhido nesta época com qualidade seleccionada para entrega em toda a província e municípios vizinhos do Negage e Quitexe.",
    };

    const modalHtml = renderToStaticMarkup(
      <ProductDetailModal
        product={detailedProduct}
        isOpen={true}
        onClose={() => {}}
        isFavorite={false}
        onToggleFavorite={() => {}}
        onAddToCart={() => {}}
        onBuyNow={() => {}}
        onOpenStore={() => {}}
        sellerStore={{
          id: "store_1",
          ownerId: "seller_1",
          name: "Cooperativa Negage",
          description: "",
          category: "Alimentação",
          storeType: "loja_fixa",
          province: "Uíge",
          municipality: "Negage",
          logo: "",
          isApproved: true,
          verified: true,
          isVip: false,
          rating: 0,
          salesCount: 0,
          createdAt: "2026-01-10T10:00:00Z",
        }}
        productReviews={[]}
        orders={[]}
        currentUser={null}
        similarProducts={[]}
        onSelectProduct={() => {}}
        onSendMessage={() => {}}
        onReportProduct={() => {}}
      />
    );
    assertCleanUiMarkup(modalHtml);
    expect(modalHtml).toContain("1 / 2");
    expect(modalHtml).toContain("-18%");
    expect(modalHtml).toContain("0 vendidos");
    expect(modalHtml).toContain("Ainda sem avaliações");
    expect(modalHtml).toContain("Ver mais");
    expect(modalHtml).toContain("Visitar loja");
    expect(modalHtml).toContain("Loja verificada");
    expect(modalHtml).not.toContain("Suporte 24/7");
    expect(modalHtml).toContain('data-testid="product-bottom-bar"');
    expect(modalHtml).toContain("Adicionar ao carrinho");
    expect(modalHtml).toContain("Comprar agora");

    const galleryHtml = renderToStaticMarkup(
      <ImageGalleryModal
        images={["https://cdn.example.com/p1.jpg", "https://cdn.example.com/p2.jpg"]}
        title="Café do Uíge"
        initialIndex={0}
        isOpen={true}
        onClose={() => {}}
      />
    );
    assertCleanUiMarkup(galleryHtml);
    expect(galleryHtml).toContain("1 / 2");
    expect(galleryHtml).toContain('aria-label="Ver grelha de fotografias"');
    expect(galleryHtml).toContain('aria-label="Ampliar fotografia"');

    const reviewsHtml = renderToStaticMarkup(
      <ReviewsSection
        reviews={[
          {
            id: "rev_1",
            productId: "prod_1",
            userId: "u1",
            userName: "Mateus Sebastião",
            stars: 5,
            comment: "Excelente café!",
            photos: ["https://cdn.example.com/r1.jpg"],
            verifiedPurchase: true,
            createdAt: "2026-02-01T10:00:00Z",
          },
        ]}
        currentUser={{
          id: "u2",
          name: "Comprador Sem Encomenda",
          email: "comp@uige.ao",
          role: "cliente",
          walletBalance: 0,
          createdAt: "2026-01-01T00:00:00Z",
        }}
        canReview={false}
        onSubmitReview={async () => {}}
      />
    );
    assertCleanUiMarkup(reviewsHtml);
    expect(reviewsHtml).toContain("Mateus Sebastião");
    expect(reviewsHtml).toContain("MS");
    expect(reviewsHtml).toContain("Com fotos (1)");
    expect(reviewsHtml).toContain("Verificadas (1)");
    expect(reviewsHtml).toContain('data-testid="review-locked-notice"');
  });

  it("renderiza CartView agrupado por loja com subtotais, entrega e 1 botão WhatsApp por loja", () => {
    const p1: Product = { ...SAMPLE_PRODUCT, id: "p_a", storeId: "st_1", storeName: "Loja Alfa", price: 5000 };
    const p2: Product = { ...SAMPLE_PRODUCT, id: "p_b", storeId: "st_2", storeName: "Loja Beta", price: 3000 };

    const cartHtml = renderToStaticMarkup(
      <CartView
        cartGroups={[
          {
            storeKey: "st_1",
            storeId: "st_1",
            storeName: "Loja Alfa",
            storeCode: "LJ-0001",
            storeType: "loja_fixa",
            items: [{ productId: "p_a", qty: 2, product: p1 }],
            subtotal: 10000,
          },
          {
            storeKey: "st_2",
            storeId: "st_2",
            storeName: "Loja Beta",
            storeCode: "LJ-0002",
            storeType: "vendedor_ambulante",
            items: [{ productId: "p_b", qty: 1, product: p2 }],
            subtotal: 3000,
          },
        ]}
        stores={[]}
        systemConfig={DEFAULT_SYSTEM_CONFIG}
        checkoutDeliveryType="entrega"
        onChangeDeliveryType={() => {}}
        checkoutPayment="Multicaixa Express"
        onChangePayment={() => {}}
        checkoutPhone="923111222"
        onChangePhone={() => {}}
        checkoutAddress="Bairro Bem-Vindo, Uíge"
        onChangeAddress={() => {}}
        cartSubtotal={13000}
        cartDeliveryTotal={3000}
        cartTotal={16000}
        recentOrders={[
          {
            id: "ord_1",
            code: "MU-1001",
            userId: "u1",
            storeId: "st_1",
            storeName: "Loja Alfa",
            storePhone: "923000111",
            items: [{ id: "oi_1", productId: "p_a", productName: "Café", price: 5000, qty: 2 }],
            subtotal: 10000,
            deliveryFee: 1500,
            total: 11500,
            status: "Pendente",
            paymentMethod: "Multicaixa Express",
            address: "Uíge",
            createdAt: "2026-02-01T10:00:00Z",
          },
          {
            id: "ord_2",
            code: "MU-1002",
            userId: "u1",
            storeId: "st_2",
            storeName: "Loja Beta",
            storePhone: "923000222",
            items: [{ id: "oi_2", productId: "p_b", productName: "Fuba", price: 3000, qty: 1 }],
            subtotal: 3000,
            deliveryFee: 1500,
            total: 4500,
            status: "Pendente",
            paymentMethod: "Multicaixa Express",
            address: "Uíge",
            createdAt: "2026-02-01T10:00:00Z",
          },
        ]}
        onUpdateQty={() => {}}
        onRemoveItem={() => {}}
        onConfirmOrder={() => {}}
        onExploreCatalog={() => {}}
      />
    );
    assertCleanUiMarkup(cartHtml);
    expect(cartHtml).toContain("Loja Alfa");
    expect(cartHtml).toContain("Loja Beta");
    expect(cartHtml).toContain("Finalizar compra");
    expect(cartHtml).toContain('data-testid="cart-wa-btn-st_1"');
    expect(cartHtml).toContain('data-testid="cart-wa-btn-st_2"');
    expect(cartHtml).toContain("Enviar por WhatsApp (Loja Alfa)");
    expect(cartHtml).toContain("Enviar por WhatsApp (Loja Beta)");
  });

  it("define todas as variáveis --rbw-* e @custom-variant dark no src/index.css da pré-visualização (sem ecrã preto transparente)", () => {
    const rootCssPath = path.resolve(process.cwd(), "src/index.css");
    const rootCss = fs.readFileSync(rootCssPath, "utf-8");
    expect(rootCss).toContain("@custom-variant dark");
    const requiredTokens = [
      "--rbw-bg",
      "--rbw-surface",
      "--rbw-surface-2",
      "--rbw-border",
      "--rbw-text",
      "--rbw-muted",
      "--rbw-red",
      "--rbw-red-hover",
      "--rbw-red-soft",
    ];
    for (const token of requiredTokens) {
      expect(rootCss.split(token).length - 1).toBeGreaterThanOrEqual(2);
    }
  });
});
