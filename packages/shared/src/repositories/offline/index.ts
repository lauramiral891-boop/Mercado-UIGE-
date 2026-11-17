import {
  Product,
  Store,
  User,
  Order,
  NotificationItem,
  ReportItem,
  MessageItem,
  AuditLogItem,
  StoreReview,
  SponsoredAd,
  MerchantPayment,
  DeliveryRecord,
  DeliveryStatus,
  CourierMonthlyFee,
  SystemConfig,
  AdPosition,
  AdAdvertiserType,
  AdDestinationType,
  PlanType,
  ApprovalStatus,
  UserRole,
  SystemEvent,
  SystemEventSeverity,
  AppErrorRecord,
  SystemHealthMetrics,
  NocServiceCheck,
} from "../../types";
import {
  IProductRepo,
  IOrderRepo,
  IMessageRepo,
  IUserRepo,
  IStoreRepo,
  IStoreReviewRepo,
  INotificationRepo,
  IReportRepo,
  IAdRepo,
  IPaymentRepo,
  IDeliveryRepo,
  ISystemConfigRepo,
  IAuditRepo,
  ISystemEventRepo,
  IAppErrorRepo,
  ISystemHealthRepo,
  ProductFilters,
} from "../types";
import {
  getStoredProducts,
  saveProducts,
  getStoredStores,
  saveStores,
  getStoredUsers,
  saveUsers,
  getStoredCurrentUser,
  saveCurrentUser,
  getStoredOrders,
  saveOrders,
  getStoredMessages,
  saveMessages,
  getStoredNotifications,
  saveNotifications,
  getStoredReports,
  saveReports,
  getStoredStoreReviews,
  saveStoreReviews,
  getStoredAds,
  saveAds,
  getStoredMerchantPayments,
  saveMerchantPayments,
  getStoredDeliveries,
  saveDeliveries,
  getStoredCourierFees,
  saveCourierFees,
  getStoredSystemConfig,
  saveSystemConfig,
  getStoredAuditLogs,
  saveAuditLogs,
  getStoredSystemEvents,
  saveSystemEvents,
  getStoredAppErrors,
  saveAppErrors,
} from "../../lib/storage";
import { smartSearch, generateOrderCode, generateDeliveryCode } from "../../lib/utils";
import { allowTelemetryWrite, sanitizeTelemetryText } from "../../lib/observability";
import {
  clampBannerDurationSec,
  isAdEligibleForPublicDisplay,
  isAdWithinScheduleWindow,
  isBannerPaid,
  resolveAdAdvertiserType,
  sortBannersForCarousel,
  storeHasActivePaidPlan,
  validateSafeAdDestination,
} from "../../lib/adDelivery";

export interface SyncAction {
  id: string;
  clientMutationId: string;
  type: "CREATE_ORDER" | "SEND_MESSAGE" | "CREATE_PRODUCT" | "UPDATE_STOCK" | "REPORT";
  payload: any;
  timestamp: number;
  retries: number;
}

export interface RemoteSyncHandlers {
  createOrder?: (orderData: any) => Promise<any>;
  sendMessage?: (messageData: any) => Promise<any>;
  createProduct?: (productData: any) => Promise<any>;
  updateStock?: (stockData: { id: string; newStock: number }) => Promise<any>;
}

function nextReadableCode(prefix: string, existingCodes: (string | undefined)[]): string {
  let maxNum = 0;
  for (const code of existingCodes) {
    if (!code) continue;
    const m = code.match(/(\d+)$/);
    if (m) {
      maxNum = Math.max(maxNum, Number(m[1]));
    }
  }
  return `${prefix}-${String(maxNum + 1).padStart(4, "0")}`;
}

export class SyncQueue {
  private storageKey: string;
  private processedKey: string;

  constructor(storageKey = "mu_offline_sync_queue", processedKey = "mu_processed_mutations") {
    this.storageKey = storageKey;
    this.processedKey = processedKey;
  }

  getQueue(): SyncAction[] {
    try {
      if (typeof localStorage === "undefined") return [];
      const item = localStorage.getItem(this.storageKey);
      return item ? JSON.parse(item) : [];
    } catch {
      return [];
    }
  }

  private saveQueue(queue: SyncAction[]): void {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(this.storageKey, JSON.stringify(queue));
      }
    } catch {}
  }

  getProcessedMutationIds(): Set<string> {
    try {
      if (typeof localStorage === "undefined") return new Set();
      const item = localStorage.getItem(this.processedKey);
      return new Set(item ? JSON.parse(item) : []);
    } catch {
      return new Set();
    }
  }

  markProcessed(mutationId: string): void {
    try {
      const set = this.getProcessedMutationIds();
      set.add(mutationId);
      if (typeof localStorage !== "undefined") {
        const arr = Array.from(set).slice(-500);
        localStorage.setItem(this.processedKey, JSON.stringify(arr));
      }
      const queue = this.getQueue();
      const remaining = queue.filter((a) => a.clientMutationId !== mutationId);
      if (remaining.length !== queue.length) {
        this.saveQueue(remaining);
      }
    } catch {}
  }

  enqueue(type: SyncAction["type"], payload: any, clientMutationId?: string): SyncAction {
    const queue = this.getQueue();
    const mutationId = clientMutationId || `mutation_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const existing = queue.find((a) => a.clientMutationId === mutationId);
    if (existing) {
      return existing;
    }

    const action: SyncAction = {
      id: `sync_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      clientMutationId: mutationId,
      type,
      payload: { ...payload, clientMutationId: mutationId },
      timestamp: Date.now(),
      retries: 0,
    };

    queue.push(action);
    this.saveQueue(queue);
    return action;
  }

  async flush(handlers: RemoteSyncHandlers): Promise<{ processed: number; failed: number }> {
    const queue = this.getQueue();
    if (queue.length === 0) return { processed: 0, failed: 0 };

    const processedIds: string[] = [];
    const processedMutations = this.getProcessedMutationIds();
    let processed = 0;
    let failed = 0;

    for (const action of queue) {
      if (processedMutations.has(action.clientMutationId)) {
        processedIds.push(action.id);
        processed++;
        continue;
      }

      try {
        if (action.type === "CREATE_ORDER" && handlers.createOrder) {
          await handlers.createOrder(action.payload);
        } else if (action.type === "SEND_MESSAGE" && handlers.sendMessage) {
          await handlers.sendMessage(action.payload);
        } else if (action.type === "CREATE_PRODUCT" && handlers.createProduct) {
          await handlers.createProduct(action.payload);
        } else if (action.type === "UPDATE_STOCK" && handlers.updateStock) {
          await handlers.updateStock(action.payload);
        }

        this.markProcessed(action.clientMutationId);
        processedIds.push(action.id);
        processed++;
      } catch {
        failed++;
        action.retries += 1;
        break;
      }
    }

    if (processedIds.length > 0) {
      const remaining = this.getQueue().filter((a) => !processedIds.includes(a.id));
      this.saveQueue(remaining);
    } else if (failed > 0) {
      this.saveQueue(queue);
    }

    return { processed, failed };
  }

  clear(): void {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.processedKey);
      }
    } catch {}
  }
}

export const syncQueue = new SyncQueue();

