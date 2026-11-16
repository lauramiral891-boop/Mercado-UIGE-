import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import {
  saveProducts,
  saveStores,
  saveCurrentUser,
  saveSystemConfig,
  saveAds,
} from "../../lib/storage";
import { smartSearch, generateDeliveryCode } from "../../lib/utils";
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
  PlanType,
  AdPosition,
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
  OfflineProductRepo,
  OfflineOrderRepo,
  OfflineMessageRepo,
  OfflineUserRepo,
  OfflineStoreRepo,
  OfflineStoreReviewRepo,
  OfflineNotificationRepo,
  OfflineReportRepo,
  OfflineAdRepo,
  OfflinePaymentRepo,
  OfflineDeliveryRepo,
  OfflineSystemConfigRepo,
  OfflineAuditRepo,
  OfflineSystemEventRepo,
  OfflineAppErrorRepo,
  OfflineSystemHealthRepo,
  RemoteSyncHandlers,
  syncQueue,
} from "../offline";
import { allowTelemetryWrite, sanitizeTelemetryText } from "../../lib/observability";

const fallbackProductRepo = new OfflineProductRepo();
const fallbackOrderRepo = new OfflineOrderRepo();
const fallbackMessageRepo = new OfflineMessageRepo();
const fallbackUserRepo = new OfflineUserRepo();
const fallbackStoreRepo = new OfflineStoreRepo();
const fallbackStoreReviewRepo = new OfflineStoreReviewRepo();
const fallbackNotificationRepo = new OfflineNotificationRepo();
const fallbackReportRepo = new OfflineReportRepo();
const fallbackAdRepo = new OfflineAdRepo();
const fallbackPaymentRepo = new OfflinePaymentRepo();
const fallbackDeliveryRepo = new OfflineDeliveryRepo();
const fallbackSystemConfigRepo = new OfflineSystemConfigRepo();
const fallbackAuditRepo = new OfflineAuditRepo();
const fallbackSystemEventRepo = new OfflineSystemEventRepo();
const fallbackAppErrorRepo = new OfflineAppErrorRepo();
const fallbackSystemHealthRepo = new OfflineSystemHealthRepo();

function mapProductRow(row: any): Product {
  return {
    id: row.id,
    storeId: row.loja_id,
    sellerId: row.vendedor_id,
    name: row.nome,
    description: row.descricao,
    price: Number(row.preco),
    oldPrice: row.preco_antigo ? Number(row.preco_antigo) : null,
    discount:
      row.preco_antigo && Number(row.preco_antigo) > Number(row.preco)
        ? Math.round((1 - Number(row.preco) / Number(row.preco_antigo)) * 100)
        : 0,
    stock: row.stock,
    categoryName: row.categoria,
    brand: row.marca,
    condition: row.condicao === "usado" ? "usado" : "novo",
    image: row.imagem_url || "",
    images: row.imagens || [],
    province: row.provincia || "Uíge",
    municipality: row.municipio || "Uíge",
    bairro: row.bairro,
    isApproved: row.is_aprovado,
    isFeatured: row.is_destaque,
    sales: row.vendas || 0,
    rating: Number(row.classificacao || 0),
    reviewsCount: row.total_avaliacoes || 0,
    variants: row.variantes || [],
    storeName: row.lojas?.nome || "Loja Local",
    storeCode: row.lojas?.codigo || undefined,
    storeType: row.lojas?.tipo_loja || "loja_fixa",
    storeRating: Number(row.lojas?.classificacao || 0),
    storeVip: row.lojas?.is_vip || false,
    createdAt: row.criado_em,
  };
}

// 1. SUPABASE PRODUTOS
export class SupabaseProductRepo implements IProductRepo {
  async getAll(filters?: ProductFilters): Promise<Product[]> {
    if (!isSupabaseConfigured) return fallbackProductRepo.getAll(filters);

    try {
      let query = supabase
        .from("produtos")
        .select("*, lojas(nome, codigo, tipo_loja, classificacao, is_vip)");

      if (filters?.category && filters.category !== "todas") {
        query = query.eq("categoria", filters.category);
      }
      if (filters?.municipality && filters.municipality !== "todas") {
        query = query.eq("municipio", filters.municipality);
      }
      if (filters?.condition && filters.condition !== "todas") {
        query = query.eq("condicao", filters.condition);
      }
      if (filters?.maxPrice) {
        query = query.lte("preco", filters.maxPrice);
      }
      if (filters?.availableOnly) {
        query = query.gt("stock", 0);
      }

      const { data, error } = await query;
      if (error || !data) {
        return fallbackProductRepo.getAll(filters);
      }

      const mapped = data.map(mapProductRow);

      if (
        !filters ||
        (!filters.query &&
          !filters.category &&
          !filters.municipality &&
          (!filters.condition || filters.condition === "todas") &&
          (!filters.storeType || filters.storeType === "todos") &&
          !filters.maxPrice &&
          !filters.availableOnly)
      ) {
        saveProducts(mapped);
      }

      if (filters?.query || filters?.sort || (filters?.storeType && filters.storeType !== "todos")) {
        return smartSearch(mapped, filters.query || "", {
          sort: filters.sort,
          maxPrice: filters.maxPrice,
          location: filters.municipality,
          category: filters.category,
          condition: filters.condition,
          storeType: filters.storeType,
          onlyAvailable: filters.availableOnly,
          personalization: filters.personalization,
        }).map((s) => s.item);
      }

      return mapped;
    } catch {
      return fallbackProductRepo.getAll(filters);
    }
  }

  async getById(id: string): Promise<Product | null> {
    if (!isSupabaseConfigured) return fallbackProductRepo.getById(id);
    try {
      const { data, error } = await supabase
        .from("produtos")
        .select("*, lojas(nome, codigo, tipo_loja, classificacao, is_vip)")
        .eq("id", id)
        .single();
      if (error || !data) return fallbackProductRepo.getById(id);
      return mapProductRow(data);
    } catch {
      return fallbackProductRepo.getById(id);
    }
  }

  async create(product: Partial<Product>): Promise<Product> {
    const localProd = await fallbackProductRepo.create(product);
    if (!isSupabaseConfigured) return localProd;

    try {
      const { data, error } = await supabase
        .from("produtos")
        .insert({
          loja_id: product.storeId || null,
          vendedor_id: product.sellerId,
          nome: product.name,
          descricao: product.description || "",
          preco: product.price,
          preco_antigo: product.oldPrice || null,
          stock: product.stock ?? 1,
          categoria: product.categoryName || "Electrónicos",
          marca: product.brand || "Oficial",
          condicao: product.condition || "novo",
          imagem_url: product.image || "",
          imagens: product.images || [],
          municipio: product.municipality || "Uíge",
        })
        .select("*, lojas(nome, codigo, tipo_loja, classificacao, is_vip)")
        .single();

      if (error || !data) return localProd;
      syncQueue.markProcessed(localProd.id);
      return mapProductRow(data);
    } catch {
      return localProd;
    }
  }

  async updateStock(id: string, newStock: number): Promise<void> {
    await fallbackProductRepo.updateStock(id, newStock);
    if (!isSupabaseConfigured) return;
    try {
      const { error } = await supabase.from("produtos").update({ stock: newStock }).eq("id", id);
      if (error) throw error;
    } catch {}
  }

  async delete(id: string): Promise<void> {
    await fallbackProductRepo.delete(id);
    if (!isSupabaseConfigured) return;
    try {
      await supabase.from("produtos").delete().eq("id", id);
    } catch {}
  }

  async approve(id: string, isApproved: boolean): Promise<void> {
    await fallbackProductRepo.approve(id, isApproved);
    if (!isSupabaseConfigured) return;
    try {
      await supabase.from("produtos").update({ is_aprovado: isApproved }).eq("id", id);
    } catch {}
  }
}

