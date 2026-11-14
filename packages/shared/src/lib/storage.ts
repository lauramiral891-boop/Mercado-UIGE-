import {
  Product,
  Store,
  Category,
  User,
  Order,
  NotificationItem,
  ReportItem,
  MessageItem,
  StoreReview,
  SponsoredAd,
  MerchantPayment,
  DeliveryRecord,
  CourierMonthlyFee,
  SystemConfig,
  AuditLogItem,
} from "../types";

const STORAGE_KEYS = {
  CURRENT_USER: "mu_current_user_v3",
  USERS: "mu_users_v3",
  PRODUCTS: "mu_products_v3",
  STORES: "mu_stores_v3",
  ORDERS: "mu_orders_v3",
  MESSAGES: "mu_messages_v3",
  NOTIFICATIONS: "mu_notifications_v3",
  REPORTS: "mu_reports_v3",
  STORE_REVIEWS: "mu_store_reviews_v1",
  ADS: "mu_sponsored_ads_v1",
  MERCHANT_PAYMENTS: "mu_merchant_payments_v1",
  DELIVERIES: "mu_deliveries_v1",
  COURIER_FEES: "mu_courier_fees_v1",
  SYSTEM_CONFIG: "mu_system_config_v1",
  AUDIT_LOGS: "mu_audit_logs_v1",
  LOCATION: "mu_location_v3",
  CART: "mu_cart_v3",
  FAVORITES: "mu_favorites_v3",
  SEARCH_HISTORY: "mu_search_history_v1",
  CLICK_HISTORY: "mu_click_history_v1",
};

export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  autoSuspendReportsThreshold: 3,
  defaultDeliveryFee: 1500,
  deliveryCommissionPercent: 15,
  courierMonthlyFee: 5000,
  adminWhatsapp: "945379003",
  basicPlanPrice: 5000,
  vipPlanPrice: 15000,
  fixedStoreBasicPrice: 5000,
  fixedStoreVipPrice: 15000,
  ambulantBasicPrice: 2500,
  ambulantVipPrice: 7500,
  courierBasicPrice: 3000,
  courierVipPrice: 8000,
};

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "cat-1", name: "Electrónicos", slug: "eletronicos", icon: "smartphone", color: "#246BFD", count: 0 },
  { id: "cat-2", name: "Moda", slug: "moda", icon: "shirt", color: "#FF5A8A", count: 0 },
  { id: "cat-3", name: "Casa e Lar", slug: "casa-e-lar", icon: "home", color: "#FFB020", count: 0 },
  { id: "cat-4", name: "Alimentos", slug: "alimentos", icon: "apple", color: "#B7F34A", count: 0 },
  { id: "cat-5", name: "Construção", slug: "construcao", icon: "hammer", color: "#FF7A45", count: 0 },
  { id: "cat-6", name: "Serviços", slug: "servicos", icon: "wrench", color: "#7C5CFF", count: 0 },
  { id: "cat-7", name: "Beleza", slug: "beleza", icon: "sparkles", color: "#FF4D9D", count: 0 },
  { id: "cat-8", name: "Desporto", slug: "desporto", icon: "dumbbell", color: "#00C2A8", count: 0 },
];

function getSafe<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === "undefined") return fallback;
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
}

function setSafe<T>(key: string, val: T): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, JSON.stringify(val));
    }
  } catch {}
}

export const getStoredCurrentUser = (): User | null => getSafe<User | null>(STORAGE_KEYS.CURRENT_USER, null);
export const saveCurrentUser = (user: User | null) => setSafe(STORAGE_KEYS.CURRENT_USER, user);

export const getStoredUsers = (): User[] => getSafe<User[]>(STORAGE_KEYS.USERS, []);
export const saveUsers = (users: User[]) => setSafe(STORAGE_KEYS.USERS, users);

export const getStoredProducts = (): Product[] => getSafe<Product[]>(STORAGE_KEYS.PRODUCTS, []);
export const saveProducts = (prods: Product[]) => setSafe(STORAGE_KEYS.PRODUCTS, prods);

export const getStoredStores = (): Store[] => getSafe<Store[]>(STORAGE_KEYS.STORES, []);
export const saveStores = (stores: Store[]) => setSafe(STORAGE_KEYS.STORES, stores);

export const getStoredOrders = (): Order[] => getSafe<Order[]>(STORAGE_KEYS.ORDERS, []);
export const saveOrders = (orders: Order[]) => setSafe(STORAGE_KEYS.ORDERS, orders);

export const getStoredMessages = (): MessageItem[] => getSafe<MessageItem[]>(STORAGE_KEYS.MESSAGES, []);
export const saveMessages = (msgs: MessageItem[]) => setSafe(STORAGE_KEYS.MESSAGES, msgs);

export const getStoredNotifications = (): NotificationItem[] => getSafe<NotificationItem[]>(STORAGE_KEYS.NOTIFICATIONS, []);
export const saveNotifications = (notifs: NotificationItem[]) => setSafe(STORAGE_KEYS.NOTIFICATIONS, notifs);

