import React, { useState } from "react";
import { X, ShieldCheck, Trash2, AlertTriangle } from "lucide-react";

const DeleteConfirmBlock: React.FC<{ onConfirm: () => void }> = ({ onConfirm }) => {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div className="pt-2">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="px-5 py-2.5 rounded-2xl font-black text-xs bg-red-600 text-white flex items-center gap-2 cursor-pointer shadow-md hover:bg-red-700 transition-colors"
        >
          <Trash2 size={15} />
          <span>Eliminar a Minha Conta e Dados Agora</span>
        </button>
      </div>
    );
  }

  return (
    <div className="pt-2 space-y-2">
      <p className="text-xs font-bold text-red-400">
        Confirma a eliminação definitiva do seu perfil, lojas, fotos e registos?
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer"
          style={{ borderColor: "var(--border)" }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-black cursor-pointer"
        >
          Confirmar Eliminação
        </button>
      </div>
    </div>
  );
};

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "privacidade" | "termos" | "eliminacao";
  onDeleteAccountRequested?: () => void;
  isLoggedIn?: boolean;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({
  isOpen,
  onClose,
  initialTab = "privacidade",
  onDeleteAccountRequested,
  isLoggedIn,
}) => {
  const [tab, setTab] = useState<"privacidade" | "termos" | "eliminacao">(initialTab);

  React.useEffect(() => {
    if (isOpen && initialTab) {
      setTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-3 sm:p-5 bg-black/80 backdrop-blur-md anim-fadeUp"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-3xl p-4 sm:p-7 border shadow-2xl anim-pop max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: "var(--surface)",
          borderColor: "var(--border)",
          color: "var(--text-primary)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b mb-3" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-9 h-9 rounded-2xl grid place-items-center shrink-0"
              style={{ backgroundColor: "rgba(36, 107, 253, 0.15)", color: "#246BFD" }}
            >
              <ShieldCheck size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="font-black text-base sm:text-lg truncate">Privacidade & Termos</h2>
              <p className="text-[11px] sm:text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                Protecção de Dados • Legislação Angolana
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full border grid place-items-center hover:bg-slate-500/10 cursor-pointer shrink-0"
            style={{ borderColor: "var(--border)" }}
            aria-label="Fechar janela de privacidade"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div
          className="grid grid-cols-3 gap-1 p-1 rounded-2xl my-3 border text-[11px] sm:text-xs font-bold"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)" }}
        >
          <button
            type="button"
            onClick={() => setTab("privacidade")}
            className={`py-1.5 px-1.5 rounded-xl transition-all cursor-pointer leading-tight text-center ${
              tab === "privacidade" ? "bg-[#246BFD] text-white shadow-sm" : "hover:text-[#246BFD]"
            }`}
          >
            Privacidade
          </button>
          <button
            type="button"
            onClick={() => setTab("termos")}
            className={`py-1.5 px-1.5 rounded-xl transition-all cursor-pointer leading-tight text-center ${
              tab === "termos" ? "bg-[#246BFD] text-white shadow-sm" : "hover:text-[#246BFD]"
            }`}
          >
            Termos de Uso
          </button>
          <button
            type="button"
            onClick={() => setTab("eliminacao")}
            className={`py-1.5 px-1.5 rounded-xl transition-all cursor-pointer leading-tight text-center ${
              tab === "eliminacao" ? "bg-red-600 text-white shadow-sm" : "hover:text-red-500"
            }`}
          >
            Eliminar Conta
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 text-xs sm:text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {tab === "privacidade" && (
            <div className="space-y-3">
              <h3 className="font-black text-sm text-[var(--text-primary)]">
                1. Compromisso de Privacidade e Protecção de Dados
              </h3>
              <p>
                A plataforma <b>Mercado Uíge</b> respeita a sua privacidade. Recolhemos apenas os dados estritamente necessários para permitir a compra, venda e entrega de artigos na província do Uíge, nomeadamente: nome, número de telefone para contacto de entregas, morada/bairro e endereço de e-mail protegido por palavra-passe (com verificação por código apenas no registo e recuperação).
              </p>

              <h3 className="font-black text-sm text-[var(--text-primary)]">
                2. Partilha de Dados nas Encomendas por WhatsApp
              </h3>
              <p>
                Ao confirmar uma encomenda e tocar em <b>"Enviar pedido por WhatsApp"</b>, o teu <b>nome</b>, <b>número de telefone</b>, artigos selecionados, quantidades, total e tipo de entrega serão partilhados directamente com a loja responsável (ou com a linha de apoio oficial do Mercado Uíge caso a loja não tenha WhatsApp válido registado). Esta partilha serve exclusivamente para concluir e entregar o teu pedido.
              </p>

              <h3 className="font-black text-sm text-[var(--text-primary)]">
                3. Segurança em Trânsito e Permissões
              </h3>
              <p>
                Todas as transmissões de dados são cifradas com protocolos seguros. Cada conta tem acesso restrito apenas aos seus próprios dados e encomendas. Nenhum dado pessoal é vendido a terceiros. A aplicação solicita apenas permissões mínimas essenciais: câmara/galeria para fotos, microfone para pesquisa por voz e ligação à Internet.
              </p>
            </div>
          )}

          {tab === "termos" && (
            <div className="space-y-3">
              <h3 className="font-black text-sm text-[var(--text-primary)]">
                1. Publicação Livre e Responsabilidade dos Vendedores
              </h3>
              <p>
                Qualquer utilizador residente na província do Uíge pode abrir uma loja e publicar artigos de forma livre. Cada publicação exige fotografia real do artigo, preço em Kwanzas (Kz), bairro no Uíge e contacto WhatsApp válido. Contas com menos de 24 horas podem publicar até 5 artigos por dia; contas estabelecidas até 30 artigos por dia.
              </p>

              <h3 className="font-black text-sm text-[var(--text-primary)]">
                2. Artigos e Conteúdos Proibidos
              </h3>
              <p>
                É estritamente proibida a publicação de: <b>armas e munições</b>, <b>drogas ou estupefacientes</b>, <b>conteúdo adulto ou exploração</b>, <b>documentos falsos ou falsificações</b>, <b>medicamentos sujeitos a receita médica</b>, bem como <b>câmbio ilícito, notas falsas ou circulação irregular de dinheiro</b>. Publicações com termos proibidos ficam ocultas automaticamente para revisão.
              </p>

              <h3 className="font-black text-sm text-[var(--text-primary)]">
                3. Denúncias, Moderação e Bloqueio de Vendedores
              </h3>
              <p>
                Os utilizadores podem denunciar produtos, lojas ou avaliações abusivas e bloquear vendedores indesejados. Artigos que acumulem 3 denúncias de utilizadores distintos ficam ocultos automaticamente até decisão da administração. O selo <b>Loja verificada</b> é atribuído apenas pela administração. Violações graves resultam em remoção de artigos, suspensão da loja ou banimento definitivo da conta.
              </p>

              <h3 className="font-black text-sm text-[var(--text-primary)]">
                4. Moeda e Pagamentos
              </h3>
              <p>
                Todas as transacções são calculadas na moeda oficial da República de Angola, o Kwanza (Kz), suportando liquidação por Multicaixa Express ou no acto de entrega.
              </p>
            </div>
          )}

          {tab === "eliminacao" && (
            <div className="space-y-4 p-4 rounded-2xl bg-red-500/10 border border-red-500/25">
              <div className="flex items-center gap-2 text-red-500 font-black text-sm">
                <AlertTriangle size={18} />
                <span>Direito ao Esquecimento e Eliminação de Conta (Google Play)</span>
              </div>
              <p>
                Em estrita conformidade com as directrizes de eliminação de contas da Google Play Store, tem o direito de apagar permanentemente a sua conta e todos os dados armazenados (perfil, lojas, artigos, mensagens, fotos e histórico de encomendas).
              </p>

              {isLoggedIn ? (
                <DeleteConfirmBlock
                  onConfirm={() => {
                    onDeleteAccountRequested?.();
                    onClose();
                  }}
                />
              ) : (
                <p className="font-bold text-slate-400">
                  Para eliminar a sua conta dentro da app, inicie sessão primeiro ou envie um pedido para <b>tvvibeoficial@gmail.com</b> com o assunto "Eliminação de Conta Mercado Uíge".
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
