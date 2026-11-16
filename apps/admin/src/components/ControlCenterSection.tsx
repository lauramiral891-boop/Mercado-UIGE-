import React, { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Ban,
  Bug,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Globe,
  HardDrive,
  Lock,
  Mail,
  Power,
  RefreshCw,
  ShieldAlert,
  Store as StoreIcon,
  Trash2,
} from "lucide-react";
import {
  AppErrorRecord,
  NocHistorySample,
  NocServiceCheck,
  Store,
  SystemConfig,
  SystemEvent,
  SystemHealthMetrics,
  User,
  fmtDateTime,
  isSuperAdminRole,
} from "@mercado-uige/shared";
import { PaginationBar, TableToolbar } from "./TableControls";
import { downloadCsv } from "../lib/adminHelpers";
import {
  OperationTiming,
  classifySocRule,
  computeItomUsage,
  findSocBlockTargets,
  formatBytes,
} from "../lib/controlCenterHelpers";

type ControlSubTab = "comando" | "noc" | "soc" | "itom" | "observabilidade";

interface ControlCenterSectionProps {
  currentUser: User;
  systemConfig: SystemConfig;
  nocChecks: NocServiceCheck[];
  nocHistory: NocHistorySample[];
  nocRunning: boolean;
  systemEvents: SystemEvent[];
  metrics: SystemHealthMetrics;
  appErrors: AppErrorRecord[];
  operationTimings: OperationTiming[];
  users: User[];
  stores: Store[];
  onRunNocChecks: () => Promise<void>;
  onRefreshMetrics: () => Promise<void>;
  onRequestToggleMaintenance: (nextMode: boolean, message: string) => void;
  onResolveSystemEvent: (event: SystemEvent) => void;
  onBlockUserFromSoc: (user: User, event: SystemEvent) => void;
  onSuspendStoreFromSoc: (store: Store, event: SystemEvent) => void;
  onRequestClearAppErrors: () => void;
}

const SERVICE_ICONS: Record<NocServiceCheck["id"], React.ComponentType<{ size?: number; className?: string }>> = {
  database: Database,
  auth: Mail,
  storage: HardDrive,
  site: Globe,
};

function statusDotClass(status: NocServiceCheck["status"]): string {
  if (status === "operacional") return "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.75)]";
  if (status === "degradado") return "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.75)]";
  return "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.85)]";
}

function statusBadgeLabel(status: NocServiceCheck["status"]): string {
  if (status === "operacional") return "Operacional";
  if (status === "degradado") return "Degradado";
  return "Indisponível";
}

function severityPillClass(sev: SystemEvent["severity"]): string {
  if (sev === "critica") return "bg-red-500/20 text-red-300 border-red-500/30";
  if (sev === "alta") return "bg-amber-500/20 text-amber-300 border-amber-500/30";
  if (sev === "aviso") return "bg-[#246BFD]/20 text-blue-200 border-[#246BFD]/30";
  return "bg-slate-700/40 text-slate-300 border-slate-600/40";
}