// 2. SUPABASE ENCOMENDAS
export class SupabaseOrderRepo implements IOrderRepo {
  private mapOrderRow(o: any): Order {
    return {
      id: o.id,
      code: o.codigo,
      userId: o.utilizador_id,
      userName: o.nome_cliente || o.perfis?.nome || undefined,
      userPhone: o.telefone_cliente || o.perfis?.telefone || undefined,
      storeId: o.loja_id,
      storeName: o.lojas?.nome || undefined,
      storePhone: o.lojas?.telefone || null,
      status: o.estado,
      paymentStatus: o.estado_pagamento === "pago" ? "pago" : "pendente",
      paidAt: o.pago_em || null,
      subtotal: Number(o.subtotal),
      deliveryType: o.tipo_entrega || "entrega",
      deliveryFee: Number(o.taxa_entrega),
      total: Number(o.total),
      address: o.endereco_entrega,
      paymentMethod: o.metodo_pagamento,
      createdAt: o.criado_em,
      clientMutationId: o.client_mutation_id,
      items: (o.itens_encomenda || []).map((it: any) => ({
        id: it.id,
        productId: it.produto_id,
        productName: it.nome_produto,
        productImage: it.imagem_produto,
        qty: it.quantidade,
        price: Number(it.preco_unitario),
        selectedVariant: it.variante,
      })),
    };
  }

  async getAll(userId?: string, storeId?: string): Promise<Order[]> {
    if (!isSupabaseConfigured) return fallbackOrderRepo.getAll(userId, storeId);
    try {
      let query = supabase
        .from("encomendas")
        .select("*, lojas(nome, telefone), itens_encomenda(*)")
        .order("criado_em", { ascending: false });
      if (userId) query = query.eq("utilizador_id", userId);
      if (storeId) query = query.eq("loja_id", storeId);

      const { data, error } = await query;
      if (error || !data) return fallbackOrderRepo.getAll(userId, storeId);

      return data.map((o: any) => this.mapOrderRow(o));
    } catch {
      return fallbackOrderRepo.getAll(userId, storeId);
    }
  }

  async getById(id: string): Promise<Order | null> {
    if (!isSupabaseConfigured) return fallbackOrderRepo.getById(id);
    try {
      const { data, error } = await supabase
        .from("encomendas")
        .select("*, lojas(nome, telefone), itens_encomenda(*)")
        .eq("id", id)
        .single();
      if (error || !data) return fallbackOrderRepo.getById(id);
      return this.mapOrderRow(data);
    } catch {
      return fallbackOrderRepo.getById(id);
    }
  }

  async syncPendingOrder(orderPayload: Order): Promise<Order | null> {
    if (!isSupabaseConfigured) return null;

    const { data: existing } = orderPayload.clientMutationId
      ? await supabase
          .from("encomendas")
          .select("id")
          .eq("client_mutation_id", orderPayload.clientMutationId)
          .maybeSingle()
      : { data: null };

    if (existing) return this.getById(existing.id);

    const { data: newOrder, error: orderErr } = await supabase
      .from("encomendas")
      .insert({
        codigo: orderPayload.code,
        utilizador_id: orderPayload.userId,
        nome_cliente: orderPayload.userName || null,
        telefone_cliente: orderPayload.userPhone || null,
        loja_id: orderPayload.storeId || null,
        estado: "Pendente",
        estado_pagamento: "pendente",
        tipo_entrega: orderPayload.deliveryType || "entrega",
        endereco_entrega: orderPayload.address,
        metodo_pagamento: orderPayload.paymentMethod,
        client_mutation_id: orderPayload.clientMutationId || null,
      })
      .select()
      .single();

    if (orderErr || !newOrder) {
      throw orderErr || new Error("Falha ao sincronizar encomenda.");
    }

    if (orderPayload.items && orderPayload.items.length > 0) {
      const itemsToInsert = orderPayload.items.map((it) => ({
        encomenda_id: newOrder.id,
        produto_id: it.productId,
        nome_produto: it.productName,
        imagem_produto: it.productImage || null,
        quantidade: it.qty,
        preco_unitario: it.price,
        variante: it.selectedVariant || null,
      }));
      const { error: itemsErr } = await supabase.from("itens_encomenda").insert(itemsToInsert);
      if (itemsErr) throw itemsErr;
    }

    // Relê a encomenda com subtotal, taxa_entrega e total recalculados pelos triggers do servidor
    const serverOrder = await this.getById(newOrder.id);
    return serverOrder;
  }

  async create(orderData: any): Promise<Order> {
    const localOrder = await fallbackOrderRepo.create(orderData);
    if (isSupabaseConfigured) {
      try {
        const serverOrder = await this.syncPendingOrder(localOrder);
        if (localOrder.clientMutationId) {
          syncQueue.markProcessed(localOrder.clientMutationId);
        }
        if (serverOrder) {
          return serverOrder;
        }
      } catch {}
    }
    return localOrder;
  }

  async updateStatus(id: string, status: Order["status"]): Promise<void> {
    await fallbackOrderRepo.updateStatus(id, status);
    if (!isSupabaseConfigured) return;
    try {
      await supabase.from("encomendas").update({ estado: status }).eq("id", id);
    } catch {}
  }

  async markPaid(id: string): Promise<void> {
    await fallbackOrderRepo.markPaid(id);
    if (!isSupabaseConfigured) return;
    const now = new Date().toISOString();
    try {
      const existing = await this.getById(id);
      const nextStatus = existing?.status === "Pendente" ? "Confirmada" : existing?.status;
      await supabase
        .from("encomendas")
        .update({
          estado_pagamento: "pago",
          pago_em: now,
          ...(nextStatus ? { estado: nextStatus } : {}),
        })
        .eq("id", id);
    } catch {}
  }
}

// 3. SUPABASE MENSAGENS
export class SupabaseMessageRepo implements IMessageRepo {
  async getAll(userId: string): Promise<MessageItem[]> {
    if (!isSupabaseConfigured) return fallbackMessageRepo.getAll(userId);
    try {
      const { data, error } = await supabase
        .from("mensagens")
        .select("*")
        .or(`remetente_id.eq.${userId},destinatario_id.eq.${userId}`)
        .order("criado_em", { ascending: true });

      if (error || !data) return fallbackMessageRepo.getAll(userId);

      return data.map((m: any) => ({
        id: m.id,
        senderId: m.remetente_id,
        receiverId: m.destinatario_id,
        productId: m.produto_id,
        content: m.mensagem,
        isRead: m.lida,
        createdAt: m.criado_em,
        clientMutationId: m.client_mutation_id,
      }));
    } catch {
      return fallbackMessageRepo.getAll(userId);
    }
  }

  async syncPendingMessage(msgPayload: MessageItem): Promise<void> {
    if (!isSupabaseConfigured) return;
    if (msgPayload.clientMutationId) {
      const { data: existing } = await supabase
        .from("mensagens")
        .select("id")
        .eq("client_mutation_id", msgPayload.clientMutationId)
        .maybeSingle();
      if (existing) return;
    }
    const { error } = await supabase.from("mensagens").insert({
      remetente_id: msgPayload.senderId,
      destinatario_id: msgPayload.receiverId,
      produto_id: msgPayload.productId || null,
      mensagem: msgPayload.content,
      client_mutation_id: msgPayload.clientMutationId || null,
    });
    if (error) throw error;
  }

  async send(data: {
    senderId: string;
    receiverId: string;
    productId?: string;
    content: string;
    clientMutationId?: string;
  }): Promise<MessageItem> {
    const localMsg = await fallbackMessageRepo.send(data);
    if (isSupabaseConfigured) {
      try {
        await this.syncPendingMessage(localMsg);
        if (localMsg.clientMutationId) {
          syncQueue.markProcessed(localMsg.clientMutationId);
        }
      } catch {}
    }
    return localMsg;
  }
}

