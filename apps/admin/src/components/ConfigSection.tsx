import React, { useEffect, useState } from "react";
import { Settings, Shield, Users, Save } from "lucide-react";
import {
  BANNER_DURATION_PRESETS,
  SystemConfig,
  User,
  UserRole,
  clampBannerDurationSec,
  formatUserRole,
  isSuperAdminRole,
} from "@mercado-uige/shared";

interface ConfigSectionProps {
  currentUser: User;
  systemConfig: SystemConfig;
  users: User[];
  onRequestSaveConfig: (updates: Partial<SystemConfig>, summaryLabel: string) => void;
  onRequestChangeRole: (targetUser: User, nextRole: UserRole) => void;
}

export const ConfigSection: React.FC<ConfigSectionProps> = ({
  currentUser,
  systemConfig,
  users,
  onRequestSaveConfig,
  onRequestChangeRole,
}) => {
  const [draft, setDraft] = useState<SystemConfig>(systemConfig);
  const [roleSearch, setRoleSearch] = useState("");
  const isSuperAdmin = isSuperAdminRole(currentUser.role);

  useEffect(() => {
    setDraft(systemConfig);
  }, [systemConfig]);

  const teamAndCandidates = users.filter((u) => {
    const q = roleSearch.trim().toLowerCase();
    if (!q) {
      return u.role === "super_admin" || u.role === "admin" || u.role === "moderador" || u.role === "financeiro";
    }
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.code || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 anim-fadeUp text-xs">
      <div className="p-5 rounded-2xl bg-[#172338] border border-[#26354B] space-y-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-black text-base text-white flex items-center gap-2">
              <Settings size={17} className="text-[#B7F34A]" /> Configurações Comerciais e Operacionais
            </h2>
            <p className="text-[#A6B2C5]">
              Preços dos planos por perfil, comissão de entregas, taxas e limites globais guardados no servidor.
            </p>
          </div>
        </div>

        {/* Planos por tipo de perfil */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-[#111D30] border border-[#26354B] space-y-3">
            <span className="font-black text-[#B7F34A] block">Planos: Loja Fixa (Kz / mês)</span>
            <div>
              <label className="block text-[11px] text-[#A6B2C5] mb-1">Plano Básico</label>
              <input
                type="number"
                min="0"
                value={draft.fixedStoreBasicPrice}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    fixedStoreBasicPrice: Number(e.target.value),
                    basicPlanPrice: Number(e.target.value),
                  })
                }
                className="w-full p-2.5 rounded-xl bg-[#172338] border border-[#26354B] text-white font-bold outline-none focus:border-[#246BFD]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#A6B2C5] mb-1">Plano Destaque / VIP</label>
              <input
                type="number"
                min="0"
                value={draft.fixedStoreVipPrice}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    fixedStoreVipPrice: Number(e.target.value),
                    vipPlanPrice: Number(e.target.value),
                  })
                }
                className="w-full p-2.5 rounded-xl bg-[#172338] border border-[#26354B] text-white font-bold outline-none focus:border-[#246BFD]"
              />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#111D30] border border-[#26354B] space-y-3">
            <span className="font-black text-[#246BFD] block">Planos: Vendedor Ambulante (Kz / mês)</span>
            <div>
              <label className="block text-[11px] text-[#A6B2C5] mb-1">Plano Básico</label>
              <input
                type="number"
                min="0"
                value={draft.ambulantBasicPrice}
                onChange={(e) => setDraft({ ...draft, ambulantBasicPrice: Number(e.target.value) })}
                className="w-full p-2.5 rounded-xl bg-[#172338] border border-[#26354B] text-white font-bold outline-none focus:border-[#246BFD]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#A6B2C5] mb-1">Plano Destaque / VIP</label>
              <input
                type="number"
                min="0"
                value={draft.ambulantVipPrice}
                onChange={(e) => setDraft({ ...draft, ambulantVipPrice: Number(e.target.value) })}
                className="w-full p-2.5 rounded-xl bg-[#172338] border border-[#26354B] text-white font-bold outline-none focus:border-[#246BFD]"
              />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#111D30] border border-[#26354B] space-y-3">
            <span className="font-black text-emerald-400 block">Planos: Entregador (Kz / mês)</span>
            <div>
              <label className="block text-[11px] text-[#A6B2C5] mb-1">Plano Básico</label>
              <input
                type="number"
                min="0"
                value={draft.courierBasicPrice}
                onChange={(e) => setDraft({ ...draft, courierBasicPrice: Number(e.target.value) })}
                className="w-full p-2.5 rounded-xl bg-[#172338] border border-[#26354B] text-white font-bold outline-none focus:border-[#246BFD]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#A6B2C5] mb-1">Plano Destaque / VIP</label>
              <input
                type="number"
                min="0"
                value={draft.courierVipPrice}
                onChange={(e) => setDraft({ ...draft, courierVipPrice: Number(e.target.value) })}
                className="w-full p-2.5 rounded-xl bg-[#172338] border border-[#26354B] text-white font-bold outline-none focus:border-[#246BFD]"
              />
            </div>
          </div>
        </div>

        {/* Taxas, Comissões, WhatsApp e Limite de Denúncias */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block font-bold text-[#A6B2C5] mb-1">Taxa de Entrega (Kz)</label>
            <input
              type="number"
              min="0"
              value={draft.defaultDeliveryFee}
              onChange={(e) => setDraft({ ...draft, defaultDeliveryFee: Number(e.target.value) })}
              className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white font-bold outline-none"
            />
          </div>
          <div>
            <label className="block font-bold text-[#A6B2C5] mb-1">Comissão Entregas (%)</label>
            <input
              type="number"
              min="0"
              max="90"
              value={draft.deliveryCommissionPercent}
              onChange={(e) => setDraft({ ...draft, deliveryCommissionPercent: Number(e.target.value) })}
              className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white font-bold outline-none"
            />
          </div>
          <div>
            <label className="block font-bold text-[#A6B2C5] mb-1">Mensalidade Entregador (Kz)</label>
            <input
              type="number"
              min="0"
              value={draft.courierMonthlyFee}
              onChange={(e) => setDraft({ ...draft, courierMonthlyFee: Number(e.target.value) })}
              className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white font-bold outline-none"
            />
          </div>
          <div>
            <label className="block font-bold text-[#A6B2C5] mb-1">WhatsApp de Reserva (Admin)</label>
            <input
              type="tel"
              disabled={!isSuperAdmin}
              value={draft.adminWhatsapp}
              onChange={(e) => setDraft({ ...draft, adminWhatsapp: e.target.value })}
              className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white font-bold outline-none disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block font-bold text-[#A6B2C5] mb-1">Limite Denúncias (Suspensão)</label>
            <input
              type="number"
              min="1"
              max="50"
              disabled={!isSuperAdmin}
              value={draft.autoSuspendReportsThreshold}
              onChange={(e) => setDraft({ ...draft, autoSuspendReportsThreshold: Number(e.target.value) })}
              className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white font-bold outline-none disabled:opacity-50"
            />
          </div>
        </div>

        {/* Moderação de Artigos Publicados */}
        <div className="p-4 rounded-xl bg-[#111D30] border border-[#26354B] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="font-black text-white block">Aprovação prévia de artigos publicados</span>
            <span className="text-[11px] text-[#A6B2C5]">
              Quando activado, novos artigos publicados pelos comerciantes aguardam aprovação antes de aparecer no catálogo.
            </span>
          </div>
          <label className="inline-flex items-center gap-2.5 cursor-pointer shrink-0 select-none">
            <input
              type="checkbox"
              checked={Boolean(draft.requireProductApproval)}
              onChange={(e) => setDraft({ ...draft, requireProductApproval: e.target.checked })}
              className="w-5 h-5 accent-[#B7F34A] cursor-pointer"
            />
            <span className={`font-black ${draft.requireProductApproval ? "text-[#B7F34A]" : "text-[#A6B2C5]"}`}>
              {draft.requireProductApproval ? "Activa" : "Publicação directa"}
            </span>
          </label>
        </div>

        {/* Configuração Global do Carrossel de Banners */}
        <div className="p-4 rounded-xl bg-[#111D30] border border-[#26354B] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="font-black text-white block">Carrossel de Banners (Definição Global)</span>
              <span className="text-[11px] text-[#A6B2C5]">
                A app mobile aplica esta duração padrão e reprodução automática ao abrir e actualiza a cada 5 minutos sem precisar de actualização na loja.
              </span>
            </div>
            <label className="inline-flex items-center gap-2.5 cursor-pointer shrink-0 select-none">
              <input
                type="checkbox"
                checked={draft.bannerAutoplay !== false}
                onChange={(e) => setDraft({ ...draft, bannerAutoplay: e.target.checked })}
                className="w-5 h-5 accent-[#B7F34A] cursor-pointer"
              />
              <span className={`font-black ${draft.bannerAutoplay !== false ? "text-[#B7F34A]" : "text-[#A6B2C5]"}`}>
                {draft.bannerAutoplay !== false ? "Reprodução automática ligada" : "Reprodução automática desligada"}
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-[#A6B2C5] mr-1">Duração padrão:</span>
            {BANNER_DURATION_PRESETS.map((sec) => {
              const selected = clampBannerDurationSec(draft.bannerDefaultDurationSec) === sec;
              return (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setDraft({ ...draft, bannerDefaultDurationSec: sec })}
                  className={`px-3 py-1.5 rounded-lg font-black text-[11px] cursor-pointer ${
                    selected
                      ? "bg-[#246BFD] text-white"
                      : "bg-[#172338] border border-[#26354B] text-[#A6B2C5]"
                  }`}
                >
                  {sec}s
                </button>
              );
            })}
            <div className="flex items-center gap-1.5 ml-auto">
              <label htmlFor="banner-custom-duration" className="text-[11px] text-[#A6B2C5] font-bold">
                Personalizada (3–60s):
              </label>
              <input
                id="banner-custom-duration"
                type="number"
                min={3}
                max={60}
                value={draft.bannerDefaultDurationSec ?? 8}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    bannerDefaultDurationSec: Number(e.target.value),
                  })
                }
                onBlur={(e) =>
                  setDraft({
                    ...draft,
                    bannerDefaultDurationSec: clampBannerDurationSec(Number(e.target.value)),
                  })
                }
                className="w-20 p-2 rounded-lg bg-[#172338] border border-[#26354B] text-white font-bold text-center outline-none focus:border-[#246BFD]"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#26354B]">
          {!isSuperAdmin && (
            <span className="text-[11px] text-[#A6B2C5]">
              Nota: WhatsApp de reserva e limite de denúncias só podem ser alterados pelo Super Admin.
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              const bannerDefaultDurationSec = clampBannerDurationSec(draft.bannerDefaultDurationSec);
              const bannerAutoplay = draft.bannerAutoplay !== false;
              onRequestSaveConfig(
                isSuperAdmin
                  ? {
                      basicPlanPrice: draft.fixedStoreBasicPrice,
                      vipPlanPrice: draft.fixedStoreVipPrice,
                      fixedStoreBasicPrice: draft.fixedStoreBasicPrice,
                      fixedStoreVipPrice: draft.fixedStoreVipPrice,
                      ambulantBasicPrice: draft.ambulantBasicPrice,
                      ambulantVipPrice: draft.ambulantVipPrice,
                      courierBasicPrice: draft.courierBasicPrice,
                      courierVipPrice: draft.courierVipPrice,
                      defaultDeliveryFee: draft.defaultDeliveryFee,
                      deliveryCommissionPercent: draft.deliveryCommissionPercent,
                      courierMonthlyFee: draft.courierMonthlyFee,
                      requireProductApproval: Boolean(draft.requireProductApproval),
                      bannerDefaultDurationSec,
                      bannerAutoplay,
                      adminWhatsapp: draft.adminWhatsapp.trim() || "945379003",
                      autoSuspendReportsThreshold: Math.max(1, draft.autoSuspendReportsThreshold),
                    }
                  : {
                      basicPlanPrice: draft.fixedStoreBasicPrice,
                      vipPlanPrice: draft.fixedStoreVipPrice,
                      fixedStoreBasicPrice: draft.fixedStoreBasicPrice,
                      fixedStoreVipPrice: draft.fixedStoreVipPrice,
                      ambulantBasicPrice: draft.ambulantBasicPrice,
                      ambulantVipPrice: draft.ambulantVipPrice,
                      courierBasicPrice: draft.courierBasicPrice,
                      courierVipPrice: draft.courierVipPrice,
                      defaultDeliveryFee: draft.defaultDeliveryFee,
                      deliveryCommissionPercent: draft.deliveryCommissionPercent,
                      courierMonthlyFee: draft.courierMonthlyFee,
                      requireProductApproval: Boolean(draft.requireProductApproval),
                      bannerDefaultDurationSec,
                      bannerAutoplay,
                    },
                "Preços, comissões, carrossel de banners, moderação de artigos e definições globais do sistema"
              );
            }}
            className="ml-auto px-5 py-2.5 rounded-xl bg-[#B7F34A] text-slate-950 font-black flex items-center gap-2 cursor-pointer"
          >
            <Save size={14} /> Guardar Configurações
          </button>
        </div>
      </div>

      {/* Gestão de Papéis de Equipa (só super_admin) */}
      {isSuperAdmin && (
        <div className="p-5 rounded-2xl bg-[#172338] border border-[#26354B] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-black text-sm text-white flex items-center gap-2">
                <Shield size={16} className="text-[#246BFD]" /> Equipa e Papéis de Acesso (Aplicados por RLS)
              </h3>
              <p className="text-[#A6B2C5]">
                Super Admin (total + Centro de Controlo), Moderador (aprovações, lojas, denúncias), Financeiro (pagamentos, planos, comissões).
              </p>
            </div>
            <input
              type="text"
              value={roleSearch}
              onChange={(e) => setRoleSearch(e.target.value)}
              placeholder="Procurar conta por nome, email ou CL-..."
              className="px-3 py-2 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none focus:border-[#246BFD] sm:w-72"
            />
          </div>

          {teamAndCandidates.length === 0 ? (
            <div className="p-6 text-center rounded-xl bg-[#111D30] border border-[#26354B] text-[#A6B2C5]">
              Nenhuma conta encontrada para gerir papéis.
            </div>
          ) : (
            <div className="space-y-2">
              {teamAndCandidates.slice(0, 15).map((u) => (
                <div
                  key={u.id}
                  className="p-3 rounded-xl bg-[#111D30] border border-[#26354B] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Users size={13} className="text-[#B7F34A] shrink-0" />
                      <span className="font-bold text-white truncate">{u.name}</span>
                      <span className="text-[11px] font-bold text-[#B7F34A]">{u.code || "CL"}</span>
                    </div>
                    <span className="text-[11px] text-[#A6B2C5] block truncate">
                      {u.email} · Papel actual: <strong className="text-white">{formatUserRole(u.role)}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      aria-label={`Alterar papel de ${u.name}`}
                      value={u.role === "admin" ? "super_admin" : u.role}
                      disabled={u.id === currentUser.id}
                      onChange={(e) => onRequestChangeRole(u, e.target.value as UserRole)}
                      className="px-3 py-1.5 rounded-lg bg-[#172338] border border-[#26354B] text-white font-bold outline-none disabled:opacity-50"
                    >
                      <option value="cliente">Cliente</option>
                      <option value="comerciante">Comerciante</option>
                      <option value="entregador">Entregador</option>
                      <option value="moderador">Moderador</option>
                      <option value="financeiro">Financeiro</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
