import {
  SupabaseProductRepo,
  SupabaseOrderRepo,
  SupabaseMessageRepo,
  SupabaseUserRepo,
  SupabaseStoreRepo,
  SupabaseStoreReviewRepo,
  SupabaseNotificationRepo,
  SupabaseReportRepo,
  SupabaseAdRepo,
  SupabasePaymentRepo,
  SupabaseDeliveryRepo,
  SupabaseSystemConfigRepo,
  SupabaseAuditRepo,
  createRemoteSyncHandlers,
} from "./supabase";
import { syncQueue } from "./offline";

export const productRepo = new SupabaseProductRepo();
export const orderRepo = new SupabaseOrderRepo();
export const messageRepo = new SupabaseMessageRepo();
export const userRepo = new SupabaseUserRepo();
export const storeRepo = new SupabaseStoreRepo();
export const storeReviewRepo = new SupabaseStoreReviewRepo();
export const notificationRepo = new SupabaseNotificationRepo();
export const reportRepo = new SupabaseReportRepo();
export const adRepo = new SupabaseAdRepo();
export const paymentRepo = new SupabasePaymentRepo();
export const deliveryRepo = new SupabaseDeliveryRepo();
export const systemConfigRepo = new SupabaseSystemConfigRepo();
export const auditRepo = new SupabaseAuditRepo();

export const remoteSyncHandlers = createRemoteSyncHandlers(orderRepo, messageRepo, productRepo);
export { syncQueue };

export * from "./types";
export * from "./offline";