// 4. SUPABASE UTILIZADORES
export class SupabaseUserRepo implements IUserRepo {
  private mapUserRow(u: any, verified = true): User {
    return {
      id: u.id,
      code: u.codigo || undefined,
      name: u.nome,
      email: u.email,
      phone: u.telefone,
      role: u.papel,
      province: u.provincia || "Uíge",
      municipality: u.municipio || "Uíge",
      bairro: u.bairro,
      biNumber: u.bi_numero,
      biPhotoUrl: u.bi_foto_url,
      residesInUigeConfirmed: u.reside_uige_confirmado ?? true,
      isApproved: u.aprovado ?? true,
      approvalStatus: u.estado_aprovacao || (u.aprovado === false ? "pendente" : "aprovado"),
      rejectionReason: u.motivo_rejeicao || null,
      correctionNote: u.nota_correcao || null,
      walletBalance: 0,
      isSuspended: u.suspenso,
      isVerified: verified,
      planType: u.plano_tipo || "gratis",
      planExpiresAt: u.plano_expira_em || null,
      welcomeSentAt: u.welcome_sent_at,
      createdAt: u.criado_em,
    };
  }

  async getCurrentUser(): Promise<User | null> {
    if (!isSupabaseConfigured) return fallbackUserRepo.getCurrentUser();
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUser = sessionData?.session?.user;
      if (!sessionUser) {
        saveCurrentUser(null);
        return null;
      }

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      const authUser = authData?.user || sessionUser;
      if (authErr && !navigator.onLine) {
        return fallbackUserRepo.getCurrentUser();
      }

      const { data: profile, error } = await supabase
        .from("perfis")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (error || !profile) {
        return !navigator.onLine ? fallbackUserRepo.getCurrentUser() : null;
      }

      const mapped = this.mapUserRow(profile, Boolean(authUser.email_confirmed_at));
      saveCurrentUser(mapped);
      return mapped;
    } catch {
      return !navigator.onLine ? fallbackUserRepo.getCurrentUser() : null;
    }
  }

  async getAll(): Promise<User[]> {
    if (!isSupabaseConfigured) return fallbackUserRepo.getAll();
    try {
      const { data, error } = await supabase.from("perfis").select("*").order("criado_em", { ascending: false });
      if (error || !data) return fallbackUserRepo.getAll();
      return data.map((u: any) => this.mapUserRow(u, true));
    } catch {
      return fallbackUserRepo.getAll();
    }
  }

  async updateProfile(id: string, updates: Partial<User>): Promise<User> {
    if (isSupabaseConfigured && Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from("perfis")
        .update({
          nome: updates.name,
          telefone: updates.phone,
          municipio: updates.municipality,
          bairro: updates.bairro,
          bi_numero: updates.biNumber,
          bi_foto_url: updates.biPhotoUrl,
        })
        .eq("id", id);
      if (error) throw error;
    }
    return fallbackUserRepo.updateProfile(id, updates);
  }

  async approveUser(id: string, isApproved: boolean): Promise<void> {
    await this.updateApproval(id, isApproved ? "aprovado" : "pendente");
  }

  async updateApproval(id: string, status: ApprovalStatus, note?: string): Promise<void> {
    const isApproved = status === "aprovado";
    if (isSupabaseConfigured) {
      const payload: Record<string, any> = {
        aprovado: isApproved,
        estado_aprovacao: status,
      };
      if (status === "rejeitado") {
        payload.motivo_rejeicao = note?.trim() || "Documentação rejeitada pela moderação.";
      } else if (status === "correcao") {
        payload.nota_correcao = note?.trim() || "Dados ou documentos necessitam de correcção.";
      } else if (status === "aprovado") {
        payload.motivo_rejeicao = null;
        payload.nota_correcao = null;
      }
      const { error } = await supabase.from("perfis").update(payload).eq("id", id);
      if (error) throw error;
    }
    await fallbackUserRepo.updateApproval(id, status, note);
  }

  async suspendUser(id: string, isSuspended: boolean): Promise<void> {
    if (isSupabaseConfigured) {
      const { error } = await supabase.from("perfis").update({ suspenso: isSuspended }).eq("id", id);
      if (error) throw error;
    }
    await fallbackUserRepo.suspendUser(id, isSuspended);
  }

  async setRole(id: string, role: UserRole): Promise<void> {
    if (isSupabaseConfigured) {
      const { error } = await supabase.from("perfis").update({ papel: role }).eq("id", id);
      if (error) throw error;
    }
    await fallbackUserRepo.setRole(id, role);
  }

  async setPlan(id: string, planType: PlanType, durationDays = 30): Promise<void> {
    const expiresAt = planType === "gratis" ? null : new Date(Date.now() + durationDays * 86400000).toISOString();
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from("perfis")
        .update({ plano_tipo: planType, plano_expira_em: expiresAt })
        .eq("id", id);
      if (error) throw error;
    }
    await fallbackUserRepo.setPlan(id, planType, durationDays);
  }

  async deleteAccount(id: string): Promise<void> {
    if (isSupabaseConfigured) {
      try {
        await supabase.rpc("delete_user_account");
        await supabase.auth.signOut();
      } catch {}
    }
    return fallbackUserRepo.deleteAccount(id);
  }
}

// 5. SUPABASE LOJAS
export class SupabaseStoreRepo implements IStoreRepo {
  private mapStoreRow(s: any): Store {
    return {
      id: s.id,
      code: s.codigo || undefined,
      ownerId: s.dono_id,
      name: s.nome,
      description: s.descricao || "",
      category: s.categoria || "Geral",
      storeType: s.tipo_loja === "vendedor_ambulante" ? "vendedor_ambulante" : "loja_fixa",
      province: s.provincia || "Uíge",
      municipality: s.municipio || "Uíge",
      bairro: s.bairro,
      address: s.morada,
      facadeImage: s.foto_fachada_url,
      biPhotoUrl: s.foto_bi_url,
      logo: s.logo_url || s.foto_fachada_url || "",
      cover: s.capa_url,
      isApproved: s.is_aprovada,
      approvalStatus: s.estado_aprovacao || (s.is_aprovada ? "aprovado" : "pendente"),
      rejectionReason: s.motivo_rejeicao || null,
      correctionNote: s.nota_correcao || null,
      isSuspended: Boolean(s.suspensa),
      suspensionReason: s.motivo_suspensao,
      isVip: s.is_vip,
      planType: s.plano_tipo || "gratis",
      planExpiresAt: s.plano_expira_em,
      reportsCount: s.denuncias_count || 0,
      reviewsCount: s.total_avaliacoes || 0,
      rating: Number(s.classificacao || 0),
      salesCount: 0,
      phone: s.telefone,
      createdAt: s.criado_em,
    };
  }

  async getAll(includeInactive = false): Promise<Store[]> {
    if (!isSupabaseConfigured) return fallbackStoreRepo.getAll(includeInactive);
    try {
      try {
        await supabase.rpc("expirar_planos_vencidos");
      } catch {}
      const { data, error } = await supabase.from("lojas").select("*").order("criado_em", { ascending: false });
      if (error || !data) return fallbackStoreRepo.getAll(includeInactive);
      const mapped = data.map((s) => this.mapStoreRow(s));
      saveStores(mapped);
      if (includeInactive) return mapped;
      return mapped.filter((s) => s.isApproved && !s.isSuspended);
    } catch {
      return fallbackStoreRepo.getAll(includeInactive);
    }
  }

