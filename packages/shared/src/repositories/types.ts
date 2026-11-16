import {
  Product,
  Store,
  User,
  Order,
  NotificationItem,
  ReportItem,
  AuditLogItem,
  MessageItem,
  StoreReview,
  SponsoredAd,
  MerchantPayment,
  DeliveryRecord,
  DeliveryStatus,
  CourierMonthlyFee,
  SystemConfig,
  StoreType,
  PlanType,
  AdPosition,
  ApprovalStatus,
  UserRole,
  SystemEvent,
  SystemEventSeverity,
  AppErrorRecord,
  SystemHealthMetrics,
  NocServiceCheck,
} from "../types";
import { SearchPersonalization } from "../lib/utils";

export interface ProductFilters {
  query?: string;
  category?: string;
  municipality?: string;
  condition?: "todas" | "novo" | "usado";
  storeType?: "todos" | StoreType;
  maxPrice?: number;
  availableOnly?: boolean;
  sort?: string;
  personalization?: SearchPersonalization;
}

export interface IProductRepo {
  getAll(filters?: ProductFilters): Promise<Product[]>;
  getById(id: string): Promise<Product | null>;
  create(product: Partial<Product>): Promise<Product>;
  updateStock(id: string, newStock: number): Promise<void>;
  delete(id: string): Promise<void>;
  approve(id: string, isApproved: boolean): Promise<void>;
}

export interface IOrderRepo {
  getAll(userId?: string, storeId?: string): Promise<Order[]>;
  getById(id: string): Promise<Order | null>;
  create(orderData: {
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
  }): Promise<Order>;
  updateStatus(id: string, status: Order["status"]): Promise<void>;
  markPaid(id: string): Promise<void>;
}

export interface IMessageRepo {
  getAll(userId: string): Promise<MessageItem[]>;
  send(messageData: {
    senderId: string;
    receiverId: string;
    productId?: string;
    content: string;
    clientMutationId?: string;
  }): Promise<MessageItem>;
}

export interface IUserRepo {
  getCurrentUser(): Promise<User | null>;
  getAll(): Promise<User[]>;
  updateProfile(id: string, updates: Partial<User>): Promise<User>;
  approveUser(id: string, isApproved: boolean): Promise<void>;
  updateApproval(id: string, status: ApprovalStatus, note?: string): Promise<void>;
  suspendUser(id: string, isSuspended: boolean): Promise<void>;
  setRole(id: string, role: UserRole): Promise<void>;
  requestMerchantUpgrade(id: string, data?: { phone?: string; municipality?: string; bairro?: string }): Promise<User>;
  setPlan(id: string, planType: PlanType, durationDays?: number): Promise<void>;
  deleteAccount(id: string): Promise<void>;
}

export interface IStoreRepo {
  getAll(includeInactive?: boolean): Promise<Store[]>;
  getById(id: string): Promise<Store | null>;
  create(store: Partial<Store>): Promise<Store>;
  toggleVip(id: string, isVip: boolean): Promise<void>;
  toggleApproval(id: string, isApproved: boolean): Promise<void>;
  updateApproval(id: string, status: ApprovalStatus, note?: string): Promise<void>;
  suspendStore(id: string, isSuspended: boolean, reason?: string): Promise<void>;
  setPlan(id: string, planType: PlanType, durationDays?: number): Promise<void>;
}

export interface IStoreReviewRepo {
  getByStore(storeId: string): Promise<StoreReview[]>;
  create(review: { storeId: string; userId: string; userName?: string; stars: number; comment: string }): Promise<StoreReview>;
}

export interface INotificationRepo {
  getAll(userId?: string): Promise<NotificationItem[]>;
  markAllRead(userId: string): Promise<void>;
  create(notification: Partial<NotificationItem>): Promise<NotificationItem>;
}

export interface IReportRepo {
  getAll(): Promise<ReportItem[]>;
  create(report: Partial<ReportItem>): Promise<ReportItem>;
  resolve(id: string, status?: "resolvido" | "rejeitado"): Promise<void>;
}

export interface IAdRepo {
  getAll(includeAll?: boolean): Promise<SponsoredAd[]>;
  getActiveByPosition(position: AdPosition): Promise<SponsoredAd[]>;
  create(ad: Partial<SponsoredAd>): Promise<SponsoredAd>;
  update(id: string, updates: Partial<SponsoredAd>): Promise<SponsoredAd>;
  updateStatus(id: string, status: SponsoredAd["status"], active: boolean): Promise<void>;
  trackView(id: string): Promise<void>;
  trackClick(id: string): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface IPaymentRepo {
  getAll(sellerId?: string): Promise<MerchantPayment[]>;
  create(payment: Partial<MerchantPayment>): Promise<MerchantPayment>;
  review(id: string, status: "confirmado" | "rejeitado"): Promise<void>;
}

export interface IDeliveryRepo {
  getAll(filters?: { customerId?: string; courierId?: string; onlyAvailable?: boolean }): Promise<DeliveryRecord[]>;
  create(delivery: {
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
  }): Promise<DeliveryRecord>;
  accept(deliveryId: string, courierId: string, courierName?: string): Promise<DeliveryRecord>;
  updateStatus(deliveryId: string, status: DeliveryStatus): Promise<void>;
  confirmWithCode(deliveryId: string, code: string): Promise<{ ok: boolean; message: string }>;
  reportIssue(deliveryId: string, description: string, hasDelay?: boolean): Promise<void>;
  getMonthlyFees(courierId?: string): Promise<CourierMonthlyFee[]>;
  submitMonthlyFee(fee: Partial<CourierMonthlyFee>): Promise<CourierMonthlyFee>;
  updateMonthlyFeeStatus(id: string, status: CourierMonthlyFee["status"]): Promise<void>;
}

export interface ISystemConfigRepo {
  get(): Promise<SystemConfig>;
  update(updates: Partial<SystemConfig>): Promise<SystemConfig>;
}

export interface IAuditRepo {
  getAll(): Promise<AuditLogItem[]>;
  log(adminId: string, action: string, target?: string, details?: any): Promise<void>;
}

export interface ISystemEventRepo {
  getAll(): Promise<SystemEvent[]>;
  record(event: {
    type: string;
    severity?: SystemEventSeverity;
    userEmail?: string | null;
    detail: string;
  }): Promise<void>;
  resolve(id: string, resolved?: boolean): Promise<void>;
}

export interface IAppErrorRepo {
  getAll(): Promise<AppErrorRecord[]>;
  report(error: {
    screen: string;
    message: string;
    source?: string;
    durationMs?: number;
  }): Promise<void>;
  clearAll(): Promise<void>;
}

export interface ISystemHealthRepo {
  getMetrics(): Promise<SystemHealthMetrics>;
  runNocChecks(): Promise<NocServiceCheck[]>;
}
