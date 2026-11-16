import React from "react";
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
import { MobileApp } from "../App";
import { AdminApp } from "../../../admin/src/App";
import { AdsSection, PaymentsSection } from "../../../admin/src/components/OperationalSections";

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
    expect(wantToSellHtml).toContain("Enviar Pedido para Aprovação");
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
});