  async getById(id: string): Promise<Store | null> {
    if (!isSupabaseConfigured) return fallbackStoreRepo.getById(id);
    try {
      const { data, error } = await supabase.from("lojas").select("*").eq("id", id).single();
      if (error || !data) return fallbackStoreRepo.getById(id);
      return this.mapStoreRow(data);
    } catch {
      return fallbackStoreRepo.getById(id);
    }
  }

  async create(store: Partial<Store>): Promise<Store> {
    if (!isSupabaseConfigured) return fallbackStoreRepo.create(store);
    try {
      const { data, error } = await supabase
        .from("lojas")
        .insert({
          dono_id: store.ownerId,
          nome: store.name,
          descricao: store.description || "",
          categoria: store.category || "Geral",
          tipo_loja: store.storeType || "loja_fixa",
          municipio: store.municipality || "Uíge",
          bairro: store.bairro || null,
          morada: store.address || null,
          foto_fachada_url: store.facadeImage || null,
          foto_bi_url: store.biPhotoUrl || null,
          logo_url: store.logo || store.facadeImage || null,
          telefone: store.phone || null,
        })
        .select()
        .single();
      if (error || !data) return fallbackStoreRepo.create(store);
      return this.mapStoreRow(data);
    } catch {
      return fallbackStoreRepo.create(store);
    }
  }

  async toggleVip(id: string, isVip: boolean): Promise<void> {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from("lojas")
        .update({ is_vip: isVip, plano_tipo: isVip ? "vip" : "gratis" })
        .eq("id", id);
      if (error) throw error;
    }
    await fallbackStoreRepo.toggleVip(id, isVip);
  }

  async toggleApproval(id: string, isApproved: boolean): Promise<void> {
    await this.updateApproval(id, isApproved ? "aprovado" : "pendente");
  }

  async updateApproval(id: string, status: ApprovalStatus, note?: string): Promise<void> {
    const isApproved = status === "aprovado";
    if (isSupabaseConfigured) {
      const payload: Record<string, any> = {
        is_aprovada: isApproved,
        estado_aprovacao: status,
      };
      if (status === "rejeitado") {
        payload.motivo_rejeicao = note?.trim() || "Documentação rejeitada pela moderação.";
      } else if (status === "correcao") {
        payload.nota_correcao = note?.trim() || "A documentação da loja precisa de correcção.";
      } else if (status === "aprovado") {
        payload.motivo_rejeicao = null;
        payload.nota_correcao = null;
      }
      const { error } = await supabase.from("lojas").update(payload).eq("id", id);
      if (error) throw error;
    }
    await fallbackStoreRepo.updateApproval(id, status, note);
  }

  async suspendStore(id: string, isSuspended: boolean, reason?: string): Promise<void> {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from("lojas")
        .update({ suspensa: isSuspended, motivo_suspensao: isSuspended ? reason || null : null })
        .eq("id", id);
      if (error) throw error;
    }
    await fallbackStoreRepo.suspendStore(id, isSuspended, reason);
  }

  async setPlan(id: string, planType: PlanType, durationDays = 30): Promise<void> {
    const expiresAt = planType === "gratis" ? null : new Date(Date.now() + durationDays * 86400000).toISOString();
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from("lojas")
        .update({ plano_tipo: planType, is_vip: planType === "vip", plano_expira_em: expiresAt })
        .eq("id", id);
      if (error) throw error;
    }
    await fallbackStoreRepo.setPlan(id, planType, durationDays);
  }
}

// 5B. SUPABASE AVALIAÇÕES POR LOJA
export class SupabaseStoreReviewRepo implements IStoreReviewRepo {
  async getByStore(storeId: string): Promise<StoreReview[]> {
    if (!isSupabaseConfigured) return fallbackStoreReviewRepo.getByStore(storeId);
    try {
      const { data, error } = await supabase
        .from("avaliacoes_loja")
        .select("*, perfis(nome)")
        .eq("loja_id", storeId)
        .order("criado_em", { ascending: false });
      if (error || !data) return fallbackStoreReviewRepo.getByStore(storeId);
      return data.map((r: any) => ({
        id: r.id,
        storeId: r.loja_id,
        userId: r.utilizador_id,
        userName: r.perfis?.nome || "Cliente Uíge",
        stars: r.estrelas,
        comment: r.comentario || "",
        createdAt: r.criado_em,
      }));
    } catch {
      return fallbackStoreReviewRepo.getByStore(storeId);
    }
  }

  async create(review: {
    storeId: string;
    userId: string;
    userName?: string;
    stars: number;
    comment: string;
  }): Promise<StoreReview> {
    const local = await fallbackStoreReviewRepo.create(review);
    if (!isSupabaseConfigured) return local;
    try {
      const { data, error } = await supabase
        .from("avaliacoes_loja")
        .upsert(
          {
            loja_id: review.storeId,
            utilizador_id: review.userId,
            estrelas: review.stars,
            comentario: review.comment.trim(),
          },
          { onConflict: "utilizador_id,loja_id" }
        )
        .select()
        .single();
      if (error || !data) return local;
      return {
        id: data.id,
        storeId: data.loja_id,
        userId: data.utilizador_id,
        userName: review.userName || "Cliente Uíge",
        stars: data.estrelas,
        comment: data.comentario || "",
        createdAt: data.criado_em,
      };
    } catch {
      return local;
    }
  }
}

// 6. SUPABASE NOTIFICAÇÕES & AVISOS PROVINCIAIS
export class SupabaseNotificationRepo implements INotificationRepo {
  async getAll(userId?: string): Promise<NotificationItem[]> {
    if (!isSupabaseConfigured) return fallbackNotificationRepo.getAll(userId);
    try {
      const [{ data: notifs }, { data: avisos }] = await Promise.all([
        userId
          ? supabase.from("notificacoes").select("*").eq("utilizador_id", userId).order("criado_em", { ascending: false })
          : supabase.from("notificacoes").select("*").order("criado_em", { ascending: false }),
        supabase.from("avisos").select("*").order("criado_em", { ascending: false }).limit(20),
      ]);

      const personal: NotificationItem[] = (notifs || []).map((n: any) => ({
        id: n.id,
        userId: n.utilizador_id,
        title: n.titulo,
        body: n.mensagem,
        type: (n.tipo as NotificationItem["type"]) || "info",
        isRead: n.lida,
        createdAt: n.criado_em,
      }));

      const broadcasts: NotificationItem[] = (avisos || []).map((a: any) => ({
        id: `aviso_${a.id}`,
        userId: "all",
        title: a.titulo,
        body: a.corpo,
        type: "system",
        isRead: false,
        createdAt: a.criado_em,
      }));

      const combined = [...personal, ...broadcasts].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      return combined.length > 0 ? combined : fallbackNotificationRepo.getAll(userId);
    } catch {
      return fallbackNotificationRepo.getAll(userId);
    }
  }

  async markAllRead(userId: string): Promise<void> {
    await fallbackNotificationRepo.markAllRead(userId);
    if (!isSupabaseConfigured) return;
    try {
      await supabase.from("notificacoes").update({ lida: true }).eq("utilizador_id", userId);
    } catch {}
  }

