import { describe, it, expect } from "vitest";
import { smartSearch, normalize } from "../utils";

const CATALOG = [
  {
    id: "p-iphone-13",
    name: "iPhone 13 128GB",
    brand: "Apple",
    categoryName: "Electrónicos",
    description: "Telemóvel original novo na caixa com garantia.",
    price: 450000,
    stock: 4,
    sales: 8,
    rating: 4.9,
  },
  {
    id: "p-iphone-capa",
    name: "Capa Protectora para iPhone",
    brand: "Spigen",
    categoryName: "Electrónicos",
    description: "Capa resistente compatível com iPhone 13 e 14.",
    price: 4500,
    stock: 20,
    sales: 15,
    rating: 4.7,
  },
  {
    id: "p-samsung-a54",
    name: "Samsung Galaxy A54 5G",
    brand: "Samsung",
    categoryName: "Electrónicos",
    description: "Smartphone Android com 256GB.",
    price: 290000,
    stock: 6,
    sales: 10,
    rating: 4.8,
  },
  {
    id: "p-cafe-uige",
    name: "Café do Uíge em Grão 1Kg",
    brand: "Fazenda Negage",
    categoryName: "Alimentos",
    description: "Café arábica torrado localmente.",
    price: 4500,
    stock: 30,
    sales: 50,
    rating: 5.0,
  },
  {
    id: "p-fones-jbl",
    name: "Fones Bluetooth Sem Fio",
    brand: "JBL",
    categoryName: "Electrónicos",
    description: "Auscultadores de alta qualidade de som.",
    price: 18000,
    stock: 12,
    sales: 20,
    rating: 4.6,
  },
  {
    id: "p-televisor",
    name: "Televisor Smart 43 Polegadas",
    brand: "LG",
    categoryName: "Casa e Lar",
    description: "Ecrã Full HD para sala.",
    price: 210000,
    stock: 3,
    sales: 5,
    rating: 4.5,
  },
];

describe("Motor de Pesquisa Inteligente — Mercado Uíge", () => {
  it("normaliza acentos, maiúsculas, pontuação e espaços extra", () => {
    expect(normalize("  IPHONE   13!!  Água & Café  ")).toBe("iphone 13 agua cafe");
  });

  it("pesquisar 'iphone' devolve apenas iPhones e acessórios de iPhone", () => {
    const res = smartSearch(CATALOG, "iphone").map((r) => r.item.id);
    expect(res).toEqual(["p-iphone-13", "p-iphone-capa"]);
    expect(res).not.toContain("p-samsung-a54");
    expect(res).not.toContain("p-cafe-uige");
    expect(res).not.toContain("p-televisor");
  });

  it("pesquisar 'IPHONE 13!!' devolve resultados relevantes ordenados por relevância exacta", () => {
    const res = smartSearch(CATALOG, "IPHONE 13!!").map((r) => r.item.id);
    expect(res[0]).toBe("p-iphone-13");
    expect(res).not.toContain("p-cafe-uige");
    expect(res).not.toContain("p-samsung-a54");
  });

  it("pesquisar 'ifone' reconhece iPhone sem misturar com 'Fones Bluetooth' nem artigos irrelevantes", () => {
    const res = smartSearch(CATALOG, "ifone").map((r) => r.item.id);
    expect(res).toContain("p-iphone-13");
    expect(res).toContain("p-iphone-capa");
    expect(res).not.toContain("p-fones-jbl");
    expect(res).not.toContain("p-cafe-uige");
  });

  it("pesquisar 'samsung' devolve apenas produtos Samsung", () => {
    const res = smartSearch(CATALOG, "samsung").map((r) => r.item.id);
    expect(res).toEqual(["p-samsung-a54"]);
  });

  it("pesquisar 'iphon' (gralha em palavra >= 4 letras com 1 letra de diferença) encontra iPhone", () => {
    const res = smartSearch(CATALOG, "iphon").map((r) => r.item.id);
    expect(res).toContain("p-iphone-13");
  });

  it("palavras sem correspondência no catálogo devolvem lista vazia ('Nada encontrado')", () => {
    const res = smartSearch(CATALOG, "frigorifico industrial");
    expect(res).toEqual([]);
  });

  it("respeita pesos estritos: nome > marca > categoria > descrição", () => {
    const items = [
      { id: "by-desc", name: "Cabo USB-C", brand: "Genérico", categoryName: "Acessórios", description: "Compatível com Xiaomi" },
      { id: "by-cat", name: "Carregador Rápido", brand: "Genérico", categoryName: "Xiaomi", description: "Original" },
      { id: "by-brand", name: "Pulseira", brand: "Xiaomi", categoryName: "Desporto", description: "Preta" },
      { id: "by-name", name: "Xiaomi Redmi Note 13", brand: "Outro", categoryName: "Telemóveis", description: "Novo" },
    ];
    const ranked = smartSearch(items, "xiaomi").map((r) => r.item.id);
    expect(ranked).toEqual(["by-name", "by-brand", "by-cat", "by-desc"]);
  });

  it("histórico local de cliques ordena apenas resultados já relevantes sem injectar lixo", () => {
    const res = smartSearch(CATALOG, "iphone", {
      personalization: {
        clickedProductIds: ["p-iphone-capa", "p-cafe-uige"],
        preferredCategories: ["Alimentos"],
      },
    }).map((r) => r.item.id);

    expect(res).toContain("p-iphone-13");
    expect(res).toContain("p-iphone-capa");
    expect(res).not.toContain("p-cafe-uige");
  });
});