// 1. REPOSITÓRIO OFFLINE DE PRODUTOS
export class OfflineProductRepo implements IProductRepo {
  async getAll(filters?: ProductFilters): Promise<Product[]> {
    const stores = getStoredStores();
    const storeById = new Map(stores.map((s) => [s.id, s]));
    const products = getStoredProducts().map((p) => {
      const st = p.storeId ? storeById.get(p.storeId) : undefined;
      return st
        ? {
            ...p,
            storeName: p.storeName || st.name,
            storeCode: st.code,
            storeType: st.storeType,
            storeVip: st.isVip,
          }
        : p;
    });

    if (
      !filters ||
      (!filters.query &&
        !filters.category &&
        !filters.municipality &&
        (!filters.condition || filters.condition === "todas") &&
        (!filters.storeType || filters.storeType === "todos") &&
        !filters.maxPrice &&
        !filters.availableOnly &&
        !filters.sort)
    ) {
      return products;
    }

    const searched = smartSearch(products, filters.query || "", {
      sort: filters.sort,
      maxPrice: filters.maxPrice,
      location: filters.municipality,
      category: filters.category,
      condition: filters.condition,
      storeType: filters.storeType,
      onlyAvailable: filters.availableOnly,
      personalization: filters.personalization,
    });
    return searched.map((s) => s.item);
  }

  async getById(id: string): Promise<Product | null> {
    const products = await this.getAll();
    return products.find((p) => p.id === id) || null;
  }

  async create(product: Partial<Product>): Promise<Product> {
    const currentUser = getStoredCurrentUser();
    const stores = getStoredStores();
    const cfg = getStoredSystemConfig();
    const st = product.storeId ? stores.find((s) => s.id === product.storeId) : undefined;
    const mutationId = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const defaultApproved = !cfg.requireProductApproval;
    const newProd: Product = {
      id: product.id || mutationId,
      storeId: product.storeId,
      sellerId: product.sellerId || currentUser?.id || "anon",
      name: product.name || "Artigo sem nome",
      description: product.description || "",
      price: Number(product.price || 0),
      oldPrice: product.oldPrice ? Number(product.oldPrice) : null,
      discount:
        product.oldPrice && Number(product.oldPrice) > Number(product.price || 0)
          ? Math.round((1 - Number(product.price || 0) / Number(product.oldPrice)) * 100)
          : product.discount || 0,
      stock: Number(product.stock ?? 1),
      categoryName: product.categoryName || "Electrónicos",
      condition: product.condition || "novo",
      brand: product.brand || "",
      image: product.image || "",
      images: product.images || (product.image ? [product.image] : []),
      videoUrl: product.videoUrl || null,
      mediaType: product.mediaType || (product.videoUrl ? "video" : "imagem"),
      province: "Uíge",
      municipality: product.municipality || "Uíge",
      isApproved: product.isApproved ?? defaultApproved,
      storeName: product.storeName || st?.name || "Loja Local",
      storeCode: st?.code,
      storeType: product.storeType || st?.storeType || "loja_fixa",
      storeVip: st?.isVip || false,
      sales: 0,
      rating: 0,
      reviewsCount: 0,
      createdAt: new Date().toISOString(),
    };

    const list = [newProd, ...getStoredProducts()];
    saveProducts(list);
    syncQueue.enqueue("CREATE_PRODUCT", newProd, mutationId);
    return newProd;
  }

  async updateStock(id: string, newStock: number): Promise<void> {
    const list = getStoredProducts().map((p) => (p.id === id ? { ...p, stock: newStock } : p));
    saveProducts(list);
    syncQueue.enqueue("UPDATE_STOCK", { id, newStock });
  }

  async delete(id: string): Promise<void> {
    const list = getStoredProducts().filter((p) => p.id !== id);
    saveProducts(list);
  }

  async approve(id: string, isApproved: boolean): Promise<void> {
    const list = getStoredProducts().map((p) => (p.id === id ? { ...p, isApproved } : p));
    saveProducts(list);
  }
}

// 2. REPOSITÓRIO OFFLINE DE ENCOMENDAS
export class OfflineOrderRepo implements IOrderRepo {
  private enrichStorePhones(orders: Order[]): Order[] {
    const stores = getStoredStores();
    const storeById = new Map(stores.map((s) => [s.id, s]));
    return orders.map((o) => {
      if (o.storePhone) return o;
      const st = o.storeId ? storeById.get(o.storeId) : undefined;
      return st?.phone ? { ...o, storePhone: st.phone } : o;
    });
  }

  async getAll(userId?: string, storeId?: string): Promise<Order[]> {
    const orders = this.enrichStorePhones(getStoredOrders());
    return orders.filter((o) => {
      if (userId && o.userId !== userId) return false;
      if (storeId && o.storeId !== storeId) return false;
      return true;
    });
  }

  async getById(id: string): Promise<Order | null> {
    const orders = this.enrichStorePhones(getStoredOrders());
    return orders.find((o) => o.id === id) || null;
  }

  async create(orderData: {
    userId: string;
    userName?: string;
    userPhone?: string;
    storeId?: string;
    storeName?: string;
    storePhone?: string | null;
    items: { productId: string; qty: number; selectedVariant?: string }[];
    address: string;
    paymentMethod: string;
    deliveryType?: "entrega" | "levantamento";
    deliveryFee: number;
    notes?: string;
    clientMutationId?: string;
  }): Promise<Order> {
    const products = getStoredProducts();
    const stores = getStoredStores();
    const orderItems = orderData.items.map((item, idx) => {
      const prod = products.find((p) => p.id === item.productId);
      return {
        id: `item_${Date.now()}_${idx}`,
        productId: item.productId,
        productName: prod?.name || "Produto",
        productImage: prod?.image,
        qty: item.qty,
        price: prod?.price || 0,
        selectedVariant: item.selectedVariant,
      };
    });

    const firstProd = products.find((p) => p.id === orderData.items[0]?.productId);
    const resolvedStoreId = orderData.storeId || firstProd?.storeId;
    const storeObj = resolvedStoreId ? stores.find((s) => s.id === resolvedStoreId) : undefined;
    const currentUser = getStoredCurrentUser();
    const sysCfg = getStoredSystemConfig();
    const deliveryType = orderData.deliveryType === "levantamento" ? "levantamento" : "entrega";
    const authoritativeDeliveryFee =
      deliveryType === "levantamento" ? 0 : Math.max(0, Number(sysCfg.defaultDeliveryFee ?? 1500));
    const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.qty, 0);
    const mutationId = orderData.clientMutationId || `order_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const newOrder: Order = {
      id: `ord_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      code: generateOrderCode(),
      userId: orderData.userId,
      userName: orderData.userName || currentUser?.name,
      userPhone: orderData.userPhone || currentUser?.phone || undefined,
      storeId: resolvedStoreId,
      storeName: orderData.storeName || storeObj?.name || firstProd?.storeName || "Loja Uíge",
      storePhone: orderData.storePhone ?? storeObj?.phone ?? null,
      status: "Pendente",
      paymentStatus: "pendente",
      paidAt: null,
      items: orderItems,
      subtotal,
      deliveryType,
      deliveryFee: authoritativeDeliveryFee,
      total: subtotal + authoritativeDeliveryFee,
      address: orderData.address,
      paymentMethod: orderData.paymentMethod,
      createdAt: new Date().toISOString(),
      clientMutationId: mutationId,
    };

    const currentOrders = getStoredOrders();
    saveOrders([newOrder, ...currentOrders]);

    syncQueue.enqueue("CREATE_ORDER", newOrder, mutationId);
    return newOrder;
  }

  async updateStatus(id: string, status: Order["status"]): Promise<void> {
    const orders = getStoredOrders().map((o) => (o.id === id ? { ...o, status } : o));
    saveOrders(orders);
  }

  async markPaid(id: string): Promise<void> {
    const now = new Date().toISOString();
    const orders = getStoredOrders().map((o) =>
      o.id === id
        ? {
            ...o,
            paymentStatus: "pago" as const,
            paidAt: now,
            status: o.status === "Pendente" ? ("Confirmada" as const) : o.status,
          }
        : o
    );
    saveOrders(orders);
  }
}