  async create(notification: Partial<NotificationItem>): Promise<NotificationItem> {
    if (!isSupabaseConfigured) return fallbackNotificationRepo.create(notification);
    try {
      if (notification.userId === "all") {
        const { data, error } = await supabase
          .from("avisos")
          .insert({
            titulo: notification.title || "Aviso Provincial",
            corpo: notification.body || "",
          })
          .select()
          .single();
        if (!error && data) {
          return {
            id: `aviso_${data.id}`,
            userId: "all",
            title: data.titulo,
            body: data.corpo,
            type: "system",
            isRead: false,
            createdAt: data.criado_em,
          };
        }
      } else if (notification.userId) {
        const { data, error } = await supabase
          .from("notificacoes")
          .insert({
            utilizador_id: notification.userId,
            titulo: notification.title || "Notificação",
            mensagem: notification.body || "",
            tipo: notification.type || "info",
          })
          .select()
          .single();
        if (!error && data) {
          return {
            id: data.id,
            userId: data.utilizador_id,
            title: data.titulo,
            body: data.mensagem,
            type: data.tipo,
            isRead: data.lida,
            createdAt: data.criado_em,
          };
        }
      }
      return fallbackNotificationRepo.create(notification);
    } catch {
      return fallbackNotificationRepo.create(notification);
    }
  }
}

// 7. SUPABASE DENÚNCIAS (Produtos e Lojas)
export class SupabaseReportRepo implements IReportRepo {
  async getAll(): Promise<ReportItem[]> {
    if (!isSupabaseConfigured) return fallbackReportRepo.getAll();
    try {
      const { data, error } = await supabase
        .from("denuncias")
        .select("*, produtos(nome), lojas(nome)")
        .order("criado_em", { ascending: false });
      if (error || !data) return fallbackReportRepo.getAll();
      return data.map((r: any) => ({
        id: r.id,
        reporterId: r.denunciante_id || "anon",
        productId: r.produto_id,
        productName: r.produtos?.nome || undefined,
        storeId: r.loja_id,
        storeName: r.lojas?.nome || undefined,
        reason: r.motivo,
        status: r.estado,
        createdAt: r.criado_em,
      }));
    } catch {
      return fallbackReportRepo.getAll();
    }
  }

  async create(report: Partial<ReportItem>): Promise<ReportItem> {
    const local = await fallbackReportRepo.create(report);
    if (!isSupabaseConfigured) return local;
    try {
      const { data, error } = await supabase
        .from("denuncias")
        .insert({
          denunciante_id: report.reporterId || null,
          produto_id: report.productId || null,
          loja_id: report.storeId || null,
          motivo: report.reason || "Irregularidade reportada",
          estado: "pendente",
        })
        .select()
        .single();
      if (error || !data) return local;
      return {
        id: data.id,
        reporterId: data.denunciante_id || "anon",
        productId: data.produto_id,
        productName: report.productName,
        storeId: data.loja_id,
        storeName: report.storeName,
        reason: data.motivo,
        status: data.estado,
        createdAt: data.criado_em,
      };
    } catch {
      return local;
    }
  }

  async resolve(id: string, status: "resolvido" | "rejeitado" = "resolvido"): Promise<void> {
    await fallbackReportRepo.resolve(id, status);
    if (!isSupabaseConfigured) return;
    try {
      await supabase.from("denuncias").update({ estado: status }).eq("id", id);
    } catch {}
  }
}

// 8. SUPABASE ANÚNCIOS PATROCINADOS
export class SupabaseAdRepo implements IAdRepo {
  private mapAdRow(a: any): SponsoredAd {
    return {
      id: a.id,
      storeId: a.loja_id,
      sellerId: a.vendedor_id,
      productId: a.produto_id,
      storeName: a.lojas?.nome || undefined,
      productName: a.produtos?.nome || undefined,
      title: a.titulo,
      subtitle: a.subtitulo || "",
      imageUrl: a.imagem_url || "",
      position: a.posicao || "topo",
      startDate: a.data_inicio,
      endDate: a.data_fim,
      views: a.visualizacoes || 0,
      clicks: a.cliques || 0,
      active: Boolean(a.ativo),
      status: a.estado || "pendente",
      createdAt: a.criado_em,
    };
  }

  async getAll(includeAll = false): Promise<SponsoredAd[]> {
    if (!isSupabaseConfigured) return fallbackAdRepo.getAll(includeAll);
    try {
      const { data, error } = await supabase
        .from("anuncios")
        .select("*, lojas(nome), produtos(nome)")
        .order("criado_em", { ascending: false });
      if (error || !data) return fallbackAdRepo.getAll(includeAll);
      const mapped = data.map((a) => this.mapAdRow(a));
      saveAds(mapped);
      if (includeAll) return mapped;
      const now = Date.now();
      return mapped.filter(
        (a) =>
          a.active &&
          a.status === "aprovado" &&
          new Date(a.startDate).getTime() <= now &&
          new Date(a.endDate).getTime() >= now
      );
    } catch {
      return fallbackAdRepo.getAll(includeAll);
    }
  }

  async getActiveByPosition(position: AdPosition): Promise<SponsoredAd[]> {
    const active = await this.getAll(false);
    return active.filter((a) => a.position === position);
  }

  async create(ad: Partial<SponsoredAd>): Promise<SponsoredAd> {
    if (!isSupabaseConfigured) return fallbackAdRepo.create(ad);
    try {
      const { data, error } = await supabase
        .from("anuncios")
        .insert({
          loja_id: ad.storeId || null,
          vendedor_id: ad.sellerId,
          produto_id: ad.productId || null,
          titulo: ad.title || "Campanha Patrocinada",
          subtitulo: ad.subtitle || "",
          imagem_url: ad.imageUrl || null,
          posicao: ad.position || "topo",
          data_inicio: ad.startDate || new Date().toISOString(),
          data_fim: ad.endDate || new Date(Date.now() + 30 * 86400000).toISOString(),
          ativo: Boolean(ad.active),
          estado: ad.status || "pendente",
        })
        .select("*, lojas(nome), produtos(nome)")
        .single();
      if (error || !data) return fallbackAdRepo.create(ad);
      return this.mapAdRow(data);
    } catch {
      return fallbackAdRepo.create(ad);
    }
  }

  async updateStatus(id: string, status: SponsoredAd["status"], active: boolean): Promise<void> {
    await fallbackAdRepo.updateStatus(id, status, active);
    if (!isSupabaseConfigured) return;
    try {
      await supabase.from("anuncios").update({ estado: status, ativo: active }).eq("id", id);
    } catch {}
  }

  async trackView(id: string): Promise<void> {
    await fallbackAdRepo.trackView(id);
    if (!isSupabaseConfigured) return;
    try {
      await supabase.rpc("increment_ad_view", { ad_id: id });
    } catch {}
  }

  async trackClick(id: string): Promise<void> {
    await fallbackAdRepo.trackClick(id);
    if (!isSupabaseConfigured) return;
    try {
      await supabase.rpc("increment_ad_click", { ad_id: id });
    } catch {}
  }

  async delete(id: string): Promise<void> {
    await fallbackAdRepo.delete(id);
    if (!isSupabaseConfigured) return;
    try {
      await supabase.from("anuncios").delete().eq("id", id);
    } catch {}
  }
}

// 9. SUPABASE PAGAMENTOS DE PLANOS E ANÚNCIOS
export class SupabasePaymentRepo implements IPaymentRepo {
  private mapRow(p: any): MerchantPayment {
    return {
      id: p.id,
      sellerId: p.vendedor_id,
      sellerName: p.perfis?.nome || undefined,
      storeId: p.loja_id,
      storeName: p.lojas?.nome || undefined,
      userRoleType: p.perfil_tipo || undefined,
      type: p.tipo,
      targetPlan: p.plano_alvo,
      adId: p.anuncio_id,
      amountKz: Number(p.valor_kz || 0),
      method: p.metodo,
      reference: p.referencia,
      proofUrl: p.comprovativo_url,
      status: p.estado,
      createdAt: p.criado_em,
      confirmedAt: p.confirmado_em,
    };
  }

