import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Smartphone,
  Shirt,
  Home as HomeIcon,
  Apple,
  Hammer,
  Wrench,
  Sparkles,
  Dumbbell,
  Tag,
  Crown,
  LogOut,
  Trash2,
  CheckCircle2,
  Package,
  Store as StoreIcon,
  ChevronRight,
  Search as SearchIcon,
  ShoppingCart,
  Heart,
  FileText,
  Bell,
  Plus,
  Minus,
  ArrowLeft,
  SlidersHorizontal,
  Star,
  Flag,
  Truck,
  ShieldCheck,
  MessageCircle,
  AlertTriangle,
} from "lucide-react";

import {
  Product,
  Store,
  Category,
  User,
  Order,
  NotificationItem,
  StoreReview,
  SponsoredAd,
  MerchantPayment,
  DeliveryRecord,
  CourierMonthlyFee,
  SystemConfig,
  StoreType,
  ThemeMode,
  fmtKz,
  fmtDate,
  formatUserRole,
  formatStoreType,
  buildWhatsAppOrderUrl,
  translateErrorMessage,
  DEFAULT_CATEGORIES,
  DEFAULT_SYSTEM_CONFIG,
  UIGE_MUNICIPALITIES,
  DELIVERY_STATUSES,
  recordSearchHistory,
  recordProductClick,
  getLocalPersonalizationSignals,
  resolvePublishAction,
  canShowFullscreenAd,
  isAdEligibleForPublicDisplay,
  isEditableElementFocused,
  validateSafeAdDestination,
  sortBannersForCarousel,
  CONFIG_REFRESH_INTERVAL_MS,
  productRepo,
  orderRepo,
  messageRepo,
  userRepo,
  storeRepo,
  storeReviewRepo,
  notificationRepo,
  reportRepo,
  adRepo,
  paymentRepo,
  deliveryRepo,
  systemConfigRepo,
  remoteSyncHandlers,
  syncQueue,
  nativePlugins,
  deleteUserAccountServer,
  saveCurrentUser,
  supabase,
  isSupabaseConfigured,
  SafeImage,
} from "@mercado-uige/shared";

import { Header } from "./components/Header";
import { BottomNav } from "./components/BottomNav";
import { BottomAdStrip } from "./components/BottomAdStrip";
import { HomeBannerCarousel } from "./components/HomeBannerCarousel";
import { ProductCard } from "./components/ProductCard";
import { LocationModal } from "./components/LocationModal";
import { AuthModal } from "./components/AuthModal";
import { ProductDetailModal } from "./components/ProductDetailModal";
import { PrivacyPolicyModal } from "./components/PrivacyPolicyModal";
import { PublishProductModal } from "./components/PublishProductModal";
import { WantToSellModal } from "./components/WantToSellModal";
import { SponsoredMediaView } from "./components/SponsoredMediaView";
import { FullscreenAdOverlay } from "./components/FullscreenAdOverlay";
import { CourierView } from "./components/CourierView";
import { SellerStudioView } from "./components/SellerStudioView";

const CAT_ICON_MAP: Record<string, any> = {
  smartphone: Smartphone,
  shirt: Shirt,
  home: HomeIcon,
  apple: Apple,
  hammer: Hammer,
  wrench: Wrench,
  sparkles: Sparkles,
  dumbbell: Dumbbell,
  tag: Tag,
};