// 3. REPOSITÓRIO OFFLINE DE MENSAGENS
export class OfflineMessageRepo implements IMessageRepo {
  async getAll(userId: string): Promise<MessageItem[]> {
    const msgs = getStoredMessages();
    return msgs.filter((m) => m.senderId === userId || m.receiverId === userId);
  }

  async send(data: {
    senderId: string;
    receiverId: string;
    productId?: string;
    content: string;
    clientMutationId?: string;
  }): Promise<MessageItem> {
    const mutationId = data.clientMutationId || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newMsg: MessageItem = {
      id: `msg_${Date.now()}`,
      senderId: data.senderId,
      receiverId: data.receiverId,
      productId: data.productId,
      content: data.content,
      isRead: false,
      createdAt: new Date().toISOString(),
      clientMutationId: mutationId,
    };

    const current = getStoredMessages();
    saveMessages([...current, newMsg]);

    syncQueue.enqueue("SEND_MESSAGE", newMsg, mutationId);
    return newMsg;
  }
}

// 4. REPOSITÓRIO OFFLINE DE UTILIZADORES
export class OfflineUserRepo implements IUserRepo {
  private applyUserPlanExpiry(user: User): User {
    if (
      user.planType &&
      user.planType !== "gratis" &&
      user.planExpiresAt &&
      new Date(user.planExpiresAt).getTime() < Date.now()
    ) {
      return { ...user, planType: "gratis" };
    }
    return user;
  }

  async getCurrentUser(): Promise<User | null> {
    const current = getStoredCurrentUser();
    if (!current) return null;
    const checked = this.applyUserPlanExpiry(current);
    if (checked.planType !== current.planType) saveCurrentUser(checked);
    return checked;
  }

  async getAll(): Promise<User[]> {
    const users = getStoredUsers();
    let changed = false;
    const next = users.map((u) => {
      const checked = this.applyUserPlanExpiry(u);
      if (checked.planType !== u.planType) changed = true;
      return checked;
    });
    if (changed) saveUsers(next);
    return next;
  }

  async updateProfile(id: string, updates: Partial<User>): Promise<User> {
    const users = getStoredUsers();
    const idx = users.findIndex((u) => u.id === id);
    if (idx === -1) {
      const current = getStoredCurrentUser();
      if (current && current.id === id) {
        const updated = {
          ...current,
          ...updates,
          code: current.code || nextReadableCode("CL", users.map((u) => u.code)),
        };
        saveCurrentUser(updated);
        return updated;
      }
      throw new Error("Utilizador não encontrado.");
    }
    const updated = {
      ...users[idx],
      ...updates,
      code: users[idx].code || nextReadableCode("CL", users.map((u) => u.code)),
    };
    users[idx] = updated;
    saveUsers(users);
    const current = getStoredCurrentUser();
    if (current && current.id === id) {
      saveCurrentUser(updated);
    }
    return updated;
  }

  async approveUser(id: string, isApproved: boolean): Promise<void> {
    await this.updateApproval(id, isApproved ? "aprovado" : "pendente");
  }

  async updateApproval(id: string, status: ApprovalStatus, note?: string): Promise<void> {
    const isApproved = status === "aprovado";
    const cleanNote = note ? note.trim() : null;
    const users = getStoredUsers().map((u) =>
      u.id === id
        ? {
            ...u,
            isApproved,
            approvalStatus: status,
            rejectionReason: status === "rejeitado" ? cleanNote : u.rejectionReason ?? null,
            correctionNote: status === "correcao" ? cleanNote : u.correctionNote ?? null,
          }
        : u
    );
    saveUsers(users);
    const current = getStoredCurrentUser();
    if (current && current.id === id) {
      saveCurrentUser({
        ...current,
        isApproved,
        approvalStatus: status,
        rejectionReason: status === "rejeitado" ? cleanNote : current.rejectionReason ?? null,
        correctionNote: status === "correcao" ? cleanNote : current.correctionNote ?? null,
      });
    }
  }

  async suspendUser(id: string, isSuspended: boolean): Promise<void> {
    const users = getStoredUsers().map((u) => (u.id === id ? { ...u, isSuspended } : u));
    saveUsers(users);
  }

  async setRole(id: string, role: UserRole): Promise<void> {
    const users = getStoredUsers().map((u) => (u.id === id ? { ...u, role } : u));
    saveUsers(users);
    const current = getStoredCurrentUser();
    if (current && current.id === id) {
      saveCurrentUser({ ...current, role });
    }
  }

  async requestMerchantUpgrade(
    id: string,
    data?: { phone?: string; municipality?: string; bairro?: string }
  ): Promise<User> {
    const patch: Partial<User> = {
      role: "comerciante",
      isApproved: false,
      approvalStatus: "pendente",
      ...(data?.phone ? { phone: data.phone } : {}),
      ...(data?.municipality ? { municipality: data.municipality } : {}),
      ...(data?.bairro ? { bairro: data.bairro } : {}),
    };
    return this.updateProfile(id, patch);
  }

  async setPlan(id: string, planType: PlanType, durationDays = 30): Promise<void> {
    const expiresAt =
      planType === "gratis" ? null : new Date(Date.now() + durationDays * 86400000).toISOString();
    const users = getStoredUsers().map((u) =>
      u.id === id ? { ...u, planType, planExpiresAt: expiresAt } : u
    );
    saveUsers(users);
    const current = getStoredCurrentUser();
    if (current && current.id === id) {
      saveCurrentUser({ ...current, planType, planExpiresAt: expiresAt });
    }
  }

  async deleteAccount(id: string): Promise<void> {
    const users = getStoredUsers().filter((u) => u.id !== id);
    saveUsers(users);
    const current = getStoredCurrentUser();
    if (current && current.id === id) {
      saveCurrentUser(null);
    }
    saveProducts(getStoredProducts().filter((p) => p.sellerId !== id));
    saveStores(getStoredStores().filter((s) => s.ownerId !== id));
    saveOrders(getStoredOrders().filter((o) => o.userId !== id));
    saveMessages(getStoredMessages().filter((m) => m.senderId !== id && m.receiverId !== id));
    saveNotifications(getStoredNotifications().filter((n) => n.userId !== id));
  }
}

// 5. REPOSITÓRIO OFFLINE DE LOJAS (Inclui expiração automática de planos)
export class OfflineStoreRepo implements IStoreRepo {
  private applyPlanExpiry(stores: Store[]): Store[] {
    const now = Date.now();
    let changed = false;
    const next = stores.map((s) => {
      if (s.planType && s.planType !== "gratis" && s.planExpiresAt && new Date(s.planExpiresAt).getTime() < now) {
        changed = true;
        return { ...s, planType: "gratis" as PlanType, isVip: false };
      }
      return s;
    });
    if (changed) saveStores(next);
    return next;
  }

  async getAll(includeInactive = false): Promise<Store[]> {
    const list = this.applyPlanExpiry(getStoredStores());
    if (includeInactive) return list;
    const current = getStoredCurrentUser();
    return list.filter((s) => (s.isApproved && !s.isSuspended) || (current && s.ownerId === current.id));
  }