  async getAll(sellerId?: string): Promise<MerchantPayment[]> {
    if (!isSupabaseConfigured) return fallbackPaymentRepo.getAll(sellerId);
    try {
      let query = supabase
        .from("pagamentos_comerciante")
        .select("*, perfis(nome), lojas(nome)")
        .order("criado_em", { ascending: false });
      if (sellerId) query = query.eq("vendedor_id", sellerId);
      const { data, error } = await query;
      if (error || !data) return fallbackPaymentRepo.getAll(sellerId);
      return data.map((r) => this.mapRow(r));
    } catch {
      return fallbackPaymentRepo.getAll(sellerId);
    }
  }

  async create(payment: Partial<MerchantPayment>): Promise<MerchantPayment> {
    if (!isSupabaseConfigured) return fallbackPaymentRepo.create(payment);
    try {
      const { data, error } = await supabase
        .from("pagamentos_comerciante")
        .insert({
          vendedor_id: payment.sellerId,
          loja_id: payment.storeId || null,
          perfil_tipo: payment.userRoleType || "loja_fixa",
          tipo: payment.type || "plano",
          plano_alvo: payment.targetPlan || null,
          anuncio_id: payment.adId || null,
          valor_kz: Number(payment.amountKz || 0),
          metodo: payment.method || "Multicaixa Express",
          referencia: payment.reference || null,
          comprovativo_url: payment.proofUrl || "",
          estado: "pendente",
        })
        .select("*, perfis(nome), lojas(nome)")
        .single();
      if (error || !data) return fallbackPaymentRepo.create(payment);
      return this.mapRow(data);
    } catch {
      return fallbackPaymentRepo.create(payment);
    }
  }

  async review(id: string, status: "confirmado" | "rejeitado"): Promise<void> {
    await fallbackPaymentRepo.review(id, status);
    if (!isSupabaseConfigured) return;
    try {
      await supabase.from("pagamentos_comerciante").update({ estado: status }).eq("id", id);
    } catch {}
  }
}

// 10. SUPABASE ENTREGAS E ENTREGADORES
export class SupabaseDeliveryRepo implements IDeliveryRepo {
  private mapRow(d: any): DeliveryRecord {
    return {
      id: d.id,
      orderId: d.encomenda_id,
      orderCode: d.encomendas?.codigo || undefined,
      storeId: d.loja_id,
      storeName: d.lojas?.nome || undefined,
      customerId: d.cliente_id,
      customerName: d.cliente?.nome || undefined,
      customerPhone: d.cliente?.telefone || undefined,
      courierId: d.entregador_id,
      courierName: d.entregador?.nome || undefined,
      status: d.estado,
      confirmationCode: d.codigo_confirmacao,
      deliveryFee: Number(d.taxa_entrega || 0),
      commissionPercent: Number(d.comissao_percent || 15),
      commissionAmount: Number(d.comissao_valor || 0),
      courierEarning: Number(d.ganho_entregador || 0),
      commissionCharged: Boolean(d.comissao_cobrada),
      pickupAddress: d.endereco_recolha,
      deliveryAddress: d.endereco_entrega,
      hasDelay: Boolean(d.tem_atraso),
      issueDescription: d.problema_descricao,
      acceptedAt: d.aceite_em,
      pickedUpAt: d.recolhido_em,
      deliveredAt: d.entregue_em,
      createdAt: d.criado_em,
    };
  }

  async getAll(filters?: { customerId?: string; courierId?: string; onlyAvailable?: boolean }): Promise<DeliveryRecord[]> {
    if (!isSupabaseConfigured) return fallbackDeliveryRepo.getAll(filters);
    try {
      let query = supabase
        .from("entregas")
        .select("*, encomendas(codigo), lojas(nome)")
        .order("criado_em", { ascending: false });
      if (filters?.customerId) query = query.eq("cliente_id", filters.customerId);
      if (filters?.courierId) query = query.eq("entregador_id", filters.courierId);
      if (filters?.onlyAvailable) query = query.eq("estado", "Pedido").is("entregador_id", null);
      const { data, error } = await query;
      if (error || !data) return fallbackDeliveryRepo.getAll(filters);
      return data.map((r) => this.mapRow(r));
    } catch {
      return fallbackDeliveryRepo.getAll(filters);
    }
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
    if (!isSupabaseConfigured) return fallbackDeliveryRepo.create(delivery);
    try {
      const code = generateDeliveryCode();
      const { data, error } = await supabase
        .from("entregas")
        .insert({
          encomenda_id: delivery.orderId,
          loja_id: delivery.storeId || null,
          cliente_id: delivery.customerId,
          codigo_confirmacao: code,
          taxa_entrega: delivery.deliveryFee,
          comissao_percent: delivery.commissionPercent,
          endereco_recolha: delivery.pickupAddress || "Centro do Uíge",
          endereco_entrega: delivery.deliveryAddress,
        })
        .select()
        .single();
      if (error || !data) return fallbackDeliveryRepo.create(delivery);
      return this.mapRow(data);
    } catch {
      return fallbackDeliveryRepo.create(delivery);
    }
  }

  async accept(deliveryId: string, courierId: string, courierName?: string): Promise<DeliveryRecord> {
    if (!isSupabaseConfigured) return fallbackDeliveryRepo.accept(deliveryId, courierId, courierName);
    try {
      const { data, error } = await supabase
        .from("entregas")
        .update({ entregador_id: courierId, estado: "Aceite pelo entregador" })
        .eq("id", deliveryId)
        .is("entregador_id", null)
        .select()
        .single();
      if (error || !data) return fallbackDeliveryRepo.accept(deliveryId, courierId, courierName);
      return this.mapRow(data);
    } catch {
      return fallbackDeliveryRepo.accept(deliveryId, courierId, courierName);
    }
  }

  async updateStatus(deliveryId: string, status: DeliveryStatus): Promise<void> {
    await fallbackDeliveryRepo.updateStatus(deliveryId, status);
    if (!isSupabaseConfigured) return;
    try {
      await supabase.from("entregas").update({ estado: status }).eq("id", deliveryId);
    } catch {}
  }