export const ControlCenterSection: React.FC<ControlCenterSectionProps> = ({
  currentUser,
  systemConfig,
  nocChecks,
  nocHistory,
  nocRunning,
  systemEvents,
  metrics,
  appErrors,
  operationTimings,
  users,
  stores,
  onRunNocChecks,
  onRefreshMetrics,
  onRequestToggleMaintenance,
  onResolveSystemEvent,
  onBlockUserFromSoc,
  onSuspendStoreFromSoc,
  onRequestClearAppErrors,
}) => {
  const [subTab, setSubTab] = useState<ControlSubTab>("comando");
  const [maintenanceDraftMsg, setMaintenanceDraftMsg] = useState(
    systemConfig.maintenanceMessage ||
      "Estamos em manutenção programada para melhorar o Mercado Uíge. Voltamos em breve."
  );

  // SOC filters
  const [socSearch, setSocSearch] = useState("");
  const [socSeverity, setSocSeverity] = useState("todas");
  const [socStateFilter, setSocStateFilter] = useState("abertos");
  const [socPage, setSocPage] = useState(1);
  const [socPageSize, setSocPageSize] = useState(10);

  // Observability filters
  const [errSearch, setErrSearch] = useState("");
  const [errScreenFilter, setErrScreenFilter] = useState("todos");

  const itomReport = useMemo(() => computeItomUsage(metrics), [metrics]);
  const openEvents = useMemo(() => systemEvents.filter((e) => !e.resolved), [systemEvents]);

  const filteredSoc = useMemo(() => {
    const q = socSearch.trim().toLowerCase();
    return systemEvents.filter((ev) => {
      if (socSeverity !== "todas" && ev.severity !== socSeverity) return false;
      if (socStateFilter === "abertos" && ev.resolved) return false;
      if (socStateFilter === "resolvidos" && !ev.resolved) return false;
      if (q) {
        return (
          ev.type.toLowerCase().includes(q) ||
          ev.detail.toLowerCase().includes(q) ||
          (ev.userEmail || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [systemEvents, socSearch, socSeverity, socStateFilter]);

  const pagedSoc = useMemo(
    () => filteredSoc.slice((socPage - 1) * socPageSize, socPage * socPageSize),
    [filteredSoc, socPage, socPageSize]
  );

  const uniqueErrorScreens = useMemo(
    () => Array.from(new Set(appErrors.map((e) => e.screen))).sort(),
    [appErrors]
  );

  const filteredErrors = useMemo(() => {
    const q = errSearch.trim().toLowerCase();
    return appErrors.filter((er) => {
      if (errScreenFilter !== "todos" && er.screen !== errScreenFilter) return false;
      if (q) {
        return (
          er.screen.toLowerCase().includes(q) ||
          er.message.toLowerCase().includes(q) ||
          er.source.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [appErrors, errSearch, errScreenFilter]);

  const authNoc = nocChecks.find((c) => c.id === "auth");
  const otpFailuresLast24h = useMemo(() => {
    const cutoff = Date.now() - 24 * 3_600_000;
    return systemEvents.filter(
      (ev) =>
        new Date(ev.createdAt).getTime() >= cutoff &&
        (ev.type.includes("OTP") || ev.type.includes("LOGIN"))
    ).length;
  }, [systemEvents]);

  const ruleAlertsSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ev of openEvents) {
      const { ruleName } = classifySocRule(ev);
      counts[ruleName] = (counts[ruleName] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [openEvents]);

  if (!isSuperAdminRole(currentUser.role)) {
    return (
      <div className="p-8 rounded-2xl bg-[#172338] border border-red-500/30 text-center space-y-2 text-xs">
        <Lock size={24} className="mx-auto text-red-400" />
        <h2 className="text-sm font-black text-white">Acesso Restrito ao Super Admin</h2>
        <p className="text-[#A6B2C5]">
          O Centro de Controlo (NOC, SOC, ITOM e Observabilidade) está protegido por papel e RLS.
        </p>
      </div>
    );
  }

  const maintenanceActive = Boolean(systemConfig.maintenanceMode);

  return (
    <div className="space-y-5 anim-fadeUp text-xs">
      {/* Barra de Navegação Interna do Centro de Controlo */}
      <div className="p-2 rounded-2xl bg-[#172338] border border-[#26354B] flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: "comando", label: "Centro de Comando", icon: Power },
            { id: "noc", label: "NOC (Semáforos)", icon: Activity },
            {
              id: "soc",
              label: openEvents.length > 0 ? `SOC (${openEvents.length})` : "SOC (Segurança)",
              icon: ShieldAlert,
            },
            { id: "itom", label: "ITOM (Recursos)", icon: Cpu },
            {
              id: "observabilidade",
              label: appErrors.length > 0 ? `Observabilidade (${appErrors.length})` : "Observabilidade",
              icon: Bug,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id as ControlSubTab)}
                className={`px-3.5 py-2 rounded-xl font-black flex items-center gap-1.5 cursor-pointer transition-colors ${
                  active
                    ? "bg-[#246BFD] text-white"
                    : "bg-[#111D30] text-[#A6B2C5] hover:text-white border border-[#26354B]"
                }`}
              >
                <Icon size={14} className={active ? "text-[#B7F34A]" : ""} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            onRunNocChecks();
            onRefreshMetrics();
          }}
          disabled={nocRunning}
          className="px-3.5 py-2 rounded-xl bg-[#B7F34A] text-slate-950 font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
        >
          <RefreshCw size={14} className={nocRunning ? "animate-spin" : ""} />
          <span>{nocRunning ? "A sondar serviços..." : "Testar Serviços Agora"}</span>
        </button>
      </div>

      {/* 1. CENTRO DE COMANDO */}
      {subTab === "comando" && (
        <div className="space-y-5">
          {/* 4 Semáforos NOC */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {nocChecks.map((check) => {
              const Icon = SERVICE_ICONS[check.id];
              return (
                <div
                  key={check.id}
                  className="p-4 rounded-2xl bg-[#172338] border border-[#26354B] flex flex-col justify-between gap-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon size={16} className="text-[#246BFD]" />
                      <span className="font-black text-sm text-white">{check.label}</span>
                    </div>
                    <span className={`w-3 h-3 rounded-full ${statusDotClass(check.status)}`} />
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <span className="font-bold text-slate-200 block">{statusBadgeLabel(check.status)}</span>
                      <span className="text-[11px] text-[#A6B2C5]">{check.detail}</span>
                    </div>
                    <span className="font-black text-base text-[#B7F34A] tabular-nums">{check.latencyMs} ms</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            {/* Interruptor Modo de Manutenção */}
            <div className="xl:col-span-5 p-5 rounded-2xl bg-[#172338] border border-[#26354B] space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-black text-sm text-white flex items-center gap-2">
                    <Power size={16} className={maintenanceActive ? "text-amber-400" : "text-[#B7F34A]"} />
                    Interruptor de Modo de Manutenção
                  </h3>
                  <p className="text-[#A6B2C5] mt-0.5">
                    Pausa novas encomendas e informa os clientes enquanto realizas manutenção crítica.
                  </p>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-lg font-black uppercase text-[10px] ${
                    maintenanceActive ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-400"
                  }`}
                >
                  {maintenanceActive ? "Manutenção Activa" : "Sistema Normal"}
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-[#A6B2C5]">Mensagem pública de manutenção</label>
                <textarea
                  rows={3}
                  value={maintenanceDraftMsg}
                  onChange={(e) => setMaintenanceDraftMsg(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-[#111D30] border border-[#26354B] text-white outline-none focus:border-[#246BFD]"
                />
              </div>

              <button
                type="button"
                onClick={() => onRequestToggleMaintenance(!maintenanceActive, maintenanceDraftMsg.trim())}
                className={`w-full py-2.5 rounded-xl font-black cursor-pointer flex items-center justify-center gap-2 ${
                  maintenanceActive
                    ? "bg-emerald-500 text-slate-950"
                    : "bg-amber-400 text-slate-950"
                }`}
              >
                <Power size={15} />
                {maintenanceActive ? "Desactivar Modo de Manutenção" : "Activar Modo de Manutenção"}
              </button>
            </div>

            {/* Alertas Abertos */}
            <div className="xl:col-span-7 p-5 rounded-2xl bg-[#172338] border border-[#26354B] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-black text-sm text-white flex items-center gap-2">
                    <ShieldAlert size={16} className="text-red-400" /> Alertas Abertos (SOC &amp; Limites ITOM)
                  </h3>
                  <p className="text-[#A6B2C5]">Eventos de segurança por resolver e avisos de capacidade.</p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-[#111D30] border border-[#26354B] font-black text-[#B7F34A] tabular-nums">
                  {openEvents.length + itomReport.warnings.length}
                </span>
              </div>

              {openEvents.length === 0 && itomReport.warnings.length === 0 ? (
                <div className="p-6 rounded-xl bg-[#111D30] border border-[#26354B] text-center text-[#A6B2C5] flex flex-col items-center gap-2">
                  <CheckCircle2 size={20} className="text-emerald-400" />
                  <span>Sem alertas críticos abertos neste momento.</span>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {itomReport.warnings.map((w, i) => (
                    <div
                      key={`warn-${i}`}
                      className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex items-center justify-between gap-2"
                    >
                      <span className="font-bold flex items-center gap-2">
                        <AlertTriangle size={14} className="shrink-0" /> {w}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSubTab("itom")}
                        className="px-2.5 py-1 rounded-lg bg-[#111D30] text-amber-300 font-bold cursor-pointer shrink-0"
                      >
                        Ver ITOM
                      </button>
                    </div>
                  ))}

                  {openEvents.slice(0, 10).map((ev) => (
                    <div
                      key={ev.id}
                      className="p-3 rounded-xl bg-[#111D30] border border-[#26354B] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded border text-[10px] font-black uppercase ${severityPillClass(ev.severity)}`}>
                            {ev.severity}
                          </span>
                          <span className="font-bold text-white truncate">{ev.type}</span>
                        </div>
                        <p className="text-[#A6B2C5] truncate mt-1">{ev.detail}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSubTab("soc")}
                        className="px-2.5 py-1.5 rounded-lg bg-[#246BFD]/15 border border-[#246BFD]/30 text-blue-200 font-bold cursor-pointer shrink-0"
                      >
                        Gerir no SOC
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. NOC — SEMÁFOROS + HISTÓRICO 24H */}
      {subTab === "noc" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {nocChecks.map((check) => {
              const Icon = SERVICE_ICONS[check.id];
              return (
                <div key={check.id} className="p-4 rounded-2xl bg-[#172338] border border-[#26354B] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-white flex items-center gap-2">
                      <Icon size={16} className="text-[#246BFD]" /> {check.label}
                    </span>
                    <span className={`w-3 h-3 rounded-full ${statusDotClass(check.status)}`} />
                  </div>
                  <div className="text-2xl font-black text-[#B7F34A] tabular-nums">{check.latencyMs} ms</div>
                  <p className="text-[11px] text-[#A6B2C5]">
                    {statusBadgeLabel(check.status)} · {check.detail}
                  </p>
                  <p className="text-[10px] text-slate-400">Verificado em {fmtDateTime(check.checkedAt)}</p>
                </div>
              );
            })}
          </div>

          <div className="p-5 rounded-2xl bg-[#172338] border border-[#26354B] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm text-white flex items-center gap-2">
                  <Clock size={15} className="text-[#B7F34A]" /> Histórico de Disponibilidade e Latência (Últimas 24h)
                </h3>
                <p className="text-[#A6B2C5]">
                  Amostras reais recolhidas pelas sondas NOC do painel administrativo.
                </p>
              </div>
              <span className="font-black text-white tabular-nums">{nocHistory.length} registos</span>
            </div>

            {nocHistory.length === 0 ? (
              <div className="p-6 rounded-xl bg-[#111D30] border border-[#26354B] text-center text-[#A6B2C5]">
                Ainda sem amostras de histórico. Carrega em "Testar Serviços Agora" para registar.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#111D30] text-[#A6B2C5] uppercase font-bold">
                    <tr>
                      <th className="p-3">Data / Hora</th>
                      <th className="p-3">Estado Global</th>
                      <th className="p-3">Latência Média</th>
                      <th className="p-3">BD</th>
                      <th className="p-3">Auth</th>
                      <th className="p-3">Storage</th>
                      <th className="p-3">Site</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#26354B]">
                    {[...nocHistory].reverse().slice(0, 20).map((sample, idx) => (
                      <tr key={`${sample.timestamp}-${idx}`} className="hover:bg-[#111D30]/40">
                        <td className="p-3 text-[#A6B2C5] whitespace-nowrap">{fmtDateTime(sample.timestamp)}</td>
                        <td className="p-3 font-bold text-white capitalize">{statusBadgeLabel(sample.overallStatus)}</td>
                        <td className="p-3 font-black text-[#B7F34A] tabular-nums">{sample.avgLatencyMs} ms</td>
                        <td className="p-3 tabular-nums text-white">{sample.checks.database} ms</td>
                        <td className="p-3 tabular-nums text-white">{sample.checks.auth} ms</td>
                        <td className="p-3 tabular-nums text-white">{sample.checks.storage} ms</td>
                        <td className="p-3 tabular-nums text-white">{sample.checks.site} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. SOC — EVENTOS DE SEGURANÇA + BLOQUEIO DIRECTO */}
      {subTab === "soc" && (
        <div className="space-y-4">
          {ruleAlertsSummary.length > 0 && (
            <div className="p-4 rounded-2xl bg-[#172338] border border-amber-500/30 space-y-2">
              <span className="font-black text-white flex items-center gap-2">
                <ShieldAlert size={15} className="text-amber-400" /> Regras Activas com Ocorrências Abertas
              </span>
              <div className="flex flex-wrap gap-2">
                {ruleAlertsSummary.map(([rule, count]) => (
                  <span
                    key={rule}
                    className="px-3 py-1 rounded-lg bg-[#111D30] border border-[#26354B] text-[11px] font-bold text-amber-200"
                  >
                    {rule}: <strong className="text-[#B7F34A]">{count}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          <TableToolbar
            title="SOC — Centro de Operações de Segurança (RLS só Super Admin)"
            subtitle="Logins falhados, pedidos excessivos de OTP, tentativas de alterar papel, aprovações, suspensões e encomendas anormais."
            search={socSearch}
            onSearchChange={(v) => {
              setSocSearch(v);
              setSocPage(1);
            }}
            searchPlaceholder="Pesquisar por tipo de evento, email ou detalhe..."
            filterValue={socSeverity}
            onFilterChange={(v) => {
              setSocSeverity(v);
              setSocPage(1);
            }}
            filterOptions={[
              { value: "todas", label: "Todas as gravidades" },
              { value: "critica", label: "Crítica" },
              { value: "alta", label: "Alta" },
              { value: "aviso", label: "Aviso" },
              { value: "info", label: "Informação" },
            ]}
            secondFilterValue={socStateFilter}
            onSecondFilterChange={(v) => {
              setSocStateFilter(v);
              setSocPage(1);
            }}
            secondFilterOptions={[
              { value: "abertos", label: "Alertas Abertos" },
              { value: "resolvidos", label: "Resolvidos" },
              { value: "todos", label: "Todos" },
            ]}
            onExportCsv={() =>
              downloadCsv(
                "soc-eventos-mercado-uige",
                ["Data", "Gravidade", "Tipo", "Regra", "Utilizador", "Detalhe", "Estado"],
                filteredSoc.map((ev) => [
                  fmtDateTime(ev.createdAt),
                  ev.severity,
                  ev.type,
                  classifySocRule(ev).ruleName,
                  ev.userEmail || ev.userId || "sistema",
                  ev.detail,
                  ev.resolved ? "Resolvido" : "Aberto",
                ])
              )
            }
            totalFiltered={filteredSoc.length}
          />

          {pagedSoc.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-[#172338] border border-[#26354B] text-[#A6B2C5]">
              Nenhum evento de segurança encontrado para estes filtros.
            </div>
          ) : (
            <div className="space-y-2.5">
              {pagedSoc.map((ev) => {
                const rule = classifySocRule(ev);
                const { targetUser, targetStore } = findSocBlockTargets(ev, users, stores);
                return (
                  <div
                    key={ev.id}
                    className="p-4 rounded-2xl bg-[#172338] border border-[#26354B] flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 rounded border text-[10px] font-black uppercase ${severityPillClass(ev.severity)}`}>
                          {ev.severity}
                        </span>
                        <span className="font-black text-white">{ev.type}</span>
                        <span className="text-[11px] text-[#246BFD] font-bold">{rule.ruleName}</span>
                      </div>
                      <p className="text-slate-200">{ev.detail}</p>
                      <p className="text-[11px] text-[#A6B2C5]">
                        Utilizador: <strong className="text-white">{ev.userEmail || ev.userId || "Desconhecido"}</strong> ·{" "}
                        {fmtDateTime(ev.createdAt)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {targetUser && !targetUser.isSuspended && targetUser.id !== currentUser.id && (
                        <button
                          type="button"
                          onClick={() => onBlockUserFromSoc(targetUser, ev)}
                          className="px-3 py-1.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500 hover:text-white font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Ban size={13} /> Bloquear Conta
                        </button>
                      )}
                      {targetStore && !targetStore.isSuspended && (
                        <button
                          type="button"
                          onClick={() => onSuspendStoreFromSoc(targetStore, ev)}
                          className="px-3 py-1.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500 hover:text-white font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <StoreIcon size={13} /> Suspender Loja
                        </button>
                      )}
                      {!ev.resolved ? (
                        <button
                          type="button"
                          onClick={() => onResolveSystemEvent(ev)}
                          className="px-3 py-1.5 rounded-xl bg-[#B7F34A] text-slate-950 font-black flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCircle2 size={13} /> Resolver
                        </button>
                      ) : (
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 font-bold">
                          Resolvido
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <PaginationBar
            page={socPage}
            pageSize={socPageSize}
            totalItems={filteredSoc.length}
            onPageChange={setSocPage}
            onPageSizeChange={(n) => {
              setSocPageSize(n);
              setSocPage(1);
            }}
          />
        </div>
      )}

      {/* 4. ITOM — CAPACIDADE, UTILIZADORES, EMAILS E PAGAMENTOS */}
      {subTab === "itom" && (
        <div className="space-y-5">
          {itomReport.warnings.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 space-y-1.5">
              <span className="font-black text-amber-300 flex items-center gap-2">
                <AlertTriangle size={15} /> Avisos de Limite do Plano Grátis Supabase
              </span>
              {itomReport.warnings.map((w, i) => (
                <p key={i} className="text-amber-100">
                  • {w}
                </p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Base de Dados */}
            <div className="p-5 rounded-2xl bg-[#172338] border border-[#26354B] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-black text-white flex items-center gap-2">
                  <Database size={16} className="text-[#246BFD]" /> Base de Dados
                </span>
                <span
                  className={`font-black tabular-nums ${
                    itomReport.dbLevel === "critico"
                      ? "text-red-400"
                      : itomReport.dbLevel === "atencao"
                      ? "text-amber-400"
                      : "text-[#B7F34A]"
                  }`}
                >
                  {itomReport.dbPercent}%
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-[#111D30] overflow-hidden">
                <div
                  className={`h-full ${
                    itomReport.dbLevel === "critico"
                      ? "bg-red-500"
                      : itomReport.dbLevel === "atencao"
                      ? "bg-amber-400"
                      : "bg-[#246BFD]"
                  }`}
                  style={{ width: `${Math.max(2, itomReport.dbPercent)}%` }}
                />
              </div>
              <p className="text-[#A6B2C5]">
                <strong className="text-white">{formatBytes(metrics.dbBytes)}</strong> de 500 MB (Plano Grátis)
              </p>
            </div>

            {/* Storage Fotos */}
            <div className="p-5 rounded-2xl bg-[#172338] border border-[#26354B] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-black text-white flex items-center gap-2">
                  <HardDrive size={16} className="text-[#B7F34A]" /> Storage de Fotos
                </span>
                <span
                  className={`font-black tabular-nums ${
                    itomReport.storageLevel === "critico"
                      ? "text-red-400"
                      : itomReport.storageLevel === "atencao"
                      ? "text-amber-400"
                      : "text-[#B7F34A]"
                  }`}
                >
                  {itomReport.storagePercent}%
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-[#111D30] overflow-hidden">
                <div
                  className={`h-full ${
                    itomReport.storageLevel === "critico"
                      ? "bg-red-500"
                      : itomReport.storageLevel === "atencao"
                      ? "bg-amber-400"
                      : "bg-[#B7F34A]"
                  }`}
                  style={{ width: `${Math.max(2, itomReport.storagePercent)}%` }}
                />
              </div>
              <p className="text-[#A6B2C5]">
                <strong className="text-white">{formatBytes(metrics.storageBytes)}</strong> ({metrics.storageFiles} ficheiros) de 1 GB
              </p>
            </div>

            {/* Utilizadores Activos */}
            <div className="p-5 rounded-2xl bg-[#172338] border border-[#26354B] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-black text-white">Utilizadores Activos</span>
                <span className="font-black text-[#B7F34A] tabular-nums">{itomReport.usersPercent}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-[#111D30] overflow-hidden">
                <div className="h-full bg-emerald-400" style={{ width: `${Math.max(2, itomReport.usersPercent)}%` }} />
              </div>
              <p className="text-[#A6B2C5]">
                <strong className="text-white">{metrics.totalUsers}</strong> contas registadas (limite 50.000 MAU)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-[#172338] border border-[#26354B] space-y-2">
              <h4 className="font-black text-sm text-white flex items-center gap-2">
                <Mail size={15} className="text-[#246BFD]" /> Estado dos E-mails e Códigos OTP
              </h4>
              <p className="text-[#A6B2C5]">
                Serviço Auth: <strong className="text-white">{authNoc ? statusBadgeLabel(authNoc.status) : "A verificar"}</strong>{" "}
                ({authNoc?.latencyMs ?? 0} ms)
              </p>
              <p className="text-[#A6B2C5]">
                Ocorrências Auth/OTP nas últimas 24h:{" "}
                <strong className={otpFailuresLast24h > 0 ? "text-amber-300" : "text-emerald-400"}>
                  {otpFailuresLast24h}
                </strong>
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#172338] border border-[#26354B] space-y-2">
              <h4 className="font-black text-sm text-white">Volume Operacional &amp; Pagamentos Pendentes</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <div className="p-2.5 rounded-xl bg-[#111D30]">
                  <span className="text-[10px] text-[#A6B2C5] block">Lojas</span>
                  <strong className="text-base text-white tabular-nums">{metrics.storesCount}</strong>
                </div>
                <div className="p-2.5 rounded-xl bg-[#111D30]">
                  <span className="text-[10px] text-[#A6B2C5] block">Artigos</span>
                  <strong className="text-base text-white tabular-nums">{metrics.productsCount}</strong>
                </div>
                <div className="p-2.5 rounded-xl bg-[#111D30]">
                  <span className="text-[10px] text-[#A6B2C5] block">Encomendas</span>
                  <strong className="text-base text-white tabular-nums">{metrics.ordersCount}</strong>
                </div>
                <div className="p-2.5 rounded-xl bg-[#111D30]">
                  <span className="text-[10px] text-[#A6B2C5] block">Comprovativos</span>
                  <strong className="text-base text-amber-400 tabular-nums">{metrics.pendingPayments}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. OBSERVABILIDADE — ERROS AGRUPADOS E TEMPOS DE OPERAÇÃO */}
      {subTab === "observabilidade" && (
        <div className="space-y-5">
          {/* Tempos medidos das operações principais */}
          <div className="p-5 rounded-2xl bg-[#172338] border border-[#26354B] space-y-3">
            <h3 className="font-black text-sm text-white flex items-center gap-2">
              <Clock size={15} className="text-[#B7F34A]" /> Tempos das Operações Principais (Sessão Actual)
            </h3>
            {operationTimings.length === 0 ? (
              <p className="text-[#A6B2C5]">Ainda sem medições registadas nesta sessão.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {operationTimings.slice(0, 8).map((op) => (
                  <div key={op.id} className="p-3 rounded-xl bg-[#111D30] border border-[#26354B]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-white truncate">{op.operation}</span>
                      <span className={op.ok ? "text-[#B7F34A] font-black tabular-nums" : "text-red-400 font-black tabular-nums"}>
                        {op.durationMs} ms
                      </span>
                    </div>
                    <span className="text-[10px] text-[#A6B2C5]">{fmtDateTime(op.recordedAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex-1 min-w-[240px]">
              <TableToolbar
                title="Observabilidade de Erros (Agrupados por Ecrã)"
                subtitle="Capturados via ErrorBoundary e falhas de pedidos com higienização de dados sensíveis e limite de taxa."
                search={errSearch}
                onSearchChange={setErrSearch}
                searchPlaceholder="Pesquisar por ecrã, origem ou mensagem..."
                filterValue={errScreenFilter}
                onFilterChange={setErrScreenFilter}
                filterOptions={[
                  { value: "todos", label: "Todos os ecrãs" },
                  ...uniqueErrorScreens.map((sc) => ({ value: sc, label: sc })),
                ]}
                onExportCsv={() =>
                  downloadCsv(
                    "observabilidade-erros",
                    ["Ecrã", "Origem", "Mensagem", "Contagem", "Duração (ms)", "Última ocorrência"],
                    filteredErrors.map((e) => [
                      e.screen,
                      e.source,
                      e.message,
                      e.count,
                      e.durationMs ?? "",
                      fmtDateTime(e.lastOccurredAt),
                    ])
                  )
                }
                totalFiltered={filteredErrors.length}
              />
            </div>
          </div>

          {appErrors.length > 0 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onRequestClearAppErrors}
                className="px-3.5 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 size={14} /> Limpar Registos de Erros
              </button>
            </div>
          )}

          {filteredErrors.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-[#172338] border border-[#26354B] text-[#A6B2C5]">
              Nenhum erro registado. Todas as operações correm dentro da normalidade.
            </div>
          ) : (
            <div className="rounded-2xl border border-[#26354B] bg-[#172338] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#111D30] text-[#A6B2C5] uppercase font-bold">
                    <tr>
                      <th className="p-3.5">Ecrã</th>
                      <th className="p-3.5">Origem</th>
                      <th className="p-3.5">Mensagem Sanitizada</th>
                      <th className="p-3.5">Contagem</th>
                      <th className="p-3.5">Duração</th>
                      <th className="p-3.5">Última Ocorrência</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#26354B]">
                    {filteredErrors.map((er) => (
                      <tr key={er.id} className="hover:bg-[#111D30]/40">
                        <td className="p-3.5 font-black text-[#B7F34A] whitespace-nowrap">{er.screen}</td>
                        <td className="p-3.5 text-[#246BFD] font-bold whitespace-nowrap">{er.source}</td>
                        <td className="p-3.5 text-white">{er.message}</td>
                        <td className="p-3.5 font-black text-amber-300 tabular-nums">{er.count}</td>
                        <td className="p-3.5 text-[#A6B2C5] tabular-nums">
                          {typeof er.durationMs === "number" ? `${er.durationMs} ms` : "—"}
                        </td>
                        <td className="p-3.5 text-[#A6B2C5] whitespace-nowrap">{fmtDateTime(er.lastOccurredAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
