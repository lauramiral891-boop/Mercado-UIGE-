export type UserRole =
  | "cliente"
  | "comerciante"
  | "entregador"
  | "admin"
  | "super_admin"
  | "moderador"
  | "financeiro";

export type ApprovalStatus = "pendente" | "aprovado" | "rejeitado" | "correcao";

export type StoreType = "loja_fixa" | "vendedor_ambulante";

export type PlanType = "gratis" | "basico" | "vip";

export type AdPosition = "topo" | "categoria" | "pesquisa";

export type DeliveryStatus =
  | "Pedido"
  | "Aceite pelo entregador"
  | "Recolhido"
  | "A caminho"
  | "Entregue"
  | "Com problema";

export interface User {
  id: string;
  code?: string;
  name: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  avatar?: string | null;
  province?: string;
  municipality?: string;
  bairro?: string | null;
  biNumber?: string | null;
  biPhotoUrl?: string | null;
  residesInUigeConfirmed?: boolean;
  isApproved?: boolean;
  approvalStatus?: ApprovalStatus;
  rejectionReason?: string | null;
  correctionNote?: string | null;
  walletBalance: number;
  isSuspended?: boolean;
  isVerified?: boolean;
  welcomeSentAt?: string | null;
  planType?: PlanType;
  planExpiresAt?: string | null;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  count?: number;
}

export interface Store {
  id: string;
  code?: string;
  ownerId: string;
  name: string;
  description: string;
  category: string;
  storeType: StoreType;
  province: string;
  municipality: string;
  bairro?: string;
  address?: string;
  facadeImage?: string;
  biPhotoUrl?: string;
  logo: string;
  cover?: string;
  isApproved: boolean;
  approvalStatus?: ApprovalStatus;
  rejectionReason?: string | null;
  correctionNote?: string | null;
  isSuspended?: boolean;
  suspensionReason?: string | null;
  isVip: boolean;
  planType?: PlanType;
  planExpiresAt?: string | null;
  reportsCount?: number;
  reviewsCount?: number;
  rating: number;
  salesCount: number;
  createdAt: string;
  phone?: string;
  verified?: boolean;
}

export interface Product {
  id: string;
  storeId?: string;
  sellerId?: string;
  name: string;
  description: string;
  price: number;
  oldPrice?: number | null;
  discount: number;
  stock: number;
  categoryId?: string;
  categoryName: string;
  brand?: string;
  condition: "novo" | "usado";
  image: string;
  images?: string[];
  videoUrl?: string | null;
  mediaType?: "imagem" | "video";
  province: string;
  municipality: string;
  bairro?: string;
  isApproved: boolean;
  isFeatured?: boolean;
  isSponsored?: boolean;
  sales: number;
  rating: number;
  reviewsCount: number;
  variants?: string[];
  storeName?: string;
  storeCode?: string;
  storeType?: StoreType;
  storeRating?: number;
  storeVip?: boolean;
  createdAt: string;
}

export interface CartItem {
  productId: string;
  qty: number;
  selectedVariant?: string;
  product?: Product;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  productImage?: string;
  qty: number;
  price: number;
  selectedVariant?: string;
}

export interface Order {
  id: string;
  code: string;
  userId: string;
  userName?: string;
  userPhone?: string;
  storeId?: string;
  storeName?: string;
  storePhone?: string | null;
  status:
    | "Pendente"
    | "Confirmada"
    | "Em preparação"
    | "Pronta para levantamento"
    | "Em entrega"
    | "Entregue"
    | "Cancelada";
  paymentStatus?: "pendente" | "pago";
  paidAt?: string | null;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  deliveryType?: "entrega" | "levantamento";
  address: string;
  paymentMethod: string;
  createdAt: string;
  estimatedDelivery?: string;
  clientMutationId?: string;
}

export interface MessageItem {
  id: string;
  senderId: string;
  receiverId: string;
  productId?: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  clientMutationId?: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: "info" | "order" | "promo" | "security" | "system" | "welcome";
  isRead: boolean;
  createdAt: string;
  link?: string;
}

export interface ReportItem {
  id: string;
  reporterId: string;
  reporterName?: string;
  productId?: string;
  productName?: string;
  storeId?: string;
  storeName?: string;
  reason: string;
  status: "pendente" | "resolvido" | "rejeitado";
  createdAt: string;
}

