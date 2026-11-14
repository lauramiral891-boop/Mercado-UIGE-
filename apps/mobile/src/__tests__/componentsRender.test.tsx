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
import { ProductCard } from "../components/ProductCard";
import { ProductDetailModal } from "../components/ProductDetailModal";
import { AuthModal } from "../components/AuthModal";
import { LocationModal } from "../components/LocationModal";
import { PrivacyPolicyModal } from "../components/PrivacyPolicyModal";
import { OnlineStatusIndicator } from "../components/OnlineStatusIndicator";
import { CourierView } from "../components/CourierView";
import { SellerStudioView } from "../components/SellerStudioView";
import { MobileApp } from "../App";
import { AdminApp } from "../../../admin/src/App";

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
    expect(navHtml).toContain("Carrinho");
    expect(navHtml).toContain(">4<");
    expect(navHtml).not.toContain("-top-5");

    const statusHtml = renderToStaticMarkup(<OnlineStatusIndicator />);
    assertCleanUiMarkup(statusHtml);
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
      <AuthModal isOpen={true} onClose={() => {}} onSuccess={() => {}} showToast={() => {}} />
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
    assertCleanUiMarkup(locHtml);
    assertCleanUiMarkup(privHtml);
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
  });
});