export const MobileApp: React.FC<{ initialBooted?: boolean }> = ({ initialBooted = false }) => {
  // Splash & Theme
  const [booted, setBooted] = useState(initialBooted);
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const [location, setLocation] = useState("Uíge, Centro da Cidade");
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  // Core Data
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [ads, setAds] = useState<SponsoredAd[]>([]);
  const [systemConfig, setSystemConfig] = useState<SystemConfig>(DEFAULT_SYSTEM_CONFIG);
  const [categories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(true);

  // Navigation History for Android Back Button
  const [view, setView] = useState("home");
  const [viewHistory, setViewHistory] = useState<string[]>(["home"]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);

  // Store Detail: Reviews & Reports
  const [storeReviews, setStoreReviews] = useState<StoreReview[]>([]);
  const [reviewStars, setReviewStars] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [showStoreReportForm, setShowStoreReportForm] = useState(false);
  const [storeReportReason, setStoreReportReason] = useState("");
  const [storeTypeFilter, setStoreTypeFilter] = useState<"todos" | StoreType>("todos");
  const [usedStoreTypeFilter, setUsedStoreTypeFilter] = useState<"todos" | StoreType>("todos");

  // User State
  const [user, setUser] = useState<User | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"login" | "register">("login");
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [wantToSellModalOpen, setWantToSellModalOpen] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);

  // Merchant & Courier Extra Data
  const [storeOrders, setStoreOrders] = useState<Order[]>([]);
  const [myAds, setMyAds] = useState<SponsoredAd[]>([]);
  const [myPayments, setMyPayments] = useState<MerchantPayment[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [courierFees, setCourierFees] = useState<CourierMonthlyFee[]>([]);

  // Cart & Wishlist
  const [cart, setCart] = useState<{ productId: string; qty: number; selectedVariant?: string }[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("mu_cart_v3") || "[]");
    } catch {
      return [];
    }
  });

  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("mu_favs_v3") || "[]");
    } catch {
      return [];
    }
  });

  const [orders, setOrders] = useState<Order[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<{
    sort: string;
    maxPrice: string;
    location: string;
    category: string;
    condition: "todas" | "novo" | "usado";
    storeType: "todos" | StoreType;
    available: boolean;
  }>({
    sort: "relevancia",
    maxPrice: "",
    location: "todas",
    category: "todas",
    condition: "todas",
    storeType: "todos",
    available: false,
  });
  const [isListening, setIsListening] = useState(false);

  // Sponsored Ads Carousel, Bottom Strip, Fullscreen Interstitial & View Tracking
  const [adSlideIdx, setAdSlideIdx] = useState(0);
  const [dismissedStripAdIds, setDismissedStripAdIds] = useState<string[]>([]);
  const viewedAdsRef = useRef<Set<string>>(new Set());
  const [fullscreenAd, setFullscreenAd] = useState<SponsoredAd | null>(null);
  const [fullscreenRotationIdx, setFullscreenRotationIdx] = useState(0);
  const [activeUsageMs, setActiveUsageMs] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [lastFullscreenAdAt, setLastFullscreenAdAt] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem("mu_last_fullscreen_ad_at");
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  });

  // Checkout Form & Post-Checkout WhatsApp Orders
  const [checkoutAddress, setCheckoutAddress] = useState("");
  const [checkoutPhone, setCheckoutPhone] = useState("");
  const [checkoutPayment, setCheckoutPayment] = useState("Multicaixa Express");
  const [checkoutDeliveryType, setCheckoutDeliveryType] = useState<"entrega" | "levantamento">("entrega");
  const [recentWhatsAppOrders, setRecentWhatsAppOrders] = useState<Order[]>([]);

  // Network sync tracking
  const wasOfflineRef = useRef<boolean>(false);

  // UI Toast
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  // Navigate with history tracking
  const navigateTo = (newView: string) => {
    if (newView !== view) {
      setViewHistory((prev) => [...prev, newView]);
      setView(newView);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const openProductDetails = (product: Product) => {
    recordProductClick(product);
    setSelectedProduct(product);
  };

  const openStoreDetails = async (store: Store) => {
    setSelectedStore(store);
    setShowStoreReportForm(false);
    setStoreReportReason("");
    navigateTo("store");
    try {
      const revs = await storeReviewRepo.getByStore(store.id);
      setStoreReviews(revs);
    } catch {
      setStoreReviews([]);
    }
  };

  // Android Native Back Button Support
  useEffect(() => {
    const cleanup = nativePlugins.onBackButton(() => {
      if (selectedProduct) {
        setSelectedProduct(null);
        return;
      }
      if (showLocationModal) {
        setShowLocationModal(false);
        return;
      }
      if (showPrivacyModal) {
        setShowPrivacyModal(false);
        return;
      }
      if (authModalOpen) {
        setAuthModalOpen(false);
        return;
      }
      if (publishModalOpen) {
        setPublishModalOpen(false);
        return;
      }
      if (wantToSellModalOpen) {
        setWantToSellModalOpen(false);
        return;
      }
      if (viewHistory.length > 1) {
        const nextHistory = [...viewHistory];
        nextHistory.pop();
        const previousView = nextHistory[nextHistory.length - 1];
        setViewHistory(nextHistory);
        setView(previousView);
      }
    });

    return cleanup;
  }, [selectedProduct, showLocationModal, showPrivacyModal, authModalOpen, publishModalOpen, wantToSellModalOpen, viewHistory]);

  // Automatic Offline Sync Queue flush when online
  useEffect(() => {
    const flushPendingActions = async (notifyOnSync: boolean) => {
      if (!isSupabaseConfigured) return;
      const pending = syncQueue.getQueue();
      if (pending.length === 0) return;

      const { processed } = await syncQueue.flush(remoteSyncHandlers);
      if (processed > 0) {
        if (notifyOnSync) {
          showToast(`${processed} operação(ões) offline sincronizada(s) ✓`);
        }
        loadData();
      }
    };

    const cleanup = nativePlugins.onNetworkChange((status) => {
      if (status.online) {
        if (wasOfflineRef.current || syncQueue.getQueue().length > 0) {
          flushPendingActions(wasOfflineRef.current);
        }
        wasOfflineRef.current = false;
      } else {
        wasOfflineRef.current = true;
      }
    });

    return cleanup;
  }, []);

  // Boot & Theme
  useEffect(() => {
    const timer = setTimeout(() => setBooted(true), 700);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const savedTheme = localStorage.getItem("mu_theme_mode_v3") as ThemeMode;
    if (savedTheme) setThemeMode(savedTheme);
  }, []);

  useEffect(() => {
    localStorage.setItem("mu_theme_mode_v3", themeMode);
    const applyTheme = (isDark: boolean) => {
      if (isDark) {
        document.documentElement.classList.remove("light");
        document.body.classList.remove("light");
        nativePlugins.setStatusBarColor("#07111F");
      } else {
        document.documentElement.classList.add("light");
        document.body.classList.add("light");
        nativePlugins.setStatusBarColor("#F6F8FC", true);
      }
    };

    if (themeMode === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      applyTheme(mediaQuery.matches);
      const listener = (e: MediaQueryListEvent) => applyTheme(e.matches);
      mediaQuery.addEventListener("change", listener);
      return () => mediaQuery.removeEventListener("change", listener);
    } else {
      applyTheme(themeMode === "dark");
    }
  }, [themeMode]);

  // Persist cart & favorites
  useEffect(() => {
    localStorage.setItem("mu_cart_v3", JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem("mu_favs_v3", JSON.stringify(favorites));
  }, [favorites]);

  // Load Data (Offline-first with Supabase sync)
  const loadData = async () => {
    setLoading(true);
    try {
      const [prods, sts, currentUser, activeAds, cfg] = await Promise.all([
        productRepo.getAll(),
        storeRepo.getAll(false),
        userRepo.getCurrentUser(),
        adRepo.getAll(false),
        systemConfigRepo.get(),
      ]);

      setProducts(prods);
      setStores(sts);
      setUser(currentUser);
      setAds(activeAds);
      setSystemConfig(cfg);

      if (currentUser) {
        setCheckoutAddress(
          `${currentUser.bairro ? currentUser.bairro + ", " : ""}${currentUser.municipality || "Uíge"}`
        );
        setCheckoutPhone(currentUser.phone || "");

        const userStore = sts.find((s) => s.ownerId === currentUser.id) || null;
        const [userOrders, notifs, allUserAds, userPayments, allDeliv, fees] = await Promise.all([
          orderRepo.getAll(currentUser.id),
          notificationRepo.getAll(currentUser.id),
          adRepo.getAll(true),
          paymentRepo.getAll(currentUser.id),
          deliveryRepo.getAll(
            currentUser.role === "entregador" ? {} : { customerId: currentUser.id }
          ),
          currentUser.role === "entregador"
            ? deliveryRepo.getMonthlyFees(currentUser.id)
            : Promise.resolve([]),
        ]);

        setOrders(userOrders);
        setNotifications(notifs);
        setMyAds(allUserAds.filter((a) => a.sellerId === currentUser.id));
        setMyPayments(userPayments);
        setDeliveries(allDeliv);
        setCourierFees(fees);

        if (userStore) {
          const sOrders = await orderRepo.getAll(undefined, userStore.id);
          setStoreOrders(sOrders);
        } else {
          setStoreOrders([]);
        }
      } else {
        const publicNotifs = await notificationRepo.getAll();
        setNotifications(publicNotifs.filter((n) => n.userId === "all"));
        setOrders([]);
        setStoreOrders([]);
        setMyAds([]);
        setMyPayments([]);
        setDeliveries([]);
        setCourierFees([]);
      }
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Sem ligação. A mostrar catálogo local."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const refreshBannersAndConfig = async () => {
      try {
        const [activeAds, cfg] = await Promise.all([adRepo.getAll(false), systemConfigRepo.get()]);
        setAds(activeAds);
        setSystemConfig(cfg);
      } catch {}
    };
    const refreshTimer = setInterval(refreshBannersAndConfig, CONFIG_REFRESH_INTERVAL_MS);

    if (!isSupabaseConfigured) {
      return () => clearInterval(refreshTimer);
    }
    const { data: subscriptionData } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        loadData();
      } else if (event === "SIGNED_OUT") {
        saveCurrentUser(null);
        setUser(null);
      }
    });
    return () => {
      clearInterval(refreshTimer);
      subscriptionData?.subscription?.unsubscribe();
    };
  }, []);

  // Sponsored Ads Carousels & View Tracking (plataforma, externo ou loja com plano pago activo)
  const eligibleAds = useMemo(
    () => ads.filter((a) => isAdEligibleForPublicDisplay(a, stores)),
    [ads, stores]
  );
  const topAds = useMemo(
    () => sortBannersForCarousel(eligibleAds.filter((a) => a.position === "topo")),
    [eligibleAds]
  );
  const stripAds = useMemo(
    () => eligibleAds.filter((a) => a.position === "faixa" && !dismissedStripAdIds.includes(a.id)),
    [eligibleAds, dismissedStripAdIds]
  );
  const activeStripAd = stripAds[0] || null;
  const categoryAds = useMemo(() => eligibleAds.filter((a) => a.position === "categoria"), [eligibleAds]);
  const searchAds = useMemo(() => eligibleAds.filter((a) => a.position === "pesquisa"), [eligibleAds]);
  const fullscreenPool = useMemo(() => {
    const dedicated = eligibleAds.filter((a) => a.position === "ecra_inteiro");
    return dedicated.length > 0 ? dedicated : eligibleAds;
  }, [eligibleAds]);

  useEffect(() => {
    const visibleAd =
      view === "home"
        ? topAds[adSlideIdx % Math.max(1, topAds.length)]
        : view === "categories"
        ? categoryAds[0]
        : view === "search"
        ? searchAds[0]
        : undefined;

    if (visibleAd && !viewedAdsRef.current.has(visibleAd.id)) {
      viewedAdsRef.current.add(visibleAd.id);
      adRepo.trackView(visibleAd.id).catch(() => {});
    }
    if (activeStripAd && !viewedAdsRef.current.has(activeStripAd.id)) {
      viewedAdsRef.current.add(activeStripAd.id);
      adRepo.trackView(activeStripAd.id).catch(() => {});
    }
  }, [view, adSlideIdx, topAds, categoryAds, searchAds, activeStripAd]);

  // Rastreio de uso activo da app e detecção de digitação para anúncio de ecrã inteiro
  useEffect(() => {
    if (!booted) return;
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (!fullscreenAd) {
        setActiveUsageMs((prev) => prev + 1000);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [booted, fullscreenAd]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const updateTyping = () => setIsTyping(isEditableElementFocused(document));
    document.addEventListener("focusin", updateTyping);
    document.addEventListener("focusout", updateTyping);
    return () => {
      document.removeEventListener("focusin", updateTyping);
      document.removeEventListener("focusout", updateTyping);
    };
  }, []);

  const anyModalOpenForAds = Boolean(
    selectedProduct ||
      authModalOpen ||
      showLocationModal ||
      showPrivacyModal ||
      publishModalOpen ||
      wantToSellModalOpen ||
      fullscreenAd
  );

  useEffect(() => {
    if (
      !canShowFullscreenAd({
        activeUsageMs,
        nowMs: Date.now(),
        lastShownAtMs: lastFullscreenAdAt,
        currentView: view,
        isModalOpen: anyModalOpenForAds,
        isTyping,
        hasEligibleAd: fullscreenPool.length > 0,
      })
    ) {
      return;
    }

    const chosen = fullscreenPool[fullscreenRotationIdx % fullscreenPool.length];
    if (!chosen) return;
    const shownNow = Date.now();
    setFullscreenAd(chosen);
    setFullscreenRotationIdx((prev) => prev + 1);
    setLastFullscreenAdAt(shownNow);
    try {
      localStorage.setItem("mu_last_fullscreen_ad_at", String(shownNow));
    } catch {}
    adRepo.trackView(chosen.id).catch(() => {});
  }, [
    activeUsageMs,
    lastFullscreenAdAt,
    view,
    anyModalOpenForAds,
    isTyping,
    fullscreenPool,
    fullscreenRotationIdx,
  ]);

  const openExternalSafeHref = (safeHttpsUrl: string) => {
    if (typeof document === "undefined") return;
    const a = document.createElement("a");
    a.href = safeHttpsUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleOpenSponsoredAd = (ad: SponsoredAd, forceOpenStore = false) => {
    adRepo.trackClick(ad.id).catch(() => {});
    const destType = ad.destinationType || (ad.productId ? "produto" : "loja");

    if (destType === "link") {
      const check = validateSafeAdDestination("link", ad.destinationValue || ad.linkUrl);
      if (check.ok && check.normalizedValue) {
        openExternalSafeHref(check.normalizedValue);
      } else {
        showToast("Link externo do anúncio inválido.");
      }
      return;
    }

    if (destType === "whatsapp") {
      const check = validateSafeAdDestination("whatsapp", ad.destinationValue);
      if (check.ok && check.normalizedValue) {
        openExternalSafeHref(check.normalizedValue);
      } else {
        showToast("Contacto WhatsApp do anúncio indisponível.");
      }
      return;
    }

    if (destType === "produto" || (!forceOpenStore && ad.productId)) {
      const targetProdId = ad.productId || ad.destinationValue;
      const targetProd = targetProdId ? products.find((p) => p.id === targetProdId) : undefined;
      if (targetProd) {
        openProductDetails(targetProd);
        return;
      }
    }

    const targetStoreId = ad.storeId || (destType === "loja" ? ad.destinationValue : undefined);
    if (targetStoreId) {
      const targetStore = stores.find((s) => s.id === targetStoreId);
      if (targetStore) {
        openStoreDetails(targetStore);
        return;
      }
    }
    navigateTo("stores");
  };

  // Cart & Favorites derived data
  const detailedCart = useMemo(() => {
    return cart
      .map((item) => ({ ...item, product: products.find((p) => p.id === item.productId) }))
      .filter((item): item is { productId: string; qty: number; selectedVariant?: string; product: Product } =>
        Boolean(item.product)
      );
  }, [cart, products]);

  // Agrupamento do Carrinho por Loja
  const cartGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        storeKey: string;
        storeId?: string;
        storeName: string;
        storeCode?: string;
        storeType?: StoreType;
        items: { productId: string; qty: number; selectedVariant?: string; product: Product }[];
        subtotal: number;
      }
    >();

    for (const item of detailedCart) {
      const st = item.product.storeId ? stores.find((s) => s.id === item.product.storeId) : undefined;
      const storeKey = item.product.storeId || item.product.sellerId || "local";
      const storeName = st?.name || item.product.storeName || "Comerciante Local";
      const current = map.get(storeKey) || {
        storeKey,
        storeId: item.product.storeId || st?.id,
        storeName,
        storeCode: st?.code || item.product.storeCode,
        storeType: st?.storeType || item.product.storeType,
        items: [],
        subtotal: 0,
      };
      current.items.push(item);
      current.subtotal += Number(item.product.price) * item.qty;
      map.set(storeKey, current);
    }
    return Array.from(map.values());
  }, [detailedCart, stores]);

  const publicProducts = useMemo(() => {
    return products.filter((p) => p.isApproved !== false);
  }, [products]);

  const favoriteProducts = useMemo(() => {
    return products.filter((p) => favorites.includes(p.id));
  }, [products, favorites]);

  const usedProducts = useMemo(() => {
    return publicProducts.filter((p) => {
      if (p.condition !== "usado") return false;
      if (usedStoreTypeFilter !== "todos" && (p.storeType || "loja_fixa") !== usedStoreTypeFilter) {
        return false;
      }
      return true;
    });
  }, [publicProducts, usedStoreTypeFilter]);

  const filteredStores = useMemo(() => {
    if (storeTypeFilter === "todos") return stores;
    return stores.filter((s) => s.storeType === storeTypeFilter);
  }, [stores, storeTypeFilter]);

  const myStore = useMemo(() => {
    if (!user) return null;
    return stores.find((s) => s.ownerId === user.id) || null;
  }, [stores, user]);

  const handleSelectBottomNav = (targetId: string) => {
    if (targetId === "publish") {
      const action = resolvePublishAction(user, myStore);
      if (action === "publish") {
        setPublishModalOpen(true);
      } else if (action === "want_to_sell") {
        setWantToSellModalOpen(true);
      } else {
        setAuthModalMode("login");
        setAuthModalOpen(true);
        showToast("Inicia sessão para publicar artigos.");
      }
      return;
    }
    navigateTo(targetId);
  };

  const myProducts = useMemo(() => {
    if (!user) return [];
    return products.filter((p) => p.sellerId === user.id);
  }, [products, user]);

  const deliveryFeePerStore =
    checkoutDeliveryType === "entrega" ? Number(systemConfig.defaultDeliveryFee || 1500) : 0;
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const cartSubtotal = cartGroups.reduce((sum, g) => sum + g.subtotal, 0);
  const cartDeliveryTotal = cartGroups.length * deliveryFeePerStore;
  const cartTotal = cartSubtotal + cartDeliveryTotal;

  // Cart Actions
  const handleAddToCart = (product: Product, quantity = 1, variant?: string) => {
    if (Number(product.stock) <= 0) {
      showToast("Lamentamos, este produto está de momento esgotado.");
      return;
    }
    const existingIdx = cart.findIndex((item) => item.productId === product.id);
    if (existingIdx !== -1) {
      const updated = [...cart];
      updated[existingIdx].qty += quantity;
      setCart(updated);
    } else {
      setCart([...cart, { productId: product.id, qty: quantity, selectedVariant: variant }]);
    }
    nativePlugins.hapticFeedback(30);
    showToast(`Adicionado ao carrinho: ${product.name} ✓`);
  };

  const handleUpdateCartQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.productId === productId ? { ...c, qty: c.qty + delta } : c))
        .filter((c) => c.qty > 0)
    );
  };

  const handleToggleFavorite = (product: Product) => {
    const exists = favorites.includes(product.id);
    if (exists) {
      setFavorites(favorites.filter((id) => id !== product.id));
      showToast("Removido dos favoritos.");
    } else {
      setFavorites([...favorites, product.id]);
      nativePlugins.hapticFeedback(25);
      showToast("Guardado nos favoritos");
    }
  };

  // Search with normalization, relevance threshold & local personalization
  const handlePerformSearch = async (queryText: string, overrideFilters?: typeof filters) => {
    const activeFilters = overrideFilters || filters;
    setSearchQuery(queryText);
    setSearching(true);
    navigateTo("search");
    try {
      const trimmed = queryText.trim();
      if (trimmed.length >= 2) {
        recordSearchHistory(trimmed);
      }
      const results = await productRepo.getAll({
        query: trimmed,
        sort: activeFilters.sort,
        maxPrice: activeFilters.maxPrice ? Number(activeFilters.maxPrice) : undefined,
        municipality: activeFilters.location,
        category: activeFilters.category,
        condition: activeFilters.condition,
        storeType: activeFilters.storeType,
        availableOnly: activeFilters.available,
        personalization: getLocalPersonalizationSignals(),
      });
      setSearchResults(results.filter((p) => p.isApproved !== false));
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível pesquisar agora. Tenta novamente."));
    } finally {
      setSearching(false);
    }
  };

  const handleVoiceSearch = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      showToast("Pesquisa por voz indisponível neste dispositivo. Use o teclado.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "pt-AO";
      setIsListening(true);
      showToast("A ouvir... Diga o produto que procura.");

      recognition.onresult = (event: any) => {
        setIsListening(false);
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          handlePerformSearch(transcript);
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
        showToast("Não foi possível captar o áudio.");
      };

      recognition.onend = () => setIsListening(false);
      recognition.start();
    } catch {
      setIsListening(false);
      showToast("Erro ao ligar microfone.");
    }
  };

  // Checkout Confirmation: Cria uma encomenda separada por cada loja no carrinho e prepara envio por WhatsApp
  const handleConfirmOrder = async () => {
    if (!user) {
      setAuthModalMode("login");
      setAuthModalOpen(true);
      return;
    }
    if (cartGroups.length === 0) {
      showToast("O carrinho está vazio.");
      return;
    }
    const customerPhone = (checkoutPhone || user.phone || "").trim();
    if (!customerPhone) {
      showToast("Indica o teu número de telefone para enviar a encomenda.");
      return;
    }
    if (checkoutDeliveryType === "entrega" && !checkoutAddress.trim()) {
      showToast("Indica a morada para entrega no Uíge.");
      return;
    }

    try {
      if (customerPhone !== (user.phone || "").trim()) {
        try {
          const updatedUser = await userRepo.updateProfile(user.id, { phone: customerPhone });
          setUser(updatedUser);
        } catch {}
      }

      const createdOrders: Order[] = [];
      const createdDeliveries: DeliveryRecord[] = [];
      const finalAddress =
        checkoutDeliveryType === "levantamento"
          ? "Levantamento directo na loja"
          : checkoutAddress.trim();

      for (const group of cartGroups) {
        const storeObj = group.storeId ? stores.find((s) => s.id === group.storeId) : undefined;
        const ord = await orderRepo.create({
          userId: user.id,
          userName: user.name,
          userPhone: customerPhone,
          storeId: group.storeId,
          storeName: group.storeName,
          storePhone: storeObj?.phone || null,
          items: group.items.map((it) => ({
            productId: it.productId,
            qty: it.qty,
            selectedVariant: it.selectedVariant,
          })),
          address: finalAddress,
          paymentMethod: checkoutPayment,
          deliveryType: checkoutDeliveryType,
          deliveryFee: deliveryFeePerStore,
        });
        createdOrders.push(ord);

        if (checkoutDeliveryType === "entrega") {
          const pickupAddr = storeObj
            ? `${storeObj.address ? storeObj.address + ", " : ""}${storeObj.bairro ? storeObj.bairro + ", " : ""}${storeObj.municipality}`
            : "Centro do Uíge";

          const del = await deliveryRepo.create({
            orderId: ord.id,
            orderCode: ord.code,
            storeId: group.storeId,
            storeName: group.storeName,
            customerId: user.id,
            customerName: user.name,
            customerPhone,
            pickupAddress: pickupAddr,
            deliveryAddress: finalAddress,
            deliveryFee: systemConfig.defaultDeliveryFee,
            commissionPercent: systemConfig.deliveryCommissionPercent,
          });
          createdDeliveries.push(del);
        }
      }

      setOrders((prev) => [...createdOrders, ...prev]);
      setRecentWhatsAppOrders(createdOrders);
      if (createdDeliveries.length > 0) {
        setDeliveries((prev) => [...createdDeliveries, ...prev]);
      }
      setCart([]);
      nativePlugins.hapticFeedback(40);
      showToast(
        createdOrders.length > 1
          ? `${createdOrders.length} encomendas guardadas! Podes enviar por WhatsApp abaixo.`
          : navigator.onLine
          ? "Encomenda guardada! Toca em Enviar pedido por WhatsApp."
          : "Encomenda guardada offline! Podes enviar por WhatsApp ou aguardar rede."
      );
      navigateTo("orders");
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível confirmar a encomenda. Tenta novamente."));
    }
  };

  // Store Review & Report Handlers
  const handleSubmitStoreReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStore) return;
    if (!user) {
      setAuthModalMode("login");
      setAuthModalOpen(true);
      return;
    }
    try {
      const created = await storeReviewRepo.create({
        storeId: selectedStore.id,
        userId: user.id,
        userName: user.name,
        stars: reviewStars,
        comment: reviewComment.trim(),
      });
      setStoreReviews((prev) => [created, ...prev.filter((r) => r.userId !== user.id)]);
      setReviewComment("");
      showToast("Avaliação da loja guardada ✓");
      await loadData();
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível enviar a avaliação."));
    }
  };

  const handleSubmitStoreReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStore || !storeReportReason.trim()) return;
    try {
      await reportRepo.create({
        reporterId: user?.id || "anon",
        storeId: selectedStore.id,
        storeName: selectedStore.name,
        reason: storeReportReason.trim(),
      });
      setShowStoreReportForm(false);
      setStoreReportReason("");
      showToast("Denúncia contra a loja recebida para verificação.");
      await loadData();
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível enviar a denúncia."));
    }
  };

  // Direct Message to Seller
  const handleSendMessageToSeller = async (productId: string, content: string) => {
    if (!user) {
      setAuthModalMode("login");
      setAuthModalOpen(true);
      return;
    }
    const targetProduct = products.find((p) => p.id === productId);
    const receiverId = targetProduct?.sellerId || user.id;

    try {
      await messageRepo.send({
        senderId: user.id,
        receiverId,
        productId,
        content,
      });
      showToast(
        navigator.onLine
          ? "Mensagem enviada ao comerciante!"
          : "Mensagem guardada offline. Será enviada assim que houver rede."
      );
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível enviar a mensagem. Tenta novamente."));
    }
  };

  // Account Logout & Deletion
  const handleLogout = async () => {
    if (isSupabaseConfigured) {
      try {
        await supabase.auth.signOut();
      } catch {}
    }
    saveCurrentUser(null);
    setUser(null);
    setOrders([]);
    setStoreOrders([]);
    setDeliveries([]);
    showToast("Sessão terminada. Até breve!");
    navigateTo("home");
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    try {
      await deleteUserAccountServer();
      await userRepo.deleteAccount(user.id);
      setUser(null);
      setOrders([]);
      setConfirmDeleteAccount(false);
      showToast("A tua conta e dados foram permanentemente eliminados.");
      navigateTo("home");
      loadData();
    } catch (err: unknown) {
      showToast(translateErrorMessage(err, "Não foi possível eliminar a conta. Tenta novamente."));
    }
  };

  // Splash Screen
  if (!booted) {
    return (
      <div
        className="min-h-screen grid place-items-center px-6 selection:bg-[#B7F34A] selection:text-slate-950"
        style={{
          background: "radial-gradient(ellipse at top, #0B2A5B 0%, #07111F 65%)",
          color: "#F8FAFC",
        }}
      >
        <div className="text-center anim-fadeUp max-w-sm">
          <div
            className="mx-auto w-24 h-24 grid place-items-center rounded-3xl anim-float shadow-2xl"
            style={{
              background: "linear-gradient(135deg, #246BFD, #07111F)",
              border: "1.5px solid rgba(183, 243, 74, 0.45)",
            }}
          >
            <ShoppingCart size={46} color="#B7F34A" strokeWidth={2.3} />
          </div>
          <h1 className="mt-5 text-3xl font-black tracking-tight">
            Mercado <span style={{ color: "var(--accent)" }}>Uíge</span>
          </h1>
          <p className="mt-1 text-xs tracking-widest uppercase opacity-75 font-semibold">
            Comprar • Vender • Conectar
          </p>

          <div
            className="mt-6 w-8 h-8 mx-auto rounded-full border-3 border-white/20 border-t-[#B7F34A]"
            style={{ animation: "mu-spin 0.9s linear infinite" }}
          />
          <p className="mt-4 text-xs opacity-60">A carregar catálogo provincial…</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen flex flex-col justify-between transition-colors duration-200 md:pb-8 ${
        activeStripAd
          ? "pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))]"
          : "pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))]"
      }`}
      style={{
        backgroundColor: "var(--background)",
        color: "var(--text-primary)",
      }}
    >
      {/* 1. Header */}
      <Header
        currentLocation={location}
        onOpenLocationModal={() => setShowLocationModal(true)}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        onSearch={(q) => handlePerformSearch(q)}
        onVoiceSearch={handleVoiceSearch}
        isListening={isListening}
        onToggleFilters={() => {
          setShowFilters(!showFilters);
          if (view !== "search") navigateTo("search");
        }}
        filtersActive={showFilters}
        themeMode={themeMode}
        onSetThemeMode={setThemeMode}
        unreadCount={notifications.filter((n) => !n.isRead).length}
        onOpenNotifications={() => navigateTo("notifications")}
        user={user}
        onOpenAuth={() => {
          setAuthModalMode("login");
          setAuthModalOpen(true);
        }}
        onOpenProfile={() => navigateTo("profile")}
        onNavigateHome={() => navigateTo("home")}
        activeView={view}
        onSelectNav={navigateTo}
      />

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-4 py-2 sm:py-3">
        {/* VIEW: HOME */}
        {view === "home" && (
          <div className="space-y-6 anim-fadeUp">
            {/* Carrossel de Banners (reutilizando anuncios + config global de duração e autoplay) */}
            <HomeBannerCarousel
              banners={topAds}
              autoplay={systemConfig.bannerAutoplay !== false}
              defaultDurationSec={systemConfig.bannerDefaultDurationSec || 8}
              activeIndex={adSlideIdx}
              onActiveIndexChange={setAdSlideIdx}
              onOpenBanner={(banner) => handleOpenSponsoredAd(banner)}
              onExploreCatalog={() => handlePerformSearch("")}
              onOpenStores={() => navigateTo("stores")}
              onOpenUsed={() => navigateTo("used")}
            />

            {/* Categorias Principais */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="font-black text-base sm:text-lg truncate">Categorias Principais</h2>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => navigateTo("used")}
                    className="text-xs font-bold text-amber-400 hover:underline cursor-pointer"
                  >
                    Usados
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateTo("categories")}
                    className="text-xs font-bold text-[#246BFD] hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>Ver todas</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 sm:gap-3">
                {categories.map((c) => {
                  const Icon = CAT_ICON_MAP[c.icon] || Tag;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        const nextFilters = { ...filters, category: c.name };
                        setFilters(nextFilters);
                        handlePerformSearch("", nextFilters);
                      }}
                      className="flex flex-col items-center justify-start p-2 sm:p-3 rounded-2xl border transition-all duration-200 hover:shadow-md hover:border-[#246BFD] group cursor-pointer min-w-0"
                      style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
                    >
                      <div
                        className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl grid place-items-center transition-transform group-hover:scale-110 mb-1.5 shadow-sm shrink-0"
                        style={{ backgroundColor: `${c.color}20`, color: c.color }}
                      >
                        <Icon size={18} />
                      </div>
                      <span className="text-[10px] sm:text-[11px] font-bold text-center leading-tight line-clamp-2 w-full break-words">
                        {c.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Artigos no Catálogo (Sem cartão vazio quando não há produtos) */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-black text-base sm:text-lg">Artigos no Catálogo</h2>
                <span className="text-xs font-bold opacity-60">{publicProducts.length} artigo(s)</span>
              </div>

              {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-64 rounded-3xl bg-slate-800/40 animate-pulse border border-[#26354B]" />
                  ))}
                </div>
              ) : publicProducts.length === 0 ? (
                <div className="py-8 px-4 text-center space-y-2.5">
                  <Package size={36} className="mx-auto opacity-45 text-[#246BFD]" />
                  <h3 className="font-black text-sm">Ainda não existem artigos publicados no catálogo</h3>
                  <p className="text-xs opacity-70 max-w-sm mx-auto">
                    Quando os comerciantes do Uíge publicarem os primeiros artigos, eles aparecerão aqui.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigateTo("seller")}
                    className="px-5 py-2.5 rounded-2xl font-black text-xs text-slate-950 shadow-md cursor-pointer inline-flex items-center gap-1.5"
                    style={{ backgroundColor: "var(--accent)" }}
                  >
                    <span>Publicar o Primeiro Artigo</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {publicProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      isFavorite={favorites.includes(product.id)}
                      onToggleFavorite={handleToggleFavorite}
                      onAddToCart={(p) => handleAddToCart(p, 1)}
                      onOpenProduct={openProductDetails}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW: USADOS */}
        {view === "used" && (
          <div className="space-y-4 anim-fadeUp">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h1 className="text-xl sm:text-2xl font-black">Artigos Usados</h1>
                <p className="text-xs opacity-65">Produtos em segunda mão disponíveis na província do Uíge</p>
              </div>
              <div className="flex gap-1.5 text-xs font-bold">
                {[
                  { id: "todos", label: "Todos" },
                  { id: "loja_fixa", label: "Loja fixa" },
                  { id: "vendedor_ambulante", label: "Ambulante" },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setUsedStoreTypeFilter(f.id as any)}
                    className={`px-3 py-1.5 rounded-full border cursor-pointer ${
                      usedStoreTypeFilter === f.id
                        ? "bg-[#246BFD] text-white border-[#246BFD]"
                        : "border-[var(--border)] opacity-80"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {usedProducts.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <Tag size={36} className="mx-auto opacity-45 text-amber-400" />
                <h3 className="font-bold text-sm">Nenhum artigo usado publicado neste momento</h3>
                <p className="text-xs opacity-65">Explora todo o catálogo ou publica um artigo usado no painel de vendedor.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {usedProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    isFavorite={favorites.includes(product.id)}
                    onToggleFavorite={handleToggleFavorite}
                    onAddToCart={(p) => handleAddToCart(p, 1)}
                    onOpenProduct={openProductDetails}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW: CATEGORIES */}
        {view === "categories" && (
          <div className="space-y-4 anim-fadeUp">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-xl sm:text-2xl font-black">Categorias da Província</h1>
              <button
                type="button"
                onClick={() => navigateTo("used")}
                className="px-3.5 py-1.5 rounded-full text-xs font-black bg-amber-500 text-slate-950 cursor-pointer"
              >
                Ver Usados
              </button>
            </div>

            {categoryAds[0] && (
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleOpenSponsoredAd(categoryAds[0])}
                onKeyDown={(e) => e.key === "Enter" && handleOpenSponsoredAd(categoryAds[0])}
                className="w-full p-3.5 rounded-2xl border border-[#246BFD]/40 bg-[#246BFD]/10 text-left flex items-center justify-between gap-3 cursor-pointer"
              >
                {(categoryAds[0].imageUrl || categoryAds[0].videoUrl || categoryAds[0].storeImage) && (
                  <SponsoredMediaView
                    ad={categoryAds[0]}
                    compact
                    className="w-20 h-16 rounded-xl overflow-hidden shrink-0 border border-[#246BFD]/30"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <span className="inline-block text-[10px] font-black px-2 py-0.5 rounded-md bg-[#B7F34A] text-slate-950 mb-1">
                    Patrocinado
                  </span>
                  <h3 className="font-black text-sm truncate">{categoryAds[0].title}</h3>
                  {categoryAds[0].subtitle && <p className="text-xs opacity-75 truncate">{categoryAds[0].subtitle}</p>}
                </div>
                <ChevronRight size={16} className="shrink-0 text-[#246BFD]" />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {categories.map((c) => {
                const Icon = CAT_ICON_MAP[c.icon] || Tag;
                const count = publicProducts.filter((p) => p.categoryName.toLowerCase() === c.name.toLowerCase()).length;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      const nextFilters = { ...filters, category: c.name };
                      setFilters(nextFilters);
                      handlePerformSearch("", nextFilters);
                    }}
                    className="p-4 rounded-3xl border text-left hover:border-[#246BFD] transition-all cursor-pointer flex items-center gap-3.5"
                    style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
                  >
                    <div
                      className="w-12 h-12 rounded-2xl grid place-items-center shrink-0"
                      style={{ backgroundColor: `${c.color}20`, color: c.color }}
                    >
                      <Icon size={24} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-black text-sm truncate">{c.name}</h3>
                      <span className="text-xs opacity-65">{count} artigo(s)</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW: STORES */}
        {view === "stores" && (
          <div className="space-y-4 anim-fadeUp">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-xl sm:text-2xl font-black truncate">Lojas no Uíge</h1>
              <button
                type="button"
                onClick={() => navigateTo("seller")}
                className="px-4 py-2 rounded-2xl font-black text-xs text-slate-950 cursor-pointer shrink-0"
                style={{ backgroundColor: "var(--accent)" }}
              >
                Abrir Loja
              </button>
            </div>

            <div className="flex gap-1.5 overflow-x-auto no-scrollbar text-xs font-bold">
              {[
                { id: "todos", label: "Todas as lojas" },
                { id: "loja_fixa", label: "Loja fixa" },
                { id: "vendedor_ambulante", label: "Vendedor ambulante" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setStoreTypeFilter(t.id as any)}
                  className={`px-3.5 py-1.5 rounded-full border whitespace-nowrap cursor-pointer ${
                    storeTypeFilter === t.id
                      ? "bg-[#246BFD] text-white border-[#246BFD]"
                      : "border-[var(--border)] opacity-80"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-32 rounded-3xl bg-slate-800/40 animate-pulse border border-[#26354B]" />
                ))}
              </div>
            ) : filteredStores.length === 0 ? (
              <div className="py-10 text-center space-y-2.5">
                <StoreIcon size={40} className="mx-auto opacity-40 text-[#246BFD]" />
                <h3 className="font-black text-sm">Ainda sem lojas nesta categoria</h3>
                <p className="text-xs opacity-70 max-w-sm mx-auto">
                  Regista a tua loja fixa ou perfil de vendedor ambulante no Uíge para vender em toda a província.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredStores.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => openStoreDetails(s)}
                    className="p-4 sm:p-5 rounded-3xl border text-left hover:border-[#246BFD] transition-all cursor-pointer flex flex-col justify-between gap-2.5"
                    style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-2xl bg-[#246BFD]/15 text-[#246BFD] grid place-items-center shrink-0 overflow-hidden">
                        <SafeImage
                          src={s.facadeImage || s.logo}
                          alt={s.name}
                          className="w-full h-full object-cover"
                          fallbackIcon={<StoreIcon size={22} className="text-[#246BFD]" />}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-black text-sm flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{s.name}</span>
                          {s.isVip && <Crown size={14} className="text-amber-400 fill-amber-400 shrink-0" />}
                        </h3>
                        <span className="text-xs opacity-65 block truncate">
                          {s.bairro ? `${s.bairro}, ` : ""}
                          {s.municipality}, Uíge
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-full bg-[#246BFD]/15 text-[#246BFD] font-bold">
                          {formatStoreType(s.storeType)}
                        </span>
                        {s.code && <span className="opacity-65 font-bold">{s.code}</span>}
                      </div>
                      {s.rating > 0 && (
                        <span className="text-amber-400 font-black">★ {Number(s.rating).toFixed(1)}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW: STORE DETAIL */}
        {view === "store" && selectedStore && (() => {
          const storeProducts = publicProducts.filter(
            (p) => p.storeId === selectedStore.id || p.sellerId === selectedStore.ownerId
          );
          return (
            <div className="space-y-4 anim-fadeUp">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => navigateTo("stores")}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#246BFD] cursor-pointer"
                >
                  <ArrowLeft size={14} /> Voltar às Lojas
                </button>
                <button
                  type="button"
                  onClick={() => setShowStoreReportForm(!showStoreReportForm)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-red-400 cursor-pointer"
                >
                  <Flag size={13} /> Denunciar Loja
                </button>
              </div>

              {showStoreReportForm && (
                <form
                  onSubmit={handleSubmitStoreReport}
                  className="p-4 rounded-2xl border border-red-500/30 bg-red-500/10 space-y-2 text-xs"
                >
                  <label className="font-bold block text-red-300">Motivo da denúncia contra esta loja</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={storeReportReason}
                      onChange={(e) => setStoreReportReason(e.target.value)}
                      placeholder="Ex: Produto falsificado, cobrança indevida ou loja encerrada"
                      className="flex-1 min-w-0 px-3 py-2 rounded-xl border bg-transparent outline-none"
                      style={{ borderColor: "var(--border)" }}
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-red-600 text-white font-black cursor-pointer shrink-0"
                    >
                      Enviar
                    </button>
                  </div>
                </form>
              )}

              <div
                className="p-4 sm:p-5 rounded-3xl border space-y-3"
                style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-16 h-16 rounded-2xl bg-[#246BFD]/15 text-[#246BFD] grid place-items-center overflow-hidden shrink-0">
                      <SafeImage
                        src={selectedStore.facadeImage || selectedStore.logo}
                        alt={selectedStore.name}
                        className="w-full h-full object-cover"
                        fallbackIcon={<StoreIcon size={28} className="text-[#246BFD]" />}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h1 className="text-lg sm:text-xl font-black truncate">{selectedStore.name}</h1>
                        {selectedStore.isVip && <Crown size={16} className="text-amber-400 fill-amber-400 shrink-0" />}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs mt-0.5">
                        <span className="px-2 py-0.5 rounded-full bg-[#246BFD]/15 text-[#246BFD] font-bold text-[10px]">
                          {formatStoreType(selectedStore.storeType)}
                        </span>
                        {selectedStore.code && <span className="opacity-65 font-bold">{selectedStore.code}</span>}
                        {selectedStore.rating > 0 && (
                          <span className="text-amber-400 font-black">
                            ★ {Number(selectedStore.rating).toFixed(1)} ({selectedStore.reviewsCount || storeReviews.length})
                          </span>
                        )}
                      </div>
                      <p className="text-xs opacity-75 mt-1">
                        {selectedStore.address ? `${selectedStore.address} · ` : ""}
                        {selectedStore.bairro ? `${selectedStore.bairro}, ` : ""}
                        {selectedStore.municipality}, Uíge
                      </p>
                    </div>
                  </div>
                </div>
                {selectedStore.description && <p className="text-xs opacity-80">{selectedStore.description}</p>}
              </div>

              {/* Artigos da Loja */}
              {storeProducts.length === 0 ? (
                <div className="py-8 text-center space-y-1.5">
                  <Package size={36} className="mx-auto opacity-40 text-[#246BFD]" />
                  <h3 className="font-bold text-sm">Esta loja ainda não publicou artigos</h3>
                  <p className="text-xs opacity-60">Volta em breve ou explora outras lojas da província.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {storeProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      isFavorite={favorites.includes(product.id)}
                      onToggleFavorite={handleToggleFavorite}
                      onAddToCart={(p) => handleAddToCart(p, 1)}
                      onOpenProduct={openProductDetails}
                    />
                  ))}
                </div>
              )}

              {/* Avaliações da Loja */}
              <div
                className="p-4 sm:p-5 rounded-3xl border space-y-3 text-xs"
                style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
              >
                <h2 className="font-black text-sm">Avaliações da Loja</h2>

                <form onSubmit={handleSubmitStoreReview} className="space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold opacity-75 mr-1">Classificação:</span>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setReviewStars(star)}
                        className="cursor-pointer p-0.5"
                        aria-label={`${star} estrelas`}
                      >
                        <Star
                          size={18}
                          className={star <= reviewStars ? "text-amber-400 fill-amber-400" : "opacity-30"}
                        />
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Escreve a tua opinião sobre o atendimento e produtos…"
                      className="flex-1 min-w-0 px-3 py-2 rounded-xl border bg-transparent outline-none"
                      style={{ borderColor: "var(--border)" }}
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl font-black text-slate-950 cursor-pointer shrink-0"
                      style={{ backgroundColor: "var(--accent)" }}
                    >
                      Avaliar
                    </button>
                  </div>
                </form>

                {storeReviews.length === 0 ? (
                  <p className="opacity-65">Ainda sem avaliações. Sê o primeiro a avaliar esta loja.</p>
                ) : (
                  <div className="space-y-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                    {storeReviews.map((rev) => (
                      <div key={rev.id} className="space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold">{rev.userName || "Cliente Uíge"}</span>
                          <span className="text-amber-400 font-black">{"★".repeat(rev.stars)}</span>
                        </div>
                        {rev.comment && <p className="opacity-80">{rev.comment}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* VIEW: SEARCH */}
        {view === "search" && (
          <div className="space-y-4 anim-fadeUp">
            <div className="flex items-center justify-between">
              <h1 className="text-xl sm:text-2xl font-black">Resultados da Pesquisa</h1>
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#246BFD] cursor-pointer"
              >
                <SlidersHorizontal size={14} />
                <span>{showFilters ? "Ocultar Filtros" : "Mostrar Filtros"}</span>
              </button>
            </div>

            {searchAds[0] && (
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleOpenSponsoredAd(searchAds[0])}
                onKeyDown={(e) => e.key === "Enter" && handleOpenSponsoredAd(searchAds[0])}
                className="w-full p-3 rounded-2xl border border-[#246BFD]/40 bg-[#246BFD]/10 text-left flex items-center justify-between gap-3 cursor-pointer"
              >
                {(searchAds[0].imageUrl || searchAds[0].videoUrl || searchAds[0].storeImage) && (
                  <SponsoredMediaView
                    ad={searchAds[0]}
                    compact
                    className="w-20 h-14 rounded-xl overflow-hidden shrink-0 border border-[#246BFD]/30"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <span className="inline-block text-[10px] font-black px-2 py-0.5 rounded-md bg-[#B7F34A] text-slate-950 mr-2">
                    Patrocinado
                  </span>
                  <span className="font-black text-xs">{searchAds[0].title}</span>
                </div>
                <ChevronRight size={15} className="shrink-0 text-[#246BFD]" />
              </div>
            )}

            {showFilters && (
              <div
                className="p-4 rounded-3xl border grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs"
                style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div>
                  <label className="block font-bold mb-1 opacity-75">Categoria</label>
                  <select
                    value={filters.category}
                    onChange={(e) => {
                      const next = { ...filters, category: e.target.value };
                      setFilters(next);
                      handlePerformSearch(searchQuery, next);
                    }}
                    className="w-full p-2.5 rounded-xl border outline-none"
                    style={{
                      borderColor: "var(--border)",
                      backgroundColor: "var(--surface-secondary)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="todas" className="bg-slate-900 text-white">Todas</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.name} className="bg-slate-900 text-white">{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold mb-1 opacity-75">Condição</label>
                  <select
                    value={filters.condition}
                    onChange={(e) => {
                      const next = { ...filters, condition: e.target.value as any };
                      setFilters(next);
                      handlePerformSearch(searchQuery, next);
                    }}
                    className="w-full p-2.5 rounded-xl border outline-none"
                    style={{
                      borderColor: "var(--border)",
                      backgroundColor: "var(--surface-secondary)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="todas" className="bg-slate-900 text-white">Novo e Usado</option>
                    <option value="novo" className="bg-slate-900 text-white">Novo</option>
                    <option value="usado" className="bg-slate-900 text-white">Usado</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold mb-1 opacity-75">Tipo de Loja</label>
                  <select
                    value={filters.storeType}
                    onChange={(e) => {
                      const next = { ...filters, storeType: e.target.value as any };
                      setFilters(next);
                      handlePerformSearch(searchQuery, next);
                    }}
                    className="w-full p-2.5 rounded-xl border outline-none"
                    style={{
                      borderColor: "var(--border)",
                      backgroundColor: "var(--surface-secondary)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="todos" className="bg-slate-900 text-white">Todas</option>
                    <option value="loja_fixa" className="bg-slate-900 text-white">Loja fixa</option>
                    <option value="vendedor_ambulante" className="bg-slate-900 text-white">Vendedor ambulante</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold mb-1 opacity-75">Município</label>
                  <select
                    value={filters.location}
                    onChange={(e) => {
                      const next = { ...filters, location: e.target.value };
                      setFilters(next);
                      handlePerformSearch(searchQuery, next);
                    }}
                    className="w-full p-2.5 rounded-xl border outline-none"
                    style={{
                      borderColor: "var(--border)",
                      backgroundColor: "var(--surface-secondary)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="todas" className="bg-slate-900 text-white">Todo o Uíge</option>
                    {UIGE_MUNICIPALITIES.map((m) => (
                      <option key={m} value={m} className="bg-slate-900 text-white">{m}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold mb-1 opacity-75">Ordenar por</label>
                  <select
                    value={filters.sort}
                    onChange={(e) => {
                      const next = { ...filters, sort: e.target.value };
                      setFilters(next);
                      handlePerformSearch(searchQuery, next);
                    }}
                    className="w-full p-2.5 rounded-xl border outline-none"
                    style={{
                      borderColor: "var(--border)",
                      backgroundColor: "var(--surface-secondary)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="relevancia" className="bg-slate-900 text-white">Relevância</option>
                    <option value="preco-asc" className="bg-slate-900 text-white">Menor Preço</option>
                    <option value="preco-desc" className="bg-slate-900 text-white">Maior Preço</option>
                    <option value="vendas" className="bg-slate-900 text-white">Mais Vendidos</option>
                  </select>
                </div>

                <div className="flex flex-col justify-end gap-2">
                  <label className="inline-flex items-center gap-2 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.available}
                      onChange={(e) => {
                        const next = { ...filters, available: e.target.checked };
                        setFilters(next);
                        handlePerformSearch(searchQuery, next);
                      }}
                    />
                    <span>Apenas em stock</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const reset = {
                        sort: "relevancia",
                        maxPrice: "",
                        location: "todas",
                        category: "todas",
                        condition: "todas" as const,
                        storeType: "todos" as const,
                        available: false,
                      };
                      setFilters(reset);
                      handlePerformSearch("", reset);
                    }}
                    className="text-left text-[#246BFD] font-bold hover:underline cursor-pointer"
                  >
                    Limpar filtros
                  </button>
                </div>
              </div>
            )}

            {searching ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-60 rounded-3xl bg-slate-800/40 animate-pulse border border-[#26354B]" />
                ))}
              </div>
            ) : searchResults.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <SearchIcon size={36} className="mx-auto opacity-40" />
                <h3 className="font-black text-base">Nada encontrado</h3>
                <p className="text-xs opacity-65 max-w-sm mx-auto">
                  {searchQuery
                    ? `Não encontrámos artigos relevantes para "${searchQuery}". Tenta outro nome ou limpa os filtros.`
                    : "Nenhum artigo corresponde aos filtros selecionados."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {searchResults.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    isFavorite={favorites.includes(product.id)}
                    onToggleFavorite={handleToggleFavorite}
                    onAddToCart={(p) => handleAddToCart(p, 1)}
                    onOpenProduct={openProductDetails}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW: FAVORITES */}
        {view === "favorites" && (
          <div className="space-y-4 anim-fadeUp">
            <h1 className="text-xl sm:text-2xl font-black">Os Meus Favoritos</h1>
            {favoriteProducts.length === 0 ? (
              <div className="py-10 text-center space-y-3">
                <Heart size={40} className="mx-auto opacity-40 text-red-400" />
                <h3 className="font-bold text-sm">Ainda não guardou artigos favoritos</h3>
                <p className="text-xs opacity-60">Toque no coração de qualquer produto para acompanhar o preço e disponibilidade.</p>
                <button
                  type="button"
                  onClick={() => navigateTo("home")}
                  className="px-5 py-2.5 rounded-2xl font-black text-xs text-white cursor-pointer"
                  style={{ backgroundColor: "var(--primary)" }}
                >
                  Explorar Catálogo
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {favoriteProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    isFavorite={true}
                    onToggleFavorite={handleToggleFavorite}
                    onAddToCart={(p) => handleAddToCart(p, 1)}
                    onOpenProduct={openProductDetails}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW: CART (Agrupado por Loja + Opção de Entrega vs Levantamento na Loja) */}
        {view === "cart" && (
          <div className="max-w-2xl mx-auto space-y-4 anim-fadeUp">
            <h1 className="text-xl sm:text-2xl font-black">O Meu Carrinho</h1>
            {cartGroups.length === 0 ? (
              <div className="py-10 text-center space-y-3">
                <ShoppingCart size={40} className="mx-auto opacity-40" />
                <h3 className="font-bold text-sm">O seu carrinho está vazio</h3>
                <p className="text-xs opacity-60">Explore o catálogo e adicione artigos de lojas locais.</p>
                <button
                  type="button"
                  onClick={() => navigateTo("home")}
                  className="px-5 py-2.5 rounded-2xl font-black text-xs text-white cursor-pointer"
                  style={{ backgroundColor: "var(--primary)" }}
                >
                  Explorar Artigos
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {cartGroups.map((group) => (
                  <div
                    key={group.storeKey}
                    className="rounded-3xl border overflow-hidden"
                    style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
                  >
                    {/* Cabeçalho da Loja no Carrinho */}
                    <div
                      className="px-4 py-2.5 border-b flex items-center justify-between gap-2 text-xs"
                      style={{ backgroundColor: "var(--surface-secondary)", borderColor: "var(--border)" }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <StoreIcon size={14} className="text-[#246BFD] shrink-0" />
                        <span className="font-black truncate">{group.storeName}</span>
                        {group.storeCode && <span className="opacity-65 font-bold">{group.storeCode}</span>}
                      </div>
                      <span className="text-[11px] font-bold opacity-75 shrink-0">
                        {formatStoreType(group.storeType)}
                      </span>
                    </div>

                    <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                      {group.items.map((item) => (
                        <div key={item.productId} className="p-3.5 flex items-center justify-between gap-3">
                          <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-slate-900/50">
                            <SafeImage
                              src={item.product.image}
                              alt={item.product.name}
                              className="w-full h-full object-cover"
                              fallbackIcon={<Package size={20} className="text-[#246BFD]" />}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-xs truncate">{item.product.name}</h4>
                            <span className="font-black text-xs text-[#B7F34A] block tabular-nums">
                              {fmtKz(item.product.price)}
                            </span>
                            <div className="flex items-center gap-2 mt-1.5">
                              <button
                                type="button"
                                onClick={() => handleUpdateCartQty(item.productId, -1)}
                                className="w-6 h-6 rounded-lg border grid place-items-center cursor-pointer"
                                style={{ borderColor: "var(--border)" }}
                                aria-label="Diminuir quantidade"
                              >
                                <Minus size={12} />
                              </button>
                              <span className="text-xs font-bold">{item.qty} un.</span>
                              <button
                                type="button"
                                onClick={() => handleUpdateCartQty(item.productId, 1)}
                                className="w-6 h-6 rounded-lg border grid place-items-center cursor-pointer"
                                style={{ borderColor: "var(--border)" }}
                                aria-label="Aumentar quantidade"
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setCart(cart.filter((c) => c.productId !== item.productId))}
                            className="p-2 text-red-400 hover:text-red-500 cursor-pointer shrink-0"
                            aria-label="Remover item do carrinho"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div
                      className="px-4 py-2.5 border-t flex items-center justify-between text-xs font-bold"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <span className="opacity-70">Subtotal da loja:</span>
                      <span className="tabular-nums">{fmtKz(group.subtotal)}</span>
                    </div>
                  </div>
                ))}

                {/* Checkout summary */}
                <div className="p-4 rounded-3xl border space-y-3" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
                  <div>
                    <label className="block text-xs font-bold mb-1.5">Modo de Recepção</label>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setCheckoutDeliveryType("entrega")}
                        className={`p-2.5 rounded-xl font-bold border cursor-pointer flex items-center justify-center gap-1.5 ${
                          checkoutDeliveryType === "entrega"
                            ? "bg-[#246BFD] text-white border-[#246BFD]"
                            : "border-[var(--border)]"
                        }`}
                      >
                        <Truck size={14} />
                        <span>Entrega ({fmtKz(systemConfig.defaultDeliveryFee)})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCheckoutDeliveryType("levantamento")}
                        className={`p-2.5 rounded-xl font-bold border cursor-pointer flex items-center justify-center gap-1.5 ${
                          checkoutDeliveryType === "levantamento"
                            ? "bg-[#246BFD] text-white border-[#246BFD]"
                            : "border-[var(--border)]"
                        }`}
                      >
                        <StoreIcon size={14} />
                        <span>Levantamento (Grátis)</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between text-xs gap-2">
                    <span className="opacity-70">Subtotal ({cartGroups.length} loja{cartGroups.length > 1 ? "s" : ""}):</span>
                    <span className="font-bold tabular-nums">{fmtKz(cartSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs gap-2">
                    <span className="opacity-70">
                      {checkoutDeliveryType === "entrega"
                        ? `Entrega Equipa Mercado Uíge (${cartGroups.length}x):`
                        : "Levantamento na Loja:"}
                    </span>
                    <span className="font-bold tabular-nums">{fmtKz(cartDeliveryTotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-black pt-2 border-t gap-2" style={{ borderColor: "var(--border)" }}>
                    <span>Total Geral:</span>
                    <span className="tabular-nums" style={{ color: "var(--accent)" }}>
                      {fmtKz(cartTotal)}
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold mb-1">Método de Pagamento</label>
                    <select
                      value={checkoutPayment}
                      onChange={(e) => setCheckoutPayment(e.target.value)}
                      className="w-full p-2.5 rounded-xl border text-xs font-medium outline-none"
                      style={{
                        borderColor: "var(--border)",
                        backgroundColor: "var(--surface-secondary)",
                        color: "var(--text-primary)",
                      }}
                    >
                      <option value="Multicaixa Express" className="bg-slate-900 text-white">Multicaixa Express</option>
                      <option value="Pagamento na Entrega" className="bg-slate-900 text-white">Pagamento na Entrega (Dinheiro/TPA)</option>
                      <option value="Transferência Bancária (IBAN)" className="bg-slate-900 text-white">Transferência Bancária (IBAN)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold mb-1">Telemóvel / WhatsApp do Cliente *</label>
                    <input
                      type="tel"
                      required
                      value={checkoutPhone}
                      onChange={(e) => setCheckoutPhone(e.target.value)}
                      placeholder="Ex: 923000000"
                      className="w-full p-2.5 rounded-xl border bg-transparent text-xs font-medium outline-none focus:border-[#246BFD]"
                      style={{ borderColor: "var(--border)" }}
                    />
                  </div>

                  {checkoutDeliveryType === "entrega" && (
                    <div>
                      <label className="block text-xs font-bold mb-1">Endereço de Entrega no Uíge</label>
                      <input
                        type="text"
                        required
                        value={checkoutAddress}
                        onChange={(e) => setCheckoutAddress(e.target.value)}
                        placeholder="Ex: Bairro Candombe Velho, Rua 4, Casa 12"
                        className="w-full p-2.5 rounded-xl border bg-transparent text-xs font-medium outline-none focus:border-[#246BFD]"
                        style={{ borderColor: "var(--border)" }}
                      />
                    </div>
                  )}

                  {cartGroups.length > 1 && (
                    <p className="text-[11px] opacity-75">
                      Serão criadas {cartGroups.length} encomendas separadas, uma para cada loja.
                    </p>
                  )}

                  <p className="text-[11px] opacity-75">
                    Ao enviar pelo WhatsApp após finalizar, o teu nome e telefone serão partilhados com a loja.
                  </p>

                  <button
                    type="button"
                    onClick={handleConfirmOrder}
                    className="w-full py-3.5 rounded-2xl font-black text-sm text-slate-950 shadow-lg cursor-pointer"
                    style={{ backgroundColor: "var(--accent)" }}
                  >
                    Finalizar Encomenda ({fmtKz(cartTotal)})
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW: ORDERS */}
        {view === "orders" && (
          <div className="max-w-2xl mx-auto space-y-4 anim-fadeUp">
            <h1 className="text-xl sm:text-2xl font-black">As Minhas Encomendas</h1>

            {recentWhatsAppOrders.length > 0 && (
              <div
                className="p-4 rounded-3xl border border-[#246BFD]/50 space-y-3 text-xs"
                style={{ backgroundColor: "rgba(36, 107, 253, 0.1)" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-black text-sm text-[#B7F34A]">
                      Encomenda(s) Registada(s) — Enviar via WhatsApp
                    </h2>
                    <p className="opacity-85 mt-0.5">
                      O teu nome e telefone serão partilhados com a loja.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRecentWhatsAppOrders([])}
                    className="text-[11px] font-bold opacity-70 hover:opacity-100 cursor-pointer shrink-0"
                  >
                    Fechar aviso
                  </button>
                </div>

                <div className="space-y-2.5">
                  {recentWhatsAppOrders.map((ord) => {
                    const st = ord.storeId ? stores.find((s) => s.id === ord.storeId) : undefined;
                    const wa = buildWhatsAppOrderUrl({
                      order: {
                        ...ord,
                        userName: ord.userName || user?.name,
                        userPhone: ord.userPhone || user?.phone || undefined,
                      },
                      storePhone: ord.storePhone || st?.phone || null,
                      fallbackAdminPhone: systemConfig.adminWhatsapp,
                    });
                    return (
                      <div
                        key={ord.id}
                        className="p-3 rounded-2xl border space-y-2"
                        style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
                      >
                        <div className="flex items-center justify-between gap-2 font-bold">
                          <span className="truncate">
                            #{ord.code} · {ord.storeName || "Loja Uíge"}
                          </span>
                          <span className="text-[#B7F34A] tabular-nums shrink-0">{fmtKz(ord.total)}</span>
                        </div>

                        {wa.usedFallback && (
                          <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-start gap-1.5 text-[11px]">
                            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                            <span>
                              Esta loja não tem WhatsApp válido registado. O pedido será encaminhado para o WhatsApp oficial de apoio do Mercado Uíge.
                            </span>
                          </div>
                        )}

                        <a
                          href={wa.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black flex items-center justify-center gap-2 transition-colors"
                        >
                          <MessageCircle size={15} />
                          <span>Enviar pedido por WhatsApp ({ord.storeName || "Loja"})</span>
                        </a>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {loading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-24 rounded-3xl bg-slate-800/40 animate-pulse border border-[#26354B]" />
                ))}
              </div>
            ) : orders.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <Package size={40} className="mx-auto opacity-40" />
                <h3 className="font-bold text-sm">Sem encomendas registadas</h3>
                <p className="text-xs opacity-60">As compras realizadas no Mercado Uíge aparecerão aqui.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map((ord) => {
                  const linkedDelivery = deliveries.find((d) => d.orderId === ord.id);
                  const stepIdx = linkedDelivery
                    ? DELIVERY_STATUSES.indexOf(linkedDelivery.status as any)
                    : -1;
                  const storeObj = ord.storeId ? stores.find((s) => s.id === ord.storeId) : undefined;
                  const wa = buildWhatsAppOrderUrl({
                    order: {
                      ...ord,
                      userName: ord.userName || user?.name,
                      userPhone: ord.userPhone || user?.phone || undefined,
                    },
                    storePhone: ord.storePhone || storeObj?.phone || null,
                    fallbackAdminPhone: systemConfig.adminWhatsapp,
                  });
                  return (
                    <div
                      key={ord.id}
                      className="p-4 rounded-3xl border space-y-2.5 text-xs"
                      style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
                    >
                      <div className="flex flex-wrap justify-between items-center gap-2 font-bold">
                        <span>
                          #{ord.code} {ord.storeName ? `· ${ord.storeName}` : ""}
                        </span>
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
                          <span className="px-2.5 py-0.5 rounded-full bg-[#246BFD] text-white text-[10px]">
                            {ord.status}
                          </span>
                        </div>
                      </div>

                      <div className="opacity-80 break-words">
                        {ord.deliveryType === "levantamento" ? "Levantamento na loja" : ord.address} • {ord.paymentMethod} • Total:{" "}
                        <b className="text-[#B7F34A] tabular-nums">{fmtKz(ord.total)}</b>
                      </div>

                      {linkedDelivery && (
                        <div
                          className="p-3 rounded-2xl border space-y-2"
                          style={{ backgroundColor: "var(--surface-secondary)", borderColor: "var(--border)" }}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold flex items-center gap-1.5">
                              <Truck size={13} className="text-[#246BFD]" />
                              Entrega: {linkedDelivery.status}
                            </span>
                            {linkedDelivery.status !== "Entregue" && (
                              <span className="px-2 py-0.5 rounded-lg bg-[#B7F34A] text-slate-950 font-black tracking-widest">
                                Código: {linkedDelivery.confirmationCode}
                              </span>
                            )}
                          </div>

                          {/* Barra de progresso dos estados */}
                          <div className="grid grid-cols-5 gap-1">
                            {DELIVERY_STATUSES.slice(0, 5).map((st, idx) => (
                              <div key={st} className="space-y-1">
                                <div
                                  className={`h-1.5 rounded-full ${
                                    stepIdx >= idx ? "bg-[#B7F34A]" : "bg-slate-600/40"
                                  }`}
                                />
                                <span className="block text-[9px] leading-tight opacity-75 truncate">{st}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {ord.items && ord.items.length > 0 && (
                        <div className="text-[11px] opacity-65 pt-1 border-t" style={{ borderColor: "var(--border)" }}>
                          {ord.items.map((it) => `${it.qty}x ${it.productName}`).join(" • ")}
                        </div>
                      )}

                      {ord.status !== "Cancelada" && ord.status !== "Entregue" && (
                        <div className="pt-2 border-t space-y-1.5" style={{ borderColor: "var(--border)" }}>
                          {wa.usedFallback && (
                            <p className="text-[11px] text-amber-300 flex items-center gap-1">
                              <AlertTriangle size={12} className="shrink-0" />
                              <span>Loja sem WhatsApp registado — envio encaminhado para o apoio do Mercado Uíge.</span>
                            </p>
                          )}
                          <p className="text-[10px] opacity-70">
                            O teu nome e telefone serão partilhados com a loja.
                          </p>
                          <a
                            href={wa.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs"
                          >
                            <MessageCircle size={14} />
                            <span>Enviar pedido por WhatsApp</span>
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* VIEW: NOTIFICATIONS */}
        {view === "notifications" && (
          <div className="max-w-2xl mx-auto space-y-4 anim-fadeUp">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-xl sm:text-2xl font-black truncate">Notificações e Avisos</h1>
              {user && notifications.some((n) => !n.isRead) && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await notificationRepo.markAllRead(user.id);
                      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
                    } catch (err: unknown) {
                      showToast(translateErrorMessage(err, "Não foi possível actualizar as notificações."));
                    }
                  }}
                  className="text-xs font-bold text-[#246BFD] cursor-pointer hover:underline shrink-0"
                >
                  Marcar como lidas
                </button>
              )}
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-20 rounded-2xl bg-slate-800/40 animate-pulse border border-[#26354B]" />
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <Bell size={40} className="mx-auto opacity-40" />
                <h3 className="font-bold text-sm">Sem notificações no momento</h3>
                <p className="text-xs opacity-60">Avisos sobre as tuas encomendas e comunicados da província aparecerão aqui.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="p-4 rounded-2xl border space-y-1"
                    style={{
                      backgroundColor: "var(--surface)",
                      borderColor: n.isRead ? "var(--border)" : "#246BFD",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-black text-xs truncate">{n.title}</h3>
                      <span className="text-[10px] opacity-55 shrink-0">{fmtDate(n.createdAt)}</span>
                    </div>
                    <p className="text-xs opacity-80 break-words">{n.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW: SELLER STUDIO */}
        {view === "seller" && (
          <SellerStudioView
            user={user}
            myStore={myStore}
            myProducts={myProducts}
            categories={categories}
            storeOrders={storeOrders}
            myAds={myAds}
            myPayments={myPayments}
            systemConfig={systemConfig}
            onOpenAuth={() => {
              setAuthModalMode("register");
              setAuthModalOpen(true);
            }}
            onReload={loadData}
            onProductDeleted={(id) => setProducts((prev) => prev.filter((p) => p.id !== id))}
            showToast={showToast}
          />
        )}

        {/* VIEW: COURIER PORTAL */}
        {view === "courier" && (
          <CourierView
            user={user}
            deliveries={deliveries}
            monthlyFees={courierFees}
            myPayments={myPayments}
            systemConfig={systemConfig}
            onOpenAuth={() => {
              setAuthModalMode("register");
              setAuthModalOpen(true);
            }}
            onReload={loadData}
            showToast={showToast}
          />
        )}

        {/* VIEW: PROFILE */}
        {view === "profile" && (
          <div className="max-w-2xl mx-auto space-y-4 anim-fadeUp">
            <h1 className="text-xl sm:text-2xl font-black">A Minha Conta</h1>

            {!user ? (
              <div className="p-6 sm:p-8 text-center rounded-3xl border space-y-4" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
                <h3 className="font-black text-base">Aceder com E-mail e Palavra-passe</h3>
                <p className="text-xs opacity-70">Exclusivo para residentes na província do Uíge. A tua sessão fica guardada no telemóvel.</p>
                <button
                  type="button"
                  onClick={() => {
                    setAuthModalMode("login");
                    setAuthModalOpen(true);
                  }}
                  className="px-6 py-2.5 rounded-2xl font-black text-xs text-white cursor-pointer"
                  style={{ backgroundColor: "var(--primary)" }}
                >
                  Entrar / Registar
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 sm:p-5 rounded-3xl border flex items-center gap-3.5 bg-gradient-to-r from-[#246BFD] to-[#07111F] text-white">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 grid place-items-center font-black text-xl shrink-0">
                    {(user.name || "U").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-black text-base truncate">{user.name}</h2>
                      {user.code && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#B7F34A] text-slate-950 font-black">
                          {user.code}
                        </span>
                      )}
                    </div>
                    <p className="text-xs opacity-85 truncate">{user.email}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px]">
                      <span className="px-2.5 py-0.5 rounded-full bg-white/20 font-bold">
                        {formatUserRole(user.role)}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-white/15 font-semibold">
                        {user.bairro ? `${user.bairro}, ` : ""}
                        {user.municipality || "Uíge"}
                      </span>
                      {user.role !== "cliente" && (
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                            user.isApproved === false
                              ? "bg-amber-400 text-slate-950"
                              : "bg-emerald-400 text-slate-950"
                          }`}
                        >
                          <ShieldCheck size={10} />
                          {user.isApproved === false ? "Em aprovação" : "Aprovado"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick links */}
                <div className="grid grid-cols-2 gap-2.5 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => navigateTo("orders")}
                    className="p-3.5 rounded-2xl border flex items-center justify-between cursor-pointer hover:border-[#246BFD]"
                    style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
                  >
                    <span className="flex items-center gap-2"><Package size={15} className="text-[#246BFD]" /> Encomendas</span>
                    <ChevronRight size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateTo("favorites")}
                    className="p-3.5 rounded-2xl border flex items-center justify-between cursor-pointer hover:border-[#246BFD]"
                    style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
                  >
                    <span className="flex items-center gap-2"><Heart size={15} className="text-red-400" /> Favoritos</span>
                    <ChevronRight size={14} />
                  </button>
                  {user.role === "entregador" ? (
                    <button
                      type="button"
                      onClick={() => navigateTo("courier")}
                      className="p-3.5 rounded-2xl border flex items-center justify-between cursor-pointer hover:border-[#246BFD] col-span-2"
                      style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
                    >
                      <span className="flex items-center gap-2"><Truck size={15} className="text-[#B7F34A]" /> Painel do Entregador (Entregas e Ganhos)</span>
                      <ChevronRight size={14} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigateTo("seller")}
                      className="p-3.5 rounded-2xl border flex items-center justify-between cursor-pointer hover:border-[#246BFD] col-span-2"
                      style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
                    >
                      <span className="flex items-center gap-2"><StoreIcon size={15} className="text-[#B7F34A]" /> Painel do Comerciante (Loja, Planos e Artigos)</span>
                      <ChevronRight size={14} />
                    </button>
                  )}
                </div>

                {/* Account & Safety links */}
                <div className="p-4 rounded-3xl border space-y-2 text-xs font-bold" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
                  <button
                    type="button"
                    onClick={() => setShowPrivacyModal(true)}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl border hover:border-[#246BFD] cursor-pointer"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span className="flex items-center gap-2 text-left">
                      <FileText size={15} className="shrink-0" />
                      <span>Privacidade, Termos e Eliminação de Dados</span>
                    </span>
                    <ChevronRight size={15} className="shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl border text-amber-500 hover:border-amber-500 cursor-pointer"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span>Terminar Sessão</span>
                    <LogOut size={15} />
                  </button>

                  {!confirmDeleteAccount ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteAccount(true)}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl border text-red-500 hover:border-red-500 cursor-pointer"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <span>Eliminar Conta e Dados Permanentemente</span>
                      <Trash2 size={15} />
                    </button>
                  ) : (
                    <div className="p-3 rounded-2xl bg-red-500/15 border border-red-500/40 space-y-2">
                      <p className="text-red-400">
                        Esta acção eliminará permanentemente o seu perfil, lojas, artigos, fotos e encomendas. Confirma?
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteAccount(false)}
                          className="flex-1 py-2 rounded-xl border cursor-pointer"
                          style={{ borderColor: "var(--border)" }}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteAccount}
                          className="flex-1 py-2 rounded-xl bg-red-600 text-white font-black cursor-pointer"
                        >
                          Confirmar Eliminação
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Dock Inferior Mobile: Faixa de anúncio fina ACIMA da barra + Barra de Navegação */}
      <div
        data-testid="mobile-bottom-dock"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 flex flex-col pointer-events-none"
      >
        <BottomAdStrip
          ad={activeStripAd}
          onOpen={(ad) => handleOpenSponsoredAd(ad)}
          onDismiss={(id) => setDismissedStripAdIds((prev) => (prev.includes(id) ? prev : [...prev, id]))}
        />
        <BottomNav
          activeView={view}
          onSelectNav={handleSelectBottomNav}
          cartCount={cartCount}
          embedded={true}
        />
      </div>

      {/* Modals */}
      <LocationModal
        isOpen={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        currentLocation={location}
        onSelectLocation={(loc) => setLocation(loc)}
      />

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authModalMode}
        onSuccess={(u) => {
          setUser(u);
          loadData();
        }}
        showToast={showToast}
      />

      <PublishProductModal
        isOpen={publishModalOpen}
        onClose={() => setPublishModalOpen(false)}
        user={user}
        myStore={myStore}
        categories={categories}
        systemConfig={systemConfig}
        onPublished={async () => {
          await loadData();
        }}
        onGoToSeller={() => navigateTo("seller")}
        showToast={showToast}
      />

      <WantToSellModal
        isOpen={wantToSellModalOpen}
        onClose={() => setWantToSellModalOpen(false)}
        user={user}
        myStore={myStore}
        categories={categories}
        onSubmitted={async () => {
          await loadData();
        }}
        onGoToSeller={() => navigateTo("seller")}
        showToast={showToast}
      />

      <ProductDetailModal
        product={selectedProduct}
        isOpen={Boolean(selectedProduct)}
        onClose={() => setSelectedProduct(null)}
        isFavorite={selectedProduct ? favorites.includes(selectedProduct.id) : false}
        onToggleFavorite={handleToggleFavorite}
        onAddToCart={handleAddToCart}
        onOpenStore={
          selectedProduct?.storeId && stores.some((s) => s.id === selectedProduct.storeId)
            ? (storeId) => {
                const found = stores.find((s) => s.id === storeId);
                if (found) {
                  setSelectedProduct(null);
                  openStoreDetails(found);
                }
              }
            : undefined
        }
        similarProducts={publicProducts
          .filter((p) => p.id !== selectedProduct?.id && p.categoryName === selectedProduct?.categoryName)
          .slice(0, 4)}
        onSelectProduct={openProductDetails}
        onSendMessage={handleSendMessageToSeller}
        onReportProduct={async (pId, reason) => {
          try {
            await reportRepo.create({
              reporterId: user?.id,
              productId: pId,
              productName: selectedProduct?.name,
              storeId: selectedProduct?.storeId,
              storeName: selectedProduct?.storeName,
              reason,
            });
            showToast("Denúncia recebida para análise.");
            loadData();
          } catch (err: unknown) {
            showToast(translateErrorMessage(err, "Não foi possível enviar a denúncia."));
          }
        }}
      />

      <PrivacyPolicyModal
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
        isLoggedIn={Boolean(user)}
        onDeleteAccountRequested={handleDeleteAccount}
      />

      <FullscreenAdOverlay
        ad={fullscreenAd}
        store={fullscreenAd?.storeId ? stores.find((s) => s.id === fullscreenAd.storeId) || null : null}
        onClose={() => setFullscreenAd(null)}
        onOpenStore={(targetAd) => {
          setFullscreenAd(null);
          handleOpenSponsoredAd(targetAd, true);
        }}
      />

      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed md:bottom-8 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-24px)] px-4 sm:px-5 py-3 rounded-2xl font-black text-xs shadow-2xl anim-pop text-slate-950 flex items-center justify-center gap-2 border border-black/10 text-center ${
            activeStripAd ? "bottom-32" : "bottom-20"
          }`}
          style={{ backgroundColor: "var(--accent)" }}
        >
          <CheckCircle2 size={16} className="shrink-0" />
          <span className="break-words">{toast}</span>
        </div>
      )}
    </div>
  );
};