  async confirmWithCode(deliveryId: string, code: string): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured) return fallbackDeliveryRepo.confirmWithCode(deliveryId, code);
    try {
      const { data } = await supabase
        .from("entregas")
        .select("codigo_confirmacao")
        .eq("id", deliveryId)
        .single();
      if (!data) return fallbackDeliveryRepo.confirmWithCode(deliveryId, code);
      if (String(data.codigo_confirmacao).trim() !== code.trim()) {
        return { ok: false, message: "Código de entrega incorreto. Confirma com o cliente." };
      }
      const { error } = await supabase.from("entregas").update({ estado: "Entregue" }).eq("id", deliveryId);
      if (error) return { ok: false, message: "Não foi possível confirmar a entrega." };
      return { ok: true, message: "Entrega confirmada e comissão registada!" };
    } catch {
      return fallbackDeliveryRepo.confirmWithCode(deliveryId, code);
    }
  }

  async reportIssue(deliveryId: string, description: string, hasDelay = true): Promise<void> {
    await fallbackDeliveryRepo.reportIssue(deliveryId, description, hasDelay);
    if (!isSupabaseConfigured) return;
    try {
      await supabase
        .from("entregas")
        .update({ tem_atraso: hasDelay, problema_descricao: description.trim(), estado: "Com problema" })
        .eq("id", deliveryId);
    } catch {}
  }

  async getMonthlyFees(courierId?: string): Promise<CourierMonthlyFee[]> {
    if (!isSupabaseConfigured) return fallbackDeliveryRepo.getMonthlyFees(courierId);
    try {
      let query = supabase
        .from("mensalidades_entregador")
        .select("*, perfis(nome)")
        .order("criado_em", { ascending: false });
      if (courierId) query = query.eq("entregador_id", courierId);
      const { data, error } = await query;
      if (error || !data) return fallbackDeliveryRepo.getMonthlyFees(courierId);
      return data.map((f: any) => ({
        id: f.id,
        courierId: f.entregador_id,
        courierName: f.perfis?.nome || "Entregador",
        referenceMonth: f.mes_referencia,
        amountKz: Number(f.valor_kz || 0),
        proofUrl: f.comprovativo_url,
        status: f.estado,
        createdAt: f.criado_em,
        paidAt: f.pago_em,
      }));
    } catch {
      return fallbackDeliveryRepo.getMonthlyFees(courierId);
    }
  }

  async submitMonthlyFee(fee: Partial<CourierMonthlyFee>): Promise<CourierMonthlyFee> {
    if (!isSupabaseConfigured) return fallbackDeliveryRepo.submitMonthlyFee(fee);
    try {
      const { data, error } = await supabase
        .from("mensalidades_entregador")
        .insert({
          entregador_id: fee.courierId,
          mes_referencia: fee.referenceMonth || new Date().toISOString().slice(0, 7),
          valor_kz: Number(fee.amountKz || 5000),
          comprovativo_url: fee.proofUrl || null,
          estado: "pendente",
        })
        .select()
        .single();
      if (error || !data) return fallbackDeliveryRepo.submitMonthlyFee(fee);
      return {
        id: data.id,
        courierId: data.entregador_id,
        referenceMonth: data.mes_referencia,
        amountKz: Number(data.valor_kz),
        proofUrl: data.comprovativo_url,
        status: data.estado,
        createdAt: data.criado_em,
        paidAt: data.pago_em,
      };
    } catch {
      return fallbackDeliveryRepo.submitMonthlyFee(fee);
    }
  }

  async updateMonthlyFeeStatus(id: string, status: CourierMonthlyFee["status"]): Promise<void> {
    await fallbackDeliveryRepo.updateMonthlyFeeStatus(id, status);
    if (!isSupabaseConfigured) return;
    try {
      await supabase
        .from("mensalidades_entregador")
        .update({ estado: status, pago_em: status === "pago" ? new Date().toISOString() : null })
        .eq("id", id);
    } catch {}
  }
}

// 11. SUPABASE CONFIGURAÇÕES DO SISTEMA
export class SupabaseSystemConfigRepo implements ISystemConfigRepo {
  async get(): Promise<SystemConfig> {
    if (!isSupabaseConfigured) return fallbackSystemConfigRepo.get();
    try {
      const { data, error } = await supabase
        .from("configuracoes_sistema")
        .select("*")
        .eq("id", "global")
        .single();
      if (error || !data) return fallbackSystemConfigRepo.get();
      const cfg: SystemConfig = {
        autoSuspendReportsThreshold: Number(data.limite_denuncias_suspensao ?? 3),
        defaultDeliveryFee: Number(data.taxa_entrega_padrao ?? 1500),
        deliveryCommissionPercent: Number(data.comissao_entrega_percent ?? 15),
        courierMonthlyFee: Number(data.mensalidade_entregador ?? 5000),
        basicPlanPrice: Number(data.preco_plano_basico ?? 5000),
        vipPlanPrice: Number(data.preco_plano_vip ?? 15000),
        adminWhatsapp: String(data.whatsapp_admin ?? "945379003"),
        fixedStoreBasicPrice: Number(data.preco_plano_fixa_basico ?? data.preco_plano_basico ?? 5000),
        fixedStoreVipPrice: Number(data.preco_plano_fixa_vip ?? data.preco_plano_vip ?? 15000),
        ambulantBasicPrice: Number(data.preco_plano_ambulante_basico ?? 3000),
        ambulantVipPrice: Number(data.preco_plano_ambulante_vip ?? 9000),
        courierBasicPrice: Number(data.preco_plano_entregador_basico ?? 3000),
        courierVipPrice: Number(data.preco_plano_entregador_vip ?? 8000),
        maintenanceMode: Boolean(data.modo_manutencao ?? false),
        maintenanceMessage:
          data.mensagem_manutencao ||
          "Estamos em manutenção programada para melhorar o Mercado Uíge. Voltamos em breve.",
      };
      saveSystemConfig(cfg);
      return cfg;
    } catch {
      return fallbackSystemConfigRepo.get();
    }
  }

  async update(updates: Partial<SystemConfig>): Promise<SystemConfig> {
    const current = await this.get();
    const merged = { ...current, ...updates };
    if (isSupabaseConfigured) {
      const payload: Record<string, any> = {
        id: "global",
        limite_denuncias_suspensao: merged.autoSuspendReportsThreshold,
        taxa_entrega_padrao: merged.defaultDeliveryFee,
        comissao_entrega_percent: merged.deliveryCommissionPercent,
        mensalidade_entregador: merged.courierMonthlyFee,
        preco_plano_basico: merged.basicPlanPrice,
        preco_plano_vip: merged.vipPlanPrice,
        whatsapp_admin: merged.adminWhatsapp,
        preco_plano_fixa_basico: merged.fixedStoreBasicPrice,
        preco_plano_fixa_vip: merged.fixedStoreVipPrice,
        preco_plano_ambulante_basico: merged.ambulantBasicPrice,
        preco_plano_ambulante_vip: merged.ambulantVipPrice,
        preco_plano_entregador_basico: merged.courierBasicPrice,
        preco_plano_entregador_vip: merged.courierVipPrice,
        actualizado_em: new Date().toISOString(),
      };
      if (updates.maintenanceMode !== undefined) {
        payload.modo_manutencao = Boolean(merged.maintenanceMode);
      }
      if (updates.maintenanceMessage !== undefined) {
        payload.mensagem_manutencao = merged.maintenanceMessage || null;
      }
      const { error } = await supabase.from("configuracoes_sistema").upsert(payload);
      if (error) throw error;
    }
    return fallbackSystemConfigRepo.update(updates);
  }
}

// 12. SUPABASE AUDITORIA
export class SupabaseAuditRepo implements IAuditRepo {
  async getAll(): Promise<AuditLogItem[]> {
    if (!isSupabaseConfigured) return fallbackAuditRepo.getAll();
    try {
      const { data, error } = await supabase
        .from("auditoria")
        .select("*, perfis(email, nome)")
        .order("criado_em", { ascending: false });
      if (error || !data) return fallbackAuditRepo.getAll();
      return data.map((a: any) => ({
        id: a.id,
        adminId: a.admin_id,
        adminEmail: a.perfis?.email || a.admin_id,
        action: a.acao,
        targetType: "recurso",
        targetId: a.alvo || "",
        details: a.detalhes,
        createdAt: a.criado_em,
      }));
    } catch {
      return fallbackAuditRepo.getAll();
    }
  }

  async log(adminId: string, action: string, target?: string, details?: any): Promise<void> {
    await fallbackAuditRepo.log(adminId, action, target, details);
    if (!isSupabaseConfigured) return;
    try {
      await supabase.from("auditoria").insert({
        admin_id: adminId,
        acao: action,
        alvo: target || null,
        detalhes: details || null,
      });
    } catch {}
  }
}

// 13. SUPABASE EVENTOS DO SISTEMA (SOC — RLS SÓ SUPER_ADMIN)
export class SupabaseSystemEventRepo implements ISystemEventRepo {
  async getAll(): Promise<SystemEvent[]> {
    if (!isSupabaseConfigured) return fallbackSystemEventRepo.getAll();
    try {
      const { data, error } = await supabase
        .from("eventos_sistema")
        .select("*")
        .order("criado_em", { ascending: false })
        .limit(200);
      if (error || !data) return fallbackSystemEventRepo.getAll();
      return data.map((e: any) => ({
        id: e.id,
        type: e.tipo,
        severity: e.gravidade,
        userId: e.utilizador_id,
        userEmail: e.utilizador_email,
        detail: e.detalhe,
        resolved: Boolean(e.resolvido),
        createdAt: e.criado_em,
      }));
    } catch {
      return fallbackSystemEventRepo.getAll();
    }
  }