export interface StoreReview {
  id: string;
  storeId: string;
  userId: string;
  userName?: string;
  stars: number;
  comment: string;
  createdAt: string;
}

export interface SponsoredAd {
  id: string;
  storeId?: string;
  sellerId: string;
  productId?: string;
  storeName?: string;
  storePlanType?: PlanType;
  storePlanExpiresAt?: string | null;
  storeIsApproved?: boolean;
  storeIsSuspended?: boolean;
  storeImage?: string;
  productName?: string;
  title: string;
  subtitle?: string;
  imageUrl: string;
  videoUrl?: string | null;
  mediaType?: "imagem" | "video";
  position: AdPosition;
  startDate: string;
  endDate: string;
  views: number;
  clicks: number;
  active: boolean;
  status: "pendente" | "aprovado" | "rejeitado" | "expirado";
  createdAt: string;
}

export interface MerchantPayment {
  id: string;
  sellerId: string;
  sellerName?: string;
  storeId?: string;
  storeName?: string;
  userRoleType?: "loja_fixa" | "vendedor_ambulante" | "entregador";
  type: "plano" | "anuncio";
  targetPlan?: PlanType;
  adId?: string;
  amountKz: number;
  method: "Multicaixa Express" | "Referência" | "Transferência";
  reference?: string;
  proofUrl: string;
  status: "pendente" | "confirmado" | "rejeitado";
  createdAt: string;
  confirmedAt?: string | null;
}

export interface DeliveryRecord {
  id: string;
  orderId: string;
  orderCode?: string;
  storeId?: string;
  storeName?: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  courierId?: string | null;
  courierName?: string;
  status: DeliveryStatus;
  confirmationCode: string;
  deliveryFee: number;
  commissionPercent: number;
  commissionAmount: number;
  courierEarning: number;
  commissionCharged: boolean;
  pickupAddress?: string;
  deliveryAddress: string;
  hasDelay: boolean;
  issueDescription?: string | null;
  acceptedAt?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
}

export interface CourierMonthlyFee {
  id: string;
  courierId: string;
  courierName?: string;
  referenceMonth: string;
  amountKz: number;
  proofUrl?: string;
  status: "pendente" | "pago" | "atrasado";
  createdAt: string;
  paidAt?: string | null;
}

export interface SystemConfig {
  autoSuspendReportsThreshold: number;
  defaultDeliveryFee: number;
  deliveryCommissionPercent: number;
  courierMonthlyFee: number;
  adminWhatsapp: string;
  basicPlanPrice: number;
  vipPlanPrice: number;
  fixedStoreBasicPrice: number;
  fixedStoreVipPrice: number;
  ambulantBasicPrice: number;
  ambulantVipPrice: number;
  courierBasicPrice: number;
  courierVipPrice: number;
  requireProductApproval?: boolean;
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
}

export interface AuditLogItem {
  id: string;
  adminId: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  details?: any;
  createdAt: string;
}

export type SystemEventSeverity = "info" | "aviso" | "alta" | "critica";

export interface SystemEvent {
  id: string;
  type: string;
  severity: SystemEventSeverity;
  userId?: string | null;
  userEmail?: string | null;
  detail: string;
  resolved: boolean;
  createdAt: string;
}

export interface AppErrorRecord {
  id: string;
  screen: string;
  message: string;
  source: string;
  count: number;
  durationMs?: number | null;
  lastOccurredAt: string;
  createdAt: string;
}

export interface SystemHealthMetrics {
  dbBytes: number;
  storageBytes: number;
  storageFiles: number;
  totalUsers: number;
  storesCount: number;
  productsCount: number;
  ordersCount: number;
  pendingPayments: number;
  openSecurityAlerts: number;
  errorGroups: number;
  collectedAt: string;
}

export interface NocServiceCheck {
  id: "database" | "auth" | "storage" | "site";
  label: string;
  status: "operacional" | "degradado" | "indisponivel";
  latencyMs: number;
  detail: string;
  checkedAt: string;
}

export interface NocHistorySample {
  timestamp: string;
  overallStatus: "operacional" | "degradado" | "indisponivel";
  avgLatencyMs: number;
  checks: Record<NocServiceCheck["id"], number>;
}

export type ThemeMode = "dark" | "light" | "system";