  async getById(id: string): Promise<Store | null> {
    const list = this.applyPlanExpiry(getStoredStores());
    return list.find((s) => s.id === id) || null;
  }

  async create(store: Partial<Store>): Promise<Store> {
    const existing = getStoredStores();
    const storeType = store.storeType || "loja_fixa";

    if (storeType === "loja_fixa") {
      if (!store.address?.trim() || !store.bairro?.trim() || !store.facadeImage?.trim()) {
        throw new Error("Loja fixa exige morada, bairro e fotografia da fachada.");
      }
    } else if (storeType === "vendedor_ambulante") {
      if (!store.biPhotoUrl?.trim() || !store.phone?.trim()) {
        throw new Error("Vendedor ambulante exige fotografia do BI e telefone.");
      }
    }

    const code = nextReadableCode("LJ", existing.map((s) => s.code));
    const newStore: Store = {
      id: store.id || `store_${Date.now()}`,
      code,
      ownerId: store.ownerId || "anon",
      name: store.name || "Nova Loja",
      description: store.description || "",
      category: store.category || "Electrónicos",
      storeType,
      province: "Uíge",
      municipality: store.municipality || "Uíge",
      bairro: store.bairro || "",
      address: store.address || "",
      facadeImage: store.facadeImage || "",
      biPhotoUrl: store.biPhotoUrl || "",
      logo: store.logo || store.facadeImage || "",
      isApproved: storeType === "vendedor_ambulante" ? false : Boolean(store.isApproved),
      isSuspended: false,
      isVip: false,
      planType: "gratis",
      reportsCount: 0,
      reviewsCount: 0,
      rating: 0,
      salesCount: 0,
      phone: store.phone || "",
      createdAt: new Date().toISOString(),
    };
    saveStores([...existing, newStore]);
    return newStore;
  }

  async toggleVip(id: string, isVip: boolean): Promise<void> {
    const stores = getStoredStores().map((s) =>
      s.id === id ? { ...s, isVip, planType: (isVip ? "vip" : "gratis") as PlanType } : s
    );
    saveStores(stores);
  }

  async toggleApproval(id: string, isApproved: boolean): Promise<void> {
    await this.updateApproval(id, isApproved ? "aprovado" : "pendente");
  }

  async updateApproval(id: string, status: ApprovalStatus, note?: string): Promise<void> {
    const isApproved = status === "aprovado";
    const cleanNote = note ? note.trim() : null;
    const stores = getStoredStores().map((s) =>
      s.id === id
        ? {
            ...s,
            isApproved,
            approvalStatus: status,
            rejectionReason: status === "rejeitado" ? cleanNote : s.rejectionReason ?? null,
            correctionNote: status === "correcao" ? cleanNote : s.correctionNote ?? null,
          }
        : s
    );
    saveStores(stores);
  }

  async suspendStore(id: string, isSuspended: boolean, reason?: string): Promise<void> {
    const stores = getStoredStores().map((s) =>
      s.id === id ? { ...s, isSuspended, suspensionReason: isSuspended ? reason || "Suspensa pelo administrador" : null } : s
    );
    saveStores(stores);
  }

  async setPlan(id: string, planType: PlanType, durationDays = 30): Promise<void> {
    const expiresAt = planType === "gratis" ? null : new Date(Date.now() + durationDays * 86400000).toISOString();
    const stores = getStoredStores().map((s) =>
      s.id === id
        ? { ...s, planType, isVip: planType === "vip", planExpiresAt: expiresAt }
        : s
    );
    saveStores(stores);
  }
}