  async record(event: {
    type: string;
    severity?: SystemEventSeverity;
    userEmail?: string | null;
    detail: string;
  }): Promise<void> {
    const safeType = sanitizeTelemetryText(event.type || "EVENTO_SISTEMA", 60) || "EVENTO_SISTEMA";
    if (!allowTelemetryWrite(`soc:${safeType}`, 15)) return;

    await fallbackSystemEventRepo.record({
      ...event,
      type: safeType,
      detail: sanitizeTelemetryText(event.detail, 260),
    });

    if (!isSupabaseConfigured) return;
    try {
      await supabase.rpc("registrar_evento_sistema", {
        p_tipo: safeType,
        p_gravidade: event.severity || "info",
        p_utilizador_email: event.userEmail ? sanitizeTelemetryText(event.userEmail, 120) : null,
        p_detalhe: sanitizeTelemetryText(event.detail, 260),
      });
    } catch {}
  }

  async resolve(id: string, resolved = true): Promise<void> {
    if (isSupabaseConfigured) {
      const { error } = await supabase.from("eventos_sistema").update({ resolvido: resolved }).eq("id", id);
      if (error) throw error;
    }
    await fallbackSystemEventRepo.resolve(id, resolved);
  }
}

// 14. SUPABASE OBSERVABILIDADE DE ERROS (AGRUPADOS POR ECRÃ)
export class SupabaseAppErrorRepo implements IAppErrorRepo {
  async getAll(): Promise<AppErrorRecord[]> {
    if (!isSupabaseConfigured) return fallbackAppErrorRepo.getAll();
    try {
      const { data, error } = await supabase
        .from("erros_app")
        .select("*")
        .order("ultima_ocorrencia", { ascending: false })
        .limit(100);
      if (error || !data) return fallbackAppErrorRepo.getAll();
      return data.map((e: any) => ({
        id: e.id,
        screen: e.ecra,
        message: e.mensagem,
        source: e.origem,
        count: Number(e.contagem || 1),
        durationMs: e.duracao_ms ?? null,
        lastOccurredAt: e.ultima_ocorrencia,
        createdAt: e.criado_em,
      }));
    } catch {
      return fallbackAppErrorRepo.getAll();
    }
  }

  async report(errorItem: {
    screen: string;
    message: string;
    source?: string;
    durationMs?: number;
  }): Promise<void> {
    const screen = sanitizeTelemetryText(errorItem.screen || "geral", 60) || "geral";
    if (!allowTelemetryWrite(`err:${screen}`, 20)) return;
    const message = sanitizeTelemetryText(errorItem.message || "Erro operacional", 160) || "Erro operacional";
    const source = sanitizeTelemetryText(errorItem.source || "runtime", 40) || "runtime";

    await fallbackAppErrorRepo.report({
      screen,
      message,
      source,
      durationMs: errorItem.durationMs,
    });

    if (!isSupabaseConfigured) return;
    try {
      await supabase.rpc("reportar_erro_app", {
        p_ecra: screen,
        p_mensagem: message,
        p_origem: source,
        p_duracao_ms: typeof errorItem.durationMs === "number" ? Math.round(errorItem.durationMs) : null,
      });
    } catch {}
  }

  async clearAll(): Promise<void> {
    if (isSupabaseConfigured) {
      const { error } = await supabase.from("erros_app").delete().neq("contagem", -1);
      if (error) throw error;
    }
    await fallbackAppErrorRepo.clearAll();
  }
}

// 15. SUPABASE SAÚDE NOC / ITOM
export class SupabaseSystemHealthRepo implements ISystemHealthRepo {
  async getMetrics(): Promise<SystemHealthMetrics> {
    if (!isSupabaseConfigured) return fallbackSystemHealthRepo.getMetrics();
    try {
      const { data, error } = await supabase.rpc("get_system_health_metrics");
      if (error || !data) return fallbackSystemHealthRepo.getMetrics();
      return {
        dbBytes: Number(data.dbBytes || 0),
        storageBytes: Number(data.storageBytes || 0),
        storageFiles: Number(data.storageFiles || 0),
        totalUsers: Number(data.totalUsers || 0),
        storesCount: Number(data.storesCount || 0),
        productsCount: Number(data.productsCount || 0),
        ordersCount: Number(data.ordersCount || 0),
        pendingPayments: Number(data.pendingPayments || 0),
        openSecurityAlerts: Number(data.openSecurityAlerts || 0),
        errorGroups: Number(data.errorGroups || 0),
        collectedAt: String(data.collectedAt || new Date().toISOString()),
      };
    } catch {
      return fallbackSystemHealthRepo.getMetrics();
    }
  }

  async runNocChecks(): Promise<NocServiceCheck[]> {
    if (!isSupabaseConfigured) return fallbackSystemHealthRepo.runNocChecks();
    const checkedAt = new Date().toISOString();

    const probe = async (
      id: NocServiceCheck["id"],
      label: string,
      fn: () => Promise<{ ok: boolean; detail: string }>
    ): Promise<NocServiceCheck> => {
      const start = performance.now();
      try {
        const res = await fn();
        const latencyMs = Math.max(1, Math.round(performance.now() - start));
        const status: NocServiceCheck["status"] = !res.ok
          ? "indisponivel"
          : latencyMs > 1500
          ? "degradado"
          : "operacional";
        return { id, label, status, latencyMs, detail: res.detail, checkedAt };
      } catch (err: any) {
        const latencyMs = Math.max(1, Math.round(performance.now() - start));
        return {
          id,
          label,
          status: "indisponivel",
          latencyMs,
          detail: sanitizeTelemetryText(err?.message || "Falha na ligação", 100),
          checkedAt,
        };
      }
    };

    const [dbCheck, authCheck, storageCheck, siteCheck] = await Promise.all([
      probe("database", "Base de Dados", async () => {
        const { error } = await supabase.from("configuracoes_sistema").select("id").limit(1);
        return error ? { ok: false, detail: error.message } : { ok: true, detail: "PostgreSQL acessível" };
      }),
      probe("auth", "Login e OTP", async () => {
        const { error } = await supabase.auth.getSession();
        return error ? { ok: false, detail: error.message } : { ok: true, detail: "Supabase Auth activo" };
      }),
      probe("storage", "Storage de Fotos", async () => {
        const { error } = await supabase.storage.from("produtos").list("", { limit: 1 });
        return error ? { ok: false, detail: error.message } : { ok: true, detail: "Bucket produtos operacional" };
      }),
      probe("site", "Portal Web", async () => {
        if (typeof window === "undefined" || typeof fetch === "undefined") {
          return { ok: true, detail: "Servidor de aplicação activo" };
        }
        const resp = await fetch(window.location.origin, { method: "HEAD" });
        return resp.ok
          ? { ok: true, detail: `HTTP ${resp.status} disponível` }
          : { ok: false, detail: `HTTP ${resp.status}` };
      }),
    ]);

    return [dbCheck, authCheck, storageCheck, siteCheck];
  }
}

export function createRemoteSyncHandlers(
  orderRepo: SupabaseOrderRepo,
  messageRepo: SupabaseMessageRepo,
  productRepo: SupabaseProductRepo
): RemoteSyncHandlers {
  return {
    createOrder: async (payload: Order) => orderRepo.syncPendingOrder(payload),
    sendMessage: async (payload: MessageItem) => messageRepo.syncPendingMessage(payload),
    createProduct: async (payload: Product) => productRepo.create(payload),
    updateStock: async (payload: { id: string; newStock: number }) =>
      productRepo.updateStock(payload.id, payload.newStock),
  };
}