export const getStoredReports = (): ReportItem[] => getSafe<ReportItem[]>(STORAGE_KEYS.REPORTS, []);
export const saveReports = (reports: ReportItem[]) => setSafe(STORAGE_KEYS.REPORTS, reports);

export const getStoredStoreReviews = (): StoreReview[] => getSafe<StoreReview[]>(STORAGE_KEYS.STORE_REVIEWS, []);
export const saveStoreReviews = (reviews: StoreReview[]) => setSafe(STORAGE_KEYS.STORE_REVIEWS, reviews);

export const getStoredAds = (): SponsoredAd[] => getSafe<SponsoredAd[]>(STORAGE_KEYS.ADS, []);
export const saveAds = (ads: SponsoredAd[]) => setSafe(STORAGE_KEYS.ADS, ads);

export const getStoredMerchantPayments = (): MerchantPayment[] =>
  getSafe<MerchantPayment[]>(STORAGE_KEYS.MERCHANT_PAYMENTS, []);
export const saveMerchantPayments = (payments: MerchantPayment[]) =>
  setSafe(STORAGE_KEYS.MERCHANT_PAYMENTS, payments);

export const getStoredDeliveries = (): DeliveryRecord[] =>
  getSafe<DeliveryRecord[]>(STORAGE_KEYS.DELIVERIES, []);
export const saveDeliveries = (deliveries: DeliveryRecord[]) =>
  setSafe(STORAGE_KEYS.DELIVERIES, deliveries);

export const getStoredCourierFees = (): CourierMonthlyFee[] =>
  getSafe<CourierMonthlyFee[]>(STORAGE_KEYS.COURIER_FEES, []);
export const saveCourierFees = (fees: CourierMonthlyFee[]) =>
  setSafe(STORAGE_KEYS.COURIER_FEES, fees);

export const getStoredSystemConfig = (): SystemConfig =>
  ({ ...DEFAULT_SYSTEM_CONFIG, ...getSafe<Partial<SystemConfig>>(STORAGE_KEYS.SYSTEM_CONFIG, {}) });
export const saveSystemConfig = (cfg: SystemConfig) => setSafe(STORAGE_KEYS.SYSTEM_CONFIG, cfg);

export const getStoredAuditLogs = (): AuditLogItem[] => getSafe<AuditLogItem[]>(STORAGE_KEYS.AUDIT_LOGS, []);
export const saveAuditLogs = (logs: AuditLogItem[]) => setSafe(STORAGE_KEYS.AUDIT_LOGS, logs);

export const getStoredLocation = (): string => {
  try {
    if (typeof localStorage === "undefined") return "Uíge, Centro";
    return localStorage.getItem(STORAGE_KEYS.LOCATION) || "Uíge, Centro";
  } catch {
    return "Uíge, Centro";
  }
};
export const saveStoredLocation = (loc: string) => {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEYS.LOCATION, loc);
    }
  } catch {}
};

// Histórico local de pesquisas e cliques do utilizador (usado apenas para ordenar resultados relevantes)
export interface ClickSignal {
  productId: string;
  categoryName?: string;
  brand?: string;
  count: number;
  lastClickedAt: number;
}

export const getSearchHistory = (): string[] => getSafe<string[]>(STORAGE_KEYS.SEARCH_HISTORY, []);

export const recordSearchHistory = (query: string): void => {
  const clean = (query || "").trim();
  if (clean.length < 2) return;
  const current = getSearchHistory().filter((q) => q.toLowerCase() !== clean.toLowerCase());
  setSafe(STORAGE_KEYS.SEARCH_HISTORY, [clean, ...current].slice(0, 20));
};

export const getClickHistory = (): ClickSignal[] => getSafe<ClickSignal[]>(STORAGE_KEYS.CLICK_HISTORY, []);

export const recordProductClick = (product: Pick<Product, "id" | "categoryName" | "brand">): void => {
  if (!product?.id) return;
  const current = getClickHistory();
  const existing = current.find((c) => c.productId === product.id);
  const updated: ClickSignal[] = existing
    ? [
        { ...existing, count: existing.count + 1, lastClickedAt: Date.now() },
        ...current.filter((c) => c.productId !== product.id),
      ]
    : [
        {
          productId: product.id,
          categoryName: product.categoryName,
          brand: product.brand,
          count: 1,
          lastClickedAt: Date.now(),
        },
        ...current,
      ];
  setSafe(STORAGE_KEYS.CLICK_HISTORY, updated.slice(0, 40));
};

export function getLocalPersonalizationSignals() {
  const clicks = getClickHistory();
  const recentQueries = getSearchHistory();
  return {
    recentQueries,
    clickedProductIds: clicks.map((c) => c.productId),
    preferredCategories: Array.from(new Set(clicks.map((c) => c.categoryName).filter(Boolean) as string[])),
    preferredBrands: Array.from(new Set(clicks.map((c) => c.brand).filter(Boolean) as string[])),
  };
}