// 5B. AVALIAÇÕES POR LOJA
export class OfflineStoreReviewRepo implements IStoreReviewRepo {
  async getByStore(storeId: string): Promise<StoreReview[]> {
    return getStoredStoreReviews()
      .filter((r) => r.storeId === storeId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async create(review: {
    storeId: string;
    userId: string;
    userName?: string;
    stars: number;
    comment: string;
  }): Promise<StoreReview> {
    const existing = getStoredStoreReviews().filter(
      (r) => !(r.storeId === review.storeId && r.userId === review.userId)
    );
    const created: StoreReview = {
      id: `rev_${Date.now()}`,
      storeId: review.storeId,
      userId: review.userId,
      userName: review.userName || "Cliente Uíge",
      stars: Math.min(5, Math.max(1, Math.round(review.stars))),
      comment: review.comment.trim(),
      createdAt: new Date().toISOString(),
    };
    const next = [created, ...existing];
    saveStoreReviews(next);

    const storeReviews = next.filter((r) => r.storeId === review.storeId);
    const avg = storeReviews.reduce((s, r) => s + r.stars, 0) / storeReviews.length;
    saveStores(
      getStoredStores().map((st) =>
        st.id === review.storeId
          ? { ...st, rating: Number(avg.toFixed(1)), reviewsCount: storeReviews.length }
          : st
      )
    );
    return created;
  }
}

// 6. REPOSITÓRIO OFFLINE DE NOTIFICAÇÕES
export class OfflineNotificationRepo implements INotificationRepo {
  async getAll(userId?: string): Promise<NotificationItem[]> {
    const notifs = getStoredNotifications();
    if (!userId) return notifs;
    return notifs.filter((n) => n.userId === userId || n.userId === "all");
  }

  async markAllRead(userId: string): Promise<void> {
    const notifs = getStoredNotifications().map((n) =>
      n.userId === userId || n.userId === "all" ? { ...n, isRead: true } : n
    );
    saveNotifications(notifs);
  }

  async create(notification: Partial<NotificationItem>): Promise<NotificationItem> {
    const item: NotificationItem = {
      id: `notif_${Date.now()}`,
      userId: notification.userId || "all",
      title: notification.title || "Aviso",
      body: notification.body || "",
      type: notification.type || "info",
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    saveNotifications([item, ...getStoredNotifications()]);
    return item;
  }
}

// 7. REPOSITÓRIO OFFLINE DE DENÚNCIAS (Com suspensão automática da loja por excesso)
export class OfflineReportRepo implements IReportRepo {
  async getAll(): Promise<ReportItem[]> {
    return getStoredReports();
  }

  async create(report: Partial<ReportItem>): Promise<ReportItem> {
    const products = getStoredProducts();
    const matchedProd = report.productId ? products.find((p) => p.id === report.productId) : undefined;
    const targetStoreId = report.storeId || matchedProd?.storeId;
    const targetStore = targetStoreId ? getStoredStores().find((s) => s.id === targetStoreId) : undefined;

    const item: ReportItem = {
      id: `rep_${Date.now()}`,
      reporterId: report.reporterId || "anon",
      productId: report.productId,
      productName: report.productName || matchedProd?.name,
      storeId: targetStoreId,
      storeName: report.storeName || targetStore?.name,
      reason: report.reason || "",
      status: "pendente",
      createdAt: new Date().toISOString(),
    };

    const nextReports = [item, ...getStoredReports()];
    saveReports(nextReports);

    if (targetStoreId) {
      const cfg = getStoredSystemConfig();
      const storeReportsCount = nextReports.filter(
        (r) => r.storeId === targetStoreId && r.status !== "rejeitado"
      ).length;
      saveStores(
        getStoredStores().map((st) =>
          st.id === targetStoreId
            ? {
                ...st,
                reportsCount: storeReportsCount,
                isSuspended: storeReportsCount >= cfg.autoSuspendReportsThreshold ? true : st.isSuspended,
                suspensionReason:
                  storeReportsCount >= cfg.autoSuspendReportsThreshold && !st.suspensionReason
                    ? "Suspensão automática por excesso de denúncias"
                    : st.suspensionReason,
              }
            : st
        )
      );
    }

    return item;
  }

  async resolve(id: string, status: "resolvido" | "rejeitado" = "resolvido"): Promise<void> {
    const reps = getStoredReports().map((r) => (r.id === id ? { ...r, status } : r));
    saveReports(reps);
  }
}

// 8. REPOSITÓRIO OFFLINE DE ANÚNCIOS PATROCINADOS
export class OfflineAdRepo implements IAdRepo {
  private normalizeDestination(ad: Partial<SponsoredAd>): {
    destinationType: AdDestinationType;
    destinationValue?: string;
  } {
    const destinationType: AdDestinationType =
      ad.destinationType || (ad.productId ? "produto" : ad.storeId ? "loja" : "loja");

    if (destinationType === "link" || destinationType === "whatsapp") {
      const check = validateSafeAdDestination(destinationType, ad.destinationValue, {
        storeId: ad.storeId,
        productId: ad.productId,
      });
      if (!check.ok) {
        throw new Error(check.error || "Destino de anúncio inválido.");
      }
      return { destinationType, destinationValue: check.normalizedValue };
    }

    if (destinationType === "produto") {
      return { destinationType, destinationValue: ad.productId || ad.destinationValue || "" };
    }

    return { destinationType, destinationValue: ad.storeId || ad.destinationValue || "" };
  }

  async getAll(includeAll = false): Promise<SponsoredAd[]> {
    const now = Date.now();
    const stores = getStoredStores();
    const mappedList = getStoredAds().map((ad) => {
      const store = ad.storeId ? stores.find((s) => s.id === ad.storeId) : undefined;
      const endMs = ad.endDate ? new Date(ad.endDate).getTime() : NaN;
      const expired = ad.active && Boolean(ad.endDate) && Number.isFinite(endMs) && endMs < now;
      const advertiserType: AdAdvertiserType = resolveAdAdvertiserType(ad);
      const isSuspended = Boolean(ad.isSuspended) || ad.status === "suspenso";
      return {
        ...ad,
        advertiserType,
        advertiserName:
          ad.advertiserName ||
          (advertiserType === "plataforma" ? "Mercado Uíge" : store?.name || undefined),
        destinationType:
          ad.destinationType || (ad.productId ? ("produto" as const) : ("loja" as const)),
        mediaType: ad.mediaType || (ad.videoUrl ? ("video" as const) : ("imagem" as const)),
        description: ad.description ?? ad.subtitle ?? "",
        subtitle: ad.subtitle ?? ad.description ?? "",
        ctaText: ad.ctaText || "Ver oferta",
        linkUrl: ad.linkUrl || (ad.destinationType === "link" ? ad.destinationValue : undefined),
        order: Number(ad.order ?? 0),
        priority: Number(ad.priority ?? 0),
        bannerCategory:
          ad.bannerCategory ||
          (advertiserType === "plataforma" ? "publico" : "patrocinado"),
        durationSec:
          ad.durationSec !== undefined && ad.durationSec !== null && Number(ad.durationSec) > 0
            ? clampBannerDurationSec(ad.durationSec)
            : null,
        isPaid: isBannerPaid(ad),
        isSuspended,
        storePlanType: store?.planType ?? ad.storePlanType,
        storePlanExpiresAt: store?.planExpiresAt ?? ad.storePlanExpiresAt,
        storeIsApproved: store?.isApproved ?? ad.storeIsApproved,
        storeIsSuspended: store?.isSuspended ?? ad.storeIsSuspended,
        storeImage: store?.facadeImage || store?.logo || ad.storeImage,
        active: expired || isSuspended ? false : ad.active,
        status: isSuspended ? ("suspenso" as const) : expired ? ("expirado" as const) : ad.status,
        statusReason: ad.statusReason ?? null,
      };
    });
    const sorted = sortBannersForCarousel(mappedList);
    saveAds(sorted);
    if (includeAll) return sorted;
    return sorted.filter(
      (a) =>
        a.active &&
        !a.isSuspended &&
        a.status === "aprovado" &&
        isAdWithinScheduleWindow(a, now) &&
        isAdEligibleForPublicDisplay(a, stores, now)
    );
  }

  async getActiveByPosition(position: AdPosition): Promise<SponsoredAd[]> {
    const active = await this.getAll(false);
    return sortBannersForCarousel(active.filter((a) => a.position === position));
  }

  async create(ad: Partial<SponsoredAd>): Promise<SponsoredAd> {
    const stores = getStoredStores();
    const advertiserType = resolveAdAdvertiserType(ad);
    const targetStore =
      advertiserType === "loja" && ad.storeId
        ? stores.find((s) => s.id === ad.storeId)
        : undefined;

    if (advertiserType === "loja") {
      if ((ad.active || ad.status === "aprovado") && (!targetStore || !storeHasActivePaidPlan(targetStore))) {
        throw new Error("Apenas lojas com plano pago activo podem ter anúncios patrocinados.");
      }
    } else if (advertiserType === "externo") {
      if (!(ad.advertiserName || "").trim()) {
        throw new Error("Indica o nome do anunciante externo.");
      }
    }

    const { destinationType, destinationValue } = this.normalizeDestination({
      ...ad,
      destinationValue: ad.destinationValue || ad.linkUrl,
    });

    const mediaType: "imagem" | "video" =
      ad.mediaType === "video" || (Boolean(ad.videoUrl) && ad.mediaType !== "imagem")
        ? "video"
        : "imagem";

    const bannerCategory =
      ad.bannerCategory || (advertiserType === "plataforma" ? "publico" : "patrocinado");
    const isPaid =
      typeof ad.isPaid === "boolean"
        ? ad.isPaid
        : advertiserType !== "plataforma" || bannerCategory === "patrocinado";
    const isSuspended = Boolean(ad.isSuspended) || ad.status === "suspenso";
    const description = (ad.description ?? ad.subtitle ?? "").trim();

    const startDate = ad.startDate !== undefined ? ad.startDate : null;
    const endDate = ad.endDate !== undefined ? ad.endDate : null;
    if (startDate && endDate && new Date(endDate).getTime() < new Date(startDate).getTime()) {
      throw new Error("A data de fim do anúncio deve ser igual ou posterior à data de início.");
    }

    const finalStatus: SponsoredAd["status"] = isSuspended
      ? "suspenso"
      : ad.status || "pendente";
    const finalActive =
      isSuspended ||
      finalStatus === "rascunho" ||
      finalStatus === "rejeitado" ||
      finalStatus === "expirado"
        ? false
        : Boolean(ad.active);

    const item: SponsoredAd = {
      id: `ad_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      advertiserType,
      advertiserName:
        advertiserType === "plataforma"
          ? ad.advertiserName?.trim() || "Mercado Uíge"
          : advertiserType === "externo"
          ? ad.advertiserName?.trim()
          : ad.storeName || targetStore?.name,
      storeId: advertiserType === "loja" ? ad.storeId : undefined,
      sellerId: ad.sellerId || targetStore?.ownerId || "admin",
      productId: destinationType === "produto" ? ad.productId || destinationValue : ad.productId,
      storeName: advertiserType === "loja" ? ad.storeName || targetStore?.name : undefined,
      storePlanType: advertiserType === "loja" ? targetStore?.planType ?? ad.storePlanType : undefined,
      storePlanExpiresAt:
        advertiserType === "loja" ? targetStore?.planExpiresAt ?? ad.storePlanExpiresAt : null,
      storeIsApproved:
        advertiserType === "loja" ? targetStore?.isApproved ?? ad.storeIsApproved : undefined,
      storeIsSuspended:
        advertiserType === "loja" ? targetStore?.isSuspended ?? ad.storeIsSuspended : undefined,
      storeImage:
        advertiserType === "loja" ? targetStore?.facadeImage || targetStore?.logo || ad.storeImage : undefined,
      productName: ad.productName,
      destinationType,
      destinationValue,
      linkUrl: destinationType === "link" ? destinationValue : ad.linkUrl?.trim() || undefined,
      paymentAmountKz: ad.paymentAmountKz,
      paymentProofUrl: ad.paymentProofUrl,
      title: ad.title || "Campanha Patrocinada",
      subtitle: description,
      description,
      ctaText: ad.ctaText?.trim() || "Ver oferta",
      order: Number(ad.order ?? 0),
      bannerCategory,
      priority: Number(ad.priority ?? 0),
      durationSec:
        ad.durationSec !== undefined && ad.durationSec !== null && Number(ad.durationSec) > 0
          ? clampBannerDurationSec(ad.durationSec)
          : null,
      isPaid,
      isSuspended,
      imageUrl:
        ad.imageUrl ||
        (advertiserType === "loja" ? targetStore?.facadeImage || targetStore?.logo || "" : ""),
      videoUrl: ad.videoUrl || null,
      mediaType,
      position: ad.position || "topo",
      startDate,
      endDate,
      views: 0,
      clicks: 0,
      active: finalActive,
      status: finalStatus,
      statusReason: ad.statusReason ?? null,
      createdAt: new Date().toISOString(),
    };
    saveAds([item, ...getStoredAds()]);
    return item;
  }

  async update(id: string, updates: Partial<SponsoredAd>): Promise<SponsoredAd> {
    const ads = getStoredAds();
    const existing = ads.find((a) => a.id === id);
    if (!existing) {
      throw new Error("Anúncio não encontrado.");
    }

    const merged: SponsoredAd = { ...existing, ...updates };
    if (
      merged.startDate &&
      merged.endDate &&
      new Date(merged.endDate).getTime() < new Date(merged.startDate).getTime()
    ) {
      throw new Error("A data de fim do anúncio deve ser igual ou posterior à data de início.");
    }
    const stores = getStoredStores();
    const advertiserType = resolveAdAdvertiserType(merged);
    const targetStore =
      advertiserType === "loja" && merged.storeId
        ? stores.find((s) => s.id === merged.storeId)
        : undefined;

    if (advertiserType === "loja") {
      if ((merged.active || merged.status === "aprovado") && (!targetStore || !storeHasActivePaidPlan(targetStore))) {
        throw new Error("Apenas lojas com plano pago activo podem ter anúncios patrocinados.");
      }
    } else if (advertiserType === "externo" && !(merged.advertiserName || "").trim()) {
      throw new Error("Indica o nome do anunciante externo.");
    }

    const { destinationType, destinationValue } = this.normalizeDestination({
      ...merged,
      destinationValue:
        updates.destinationValue ??
        updates.linkUrl ??
        merged.destinationValue ??
        merged.linkUrl,
    });

    const mediaType: "imagem" | "video" =
      merged.mediaType === "video" || (Boolean(merged.videoUrl) && merged.mediaType !== "imagem")
        ? "video"
        : "imagem";

    const isSuspended =
      updates.isSuspended !== undefined
        ? Boolean(updates.isSuspended)
        : updates.status === "suspenso"
        ? true
        : updates.status === "aprovado"
        ? false
        : Boolean(merged.isSuspended);
    const description = (updates.description ?? updates.subtitle ?? merged.description ?? merged.subtitle ?? "").trim();

    const finalStatus: SponsoredAd["status"] = isSuspended ? "suspenso" : merged.status;
    const finalActive =
      isSuspended ||
      finalStatus === "rascunho" ||
      finalStatus === "rejeitado" ||
      finalStatus === "expirado"
        ? false
        : Boolean(merged.active);

    const updated: SponsoredAd = {
      ...merged,
      advertiserType,
      advertiserName:
        advertiserType === "plataforma"
          ? merged.advertiserName?.trim() || "Mercado Uíge"
          : advertiserType === "externo"
          ? merged.advertiserName?.trim()
          : targetStore?.name || merged.storeName,
      storeId: advertiserType === "loja" ? merged.storeId : undefined,
      storeName: advertiserType === "loja" ? targetStore?.name || merged.storeName : undefined,
      destinationType,
      destinationValue,
      linkUrl: destinationType === "link" ? destinationValue : merged.linkUrl,
      subtitle: description,
      description,
      ctaText: merged.ctaText?.trim() || "Ver oferta",
      order: Number(merged.order ?? 0),
      priority: Number(merged.priority ?? 0),
      bannerCategory:
        merged.bannerCategory || (advertiserType === "plataforma" ? "publico" : "patrocinado"),
      durationSec:
        merged.durationSec !== undefined && merged.durationSec !== null && Number(merged.durationSec) > 0
          ? clampBannerDurationSec(merged.durationSec)
          : null,
      isPaid: isBannerPaid(merged),
      isSuspended,
      active: finalActive,
      status: finalStatus,
      statusReason: updates.statusReason !== undefined ? updates.statusReason : existing.statusReason ?? null,
      mediaType,
    };

    saveAds(ads.map((a) => (a.id === id ? updated : a)));
    return updated;
  }

  async updateStatus(
    id: string,
    status: SponsoredAd["status"],
    active: boolean,
    reason?: string | null
  ): Promise<void> {
    const isSuspended = status === "suspenso";
    const effectiveActive =
      status === "suspenso" || status === "rejeitado" || status === "rascunho" || status === "expirado"
        ? false
        : active;

    if (effectiveActive && status === "aprovado") {
      const ads = getStoredAds();
      const target = ads.find((a) => a.id === id);
      if (target) {
        const stores = getStoredStores();
        const advType = resolveAdAdvertiserType(target);
        if (advType === "loja") {
          const st = target.storeId ? stores.find((s) => s.id === target.storeId) : undefined;
          if (!st || !storeHasActivePaidPlan(st)) {
            throw new Error("Apenas lojas com plano pago activo podem activar anúncios patrocinados.");
          }
        }
      }
    }
    saveAds(
      getStoredAds().map((a) =>
        a.id === id
          ? {
              ...a,
              status,
              isSuspended,
              active: effectiveActive,
              statusReason: reason !== undefined ? reason : a.statusReason ?? null,
            }
          : a
      )
    );
  }

  async trackView(id: string): Promise<void> {
    saveAds(getStoredAds().map((a) => (a.id === id ? { ...a, views: (a.views || 0) + 1 } : a)));
  }

  async trackClick(id: string): Promise<void> {
    saveAds(getStoredAds().map((a) => (a.id === id ? { ...a, clicks: (a.clicks || 0) + 1 } : a)));
  }

  async delete(id: string): Promise<void> {
    saveAds(getStoredAds().filter((a) => a.id !== id));
  }
}

// 9. REPOSITÓRIO OFFLINE DE PAGAMENTOS DE PLANOS E ANÚNCIOS
export class OfflinePaymentRepo implements IPaymentRepo {
  async getAll(sellerId?: string): Promise<MerchantPayment[]> {
    const list = getStoredMerchantPayments();
    if (!sellerId) return list;
    return list.filter((p) => p.sellerId === sellerId);
  }

  async create(payment: Partial<MerchantPayment>): Promise<MerchantPayment> {
    const item: MerchantPayment = {
      id: `pay_${Date.now()}`,
      sellerId: payment.sellerId || "anon",
      sellerName: payment.sellerName,
      advertiserName: payment.advertiserName,
      storeId: payment.storeId,
      storeName: payment.storeName,
      userRoleType: payment.userRoleType,
      type: payment.type || "plano",
      targetPlan: payment.targetPlan,
      adId: payment.adId,
      amountKz: Number(payment.amountKz || 0),
      method: payment.method || "Multicaixa Express",
      reference: payment.reference || "",
      proofUrl: payment.proofUrl || "",
      status: payment.status || "pendente",
      createdAt: new Date().toISOString(),
      confirmedAt: payment.status === "confirmado" ? new Date().toISOString() : null,
    };
    saveMerchantPayments([item, ...getStoredMerchantPayments()]);
    return item;
  }

  async review(id: string, status: "confirmado" | "rejeitado"): Promise<void> {
    const payments = getStoredMerchantPayments();
    const target = payments.find((p) => p.id === id);
    const updated = payments.map((p) =>
      p.id === id ? { ...p, status, confirmedAt: status === "confirmado" ? new Date().toISOString() : null } : p
    );
    saveMerchantPayments(updated);

    if (target && status === "confirmado") {
      if (target.type === "plano" && target.targetPlan) {
        if (target.storeId) {
          const storeRepo = new OfflineStoreRepo();
          await storeRepo.setPlan(target.storeId, target.targetPlan, 30);
        }
        if (target.userRoleType === "entregador" || !target.storeId) {
          const userRepo = new OfflineUserRepo();
          await userRepo.setPlan(target.sellerId, target.targetPlan, 30);
        }
      } else if ((target.type === "anuncio" || target.type === "anuncio_externo") && target.adId) {
        const adRepo = new OfflineAdRepo();
        await adRepo.updateStatus(target.adId, "aprovado", true);
      }
    }
  }
}

// 10. REPOSITÓRIO OFFLINE DE ENTREGAS E ENTREGADORES
export class OfflineDeliveryRepo implements IDeliveryRepo {
  async getAll(filters?: { customerId?: string; courierId?: string; onlyAvailable?: boolean }): Promise<DeliveryRecord[]> {
    const list = getStoredDeliveries();
    return list.filter((d) => {
      if (filters?.customerId && d.customerId !== filters.customerId) return false;
      if (filters?.courierId && d.courierId !== filters.courierId) return false;
      if (filters?.onlyAvailable && (d.status !== "Pedido" || d.courierId)) return false;
      return true;
    });
  }

  async create(delivery: {
    orderId: string;
    orderCode?: string;
    storeId?: string;
    storeName?: string;
    customerId: string;
    customerName?: string;
    customerPhone?: string;
    pickupAddress?: string;
    deliveryAddress: string;
    deliveryFee: number;
    commissionPercent: number;
  }): Promise<DeliveryRecord> {
    const rec: DeliveryRecord = {
      id: `del_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      orderId: delivery.orderId,
      orderCode: delivery.orderCode,
      storeId: delivery.storeId,
      storeName: delivery.storeName,
      customerId: delivery.customerId,
      customerName: delivery.customerName,
      customerPhone: delivery.customerPhone,
      courierId: null,
      status: "Pedido",
      confirmationCode: generateDeliveryCode(),
      deliveryFee: Number(delivery.deliveryFee || 0),
      commissionPercent: Number(delivery.commissionPercent || 15),
      commissionAmount: 0,
      courierEarning: 0,
      commissionCharged: false,
      pickupAddress: delivery.pickupAddress || "Centro do Uíge",
      deliveryAddress: delivery.deliveryAddress,
      hasDelay: false,
      createdAt: new Date().toISOString(),
    };
    saveDeliveries([rec, ...getStoredDeliveries()]);
    return rec;
  }

  async accept(deliveryId: string, courierId: string, courierName?: string): Promise<DeliveryRecord> {
    const list = getStoredDeliveries();
    const target = list.find((d) => d.id === deliveryId);
    if (!target) throw new Error("Entrega não encontrada.");
    const updated: DeliveryRecord = {
      ...target,
      courierId,
      courierName: courierName || "Entregador Uíge",
      status: "Aceite pelo entregador",
      acceptedAt: new Date().toISOString(),
    };
    saveDeliveries(list.map((d) => (d.id === deliveryId ? updated : d)));
    return updated;
  }

  async updateStatus(deliveryId: string, status: DeliveryStatus): Promise<void> {
    const now = new Date().toISOString();
    const list = getStoredDeliveries().map((d) => {
      if (d.id !== deliveryId) return d;
      return {
        ...d,
        status,
        pickedUpAt: status === "Recolhido" ? now : d.pickedUpAt,
        deliveredAt: status === "Entregue" ? now : d.deliveredAt,
      };
    });
    saveDeliveries(list);
    const updated = list.find((d) => d.id === deliveryId);
    if (updated && (status === "A caminho" || status === "Recolhido")) {
      saveOrders(
        getStoredOrders().map((o) => (o.id === updated.orderId ? { ...o, status: "Em entrega" } : o))
      );
    }
  }

  async confirmWithCode(deliveryId: string, code: string): Promise<{ ok: boolean; message: string }> {
    const list = getStoredDeliveries();
    const target = list.find((d) => d.id === deliveryId);
    if (!target) return { ok: false, message: "Entrega não encontrada." };
    if (target.confirmationCode.trim() !== code.trim()) {
      return { ok: false, message: "Código de entrega incorreto. Confirma com o cliente." };
    }

    const commissionAmount = Math.round(target.deliveryFee * (target.commissionPercent / 100));
    const courierEarning = Math.max(0, target.deliveryFee - commissionAmount);
    const now = new Date().toISOString();

    const updated: DeliveryRecord = {
      ...target,
      status: "Entregue",
      commissionAmount,
      courierEarning,
      commissionCharged: true,
      deliveredAt: now,
    };
    saveDeliveries(list.map((d) => (d.id === deliveryId ? updated : d)));
    saveOrders(
      getStoredOrders().map((o) => (o.id === target.orderId ? { ...o, status: "Entregue" } : o))
    );
    return { ok: true, message: "Entrega confirmada com sucesso!" };
  }

  async reportIssue(deliveryId: string, description: string, hasDelay = true): Promise<void> {
    saveDeliveries(
      getStoredDeliveries().map((d) =>
        d.id === deliveryId
          ? {
              ...d,
              hasDelay,
              issueDescription: description.trim() || "Atraso reportado",
              status: d.status === "Entregue" ? "Entregue" : "Com problema",
            }
          : d
      )
    );
  }

  async getMonthlyFees(courierId?: string): Promise<CourierMonthlyFee[]> {
    const fees = getStoredCourierFees();
    return courierId ? fees.filter((f) => f.courierId === courierId) : fees;
  }

  async submitMonthlyFee(fee: Partial<CourierMonthlyFee>): Promise<CourierMonthlyFee> {
    const item: CourierMonthlyFee = {
      id: `fee_${Date.now()}`,
      courierId: fee.courierId || "anon",
      courierName: fee.courierName || "Entregador",
      referenceMonth: fee.referenceMonth || new Date().toISOString().slice(0, 7),
      amountKz: Number(fee.amountKz || getStoredSystemConfig().courierMonthlyFee),
      proofUrl: fee.proofUrl || "",
      status: "pendente",
      createdAt: new Date().toISOString(),
    };
    saveCourierFees([item, ...getStoredCourierFees()]);
    return item;
  }

  async updateMonthlyFeeStatus(id: string, status: CourierMonthlyFee["status"]): Promise<void> {
    saveCourierFees(
      getStoredCourierFees().map((f) =>
        f.id === id ? { ...f, status, paidAt: status === "pago" ? new Date().toISOString() : f.paidAt } : f
      )
    );
  }
}

// 11. CONFIGURAÇÕES GLOBAIS DO SISTEMA
export class OfflineSystemConfigRepo implements ISystemConfigRepo {
  async get(): Promise<SystemConfig> {
    return getStoredSystemConfig();
  }

  async update(updates: Partial<SystemConfig>): Promise<SystemConfig> {
    const current = getStoredSystemConfig();
    const next: SystemConfig = {
      ...current,
      ...updates,
      bannerDefaultDurationSec:
        updates.bannerDefaultDurationSec !== undefined
          ? clampBannerDurationSec(updates.bannerDefaultDurationSec, current.bannerDefaultDurationSec)
          : clampBannerDurationSec(current.bannerDefaultDurationSec),
      bannerAutoplay:
        updates.bannerAutoplay !== undefined
          ? Boolean(updates.bannerAutoplay)
          : current.bannerAutoplay ?? true,
    };
    saveSystemConfig(next);
    return next;
  }
}

// 12. REPOSITÓRIO OFFLINE DE AUDITORIA
export class OfflineAuditRepo implements IAuditRepo {
  async getAll(): Promise<AuditLogItem[]> {
    return getStoredAuditLogs();
  }

  async log(adminId: string, action: string, target?: string, details?: any): Promise<void> {
    const item: AuditLogItem = {
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      adminId,
      adminEmail: adminId,
      action,
      targetType: "recurso",
      targetId: target || "",
      details,
      createdAt: new Date().toISOString(),
    };
    saveAuditLogs([item, ...getStoredAuditLogs()].slice(0, 200));
  }
}

// 13. REPOSITÓRIO OFFLINE DE EVENTOS SOC
export class OfflineSystemEventRepo implements ISystemEventRepo {
  async getAll(): Promise<SystemEvent[]> {
    return getStoredSystemEvents();
  }

  async record(event: {
    type: string;
    severity?: SystemEventSeverity;
    userEmail?: string | null;
    detail: string;
  }): Promise<void> {
    const safeType = sanitizeTelemetryText(event.type || "EVENTO_SISTEMA", 60) || "EVENTO_SISTEMA";
    if (!allowTelemetryWrite(`soc:${safeType}`, 15)) return;

    const current = getStoredCurrentUser();
    const item: SystemEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: safeType,
      severity: event.severity || "info",
      userId: current?.id || null,
      userEmail: event.userEmail ? sanitizeTelemetryText(event.userEmail, 120) : current?.email || null,
      detail: sanitizeTelemetryText(event.detail, 260) || "Evento registado",
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    saveSystemEvents([item, ...getStoredSystemEvents()].slice(0, 200));
  }

  async resolve(id: string, resolved = true): Promise<void> {
    saveSystemEvents(getStoredSystemEvents().map((e) => (e.id === id ? { ...e, resolved } : e)));
  }
}

// 14. REPOSITÓRIO OFFLINE DE OBSERVABILIDADE (ERROS AGRUPADOS POR ECRÃ)
export class OfflineAppErrorRepo implements IAppErrorRepo {
  async getAll(): Promise<AppErrorRecord[]> {
    return getStoredAppErrors().sort(
      (a, b) => new Date(b.lastOccurredAt).getTime() - new Date(a.lastOccurredAt).getTime()
    );
  }

  async report(error: {
    screen: string;
    message: string;
    source?: string;
    durationMs?: number;
  }): Promise<void> {
    const screen = sanitizeTelemetryText(error.screen || "geral", 60) || "geral";
    if (!allowTelemetryWrite(`err:${screen}`, 20)) return;

    const message = sanitizeTelemetryText(error.message || "Erro operacional", 160) || "Erro operacional";
    const source = sanitizeTelemetryText(error.source || "runtime", 40) || "runtime";
    const now = new Date().toISOString();

    const list = getStoredAppErrors();
    const existing = list.find((e) => e.screen === screen && e.message === message && e.source === source);
    if (existing) {
      const updated = list.map((e) =>
        e.id === existing.id
          ? {
              ...e,
              count: e.count + 1,
              durationMs: error.durationMs ?? e.durationMs ?? null,
              lastOccurredAt: now,
            }
          : e
      );
      saveAppErrors(updated);
      return;
    }

    const item: AppErrorRecord = {
      id: `app_err_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      screen,
      message,
      source,
      count: 1,
      durationMs: error.durationMs ?? null,
      lastOccurredAt: now,
      createdAt: now,
    };
    saveAppErrors([item, ...list].slice(0, 100));
  }

  async clearAll(): Promise<void> {
    saveAppErrors([]);
  }
}

// 15. REPOSITÓRIO OFFLINE DE MÉTRICAS NOC / ITOM
export class OfflineSystemHealthRepo implements ISystemHealthRepo {
  async getMetrics(): Promise<SystemHealthMetrics> {
    const users = getStoredUsers();
    const stores = getStoredStores();
    const products = getStoredProducts();
    const orders = getStoredOrders();
    const payments = getStoredMerchantPayments();
    const events = getStoredSystemEvents();
    const errors = getStoredAppErrors();

    const approxDbBytes =
      (users.length * 600 + stores.length * 1200 + products.length * 1500 + orders.length * 1400) || 16384;
    const imageCount =
      products.length +
      stores.filter((s) => Boolean(s.facadeImage || s.biPhotoUrl)).length +
      payments.filter((p) => Boolean(p.proofUrl)).length;

    return {
      dbBytes: approxDbBytes,
      storageBytes: imageCount * 95_000,
      storageFiles: imageCount,
      totalUsers: users.length,
      storesCount: stores.length,
      productsCount: products.length,
      ordersCount: orders.length,
      pendingPayments: payments.filter((p) => p.status === "pendente").length,
      openSecurityAlerts: events.filter((e) => !e.resolved && (e.severity === "alta" || e.severity === "critica")).length,
      errorGroups: errors.length,
      collectedAt: new Date().toISOString(),
    };
  }

  async runNocChecks(): Promise<NocServiceCheck[]> {
    const now = new Date().toISOString();
    return [
      { id: "database", label: "Base de Dados", status: "operacional", latencyMs: 12, detail: "Armazenamento local activo", checkedAt: now },
      { id: "auth", label: "Login e OTP", status: "operacional", latencyMs: 18, detail: "Sessão local pronta", checkedAt: now },
      { id: "storage", label: "Storage de Fotos", status: "operacional", latencyMs: 15, detail: "Modo local sem ligação remota", checkedAt: now },
      { id: "site", label: "Portal Web", status: "operacional", latencyMs: 8, detail: "Interface administrativa activa", checkedAt: now },
    ];
  }
}
