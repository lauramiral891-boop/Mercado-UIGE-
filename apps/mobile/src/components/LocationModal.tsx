import React, { useState } from "react";
import { X, MapPin, Check, Search } from "lucide-react";
import { UIGE_MUNICIPALITIES, getBairrosByMunicipality } from "@mercado-uige/shared";

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLocation: string;
  onSelectLocation: (location: string) => void;
}

export const LocationModal: React.FC<LocationModalProps> = ({
  isOpen,
  onClose,
  currentLocation,
  onSelectLocation,
}) => {
  const [tab, setTab] = useState<"municipalities" | "bairros">("municipalities");
  const [selectedMunicipality, setSelectedMunicipality] = useState("Uíge");
  const [filterText, setFilterText] = useState("");

  if (!isOpen) return null;

  const handleSelect = (loc: string) => {
    onSelectLocation(loc);
    onClose();
  };

  const filteredMunicipalities = UIGE_MUNICIPALITIES.filter((m) =>
    m.toLowerCase().includes(filterText.toLowerCase())
  );

  const bairrosForSelected = getBairrosByMunicipality(selectedMunicipality).filter((b) =>
    b.toLowerCase().includes(filterText.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/75 backdrop-blur-sm anim-fadeUp"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl p-4 sm:p-6 border shadow-2xl anim-pop max-h-[90vh] flex flex-col"
        style={{
          backgroundColor: "var(--surface)",
          borderColor: "var(--border)",
          color: "var(--text-primary)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-8 h-8 rounded-xl grid place-items-center shrink-0"
              style={{ backgroundColor: "rgba(36, 107, 253, 0.15)", color: "#246BFD" }}
            >
              <MapPin size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="font-black text-base sm:text-lg leading-tight truncate">Localização no Uíge</h2>
              <p className="text-[11px] sm:text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                Serviço exclusivo para a província do Uíge
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full border grid place-items-center hover:bg-slate-500/10 cursor-pointer shrink-0"
            style={{ borderColor: "var(--border)" }}
            aria-label="Fechar janela de localização"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div
          className="grid grid-cols-2 gap-1 p-1 rounded-2xl my-3 border text-xs font-bold"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-secondary)" }}
        >
          <button
            type="button"
            onClick={() => setTab("municipalities")}
            className={`py-2 px-2 rounded-xl transition-all cursor-pointer text-center ${
              tab === "municipalities" ? "bg-[#246BFD] text-white shadow-sm" : "hover:text-[#246BFD]"
            }`}
          >
            Municípios do Uíge
          </button>
          <button
            type="button"
            onClick={() => setTab("bairros")}
            className={`py-2 px-2 rounded-xl transition-all cursor-pointer text-center ${
              tab === "bairros" ? "bg-[#246BFD] text-white shadow-sm" : "hover:text-[#246BFD]"
            }`}
          >
            Bairros
          </button>
        </div>

        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder={tab === "municipalities" ? "Filtrar município..." : "Filtrar bairro..."}
            className="w-full pl-9 pr-3 py-2 rounded-xl text-xs border bg-transparent outline-none focus:border-[#246BFD]"
            style={{ borderColor: "var(--border)" }}
          />
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 pr-1 space-y-2">
          {tab === "municipalities" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {filteredMunicipalities.map((municipality) => {
                const label = `${municipality}, Uíge`;
                const isSelected = currentLocation.includes(municipality);
                return (
                  <button
                    key={municipality}
                    type="button"
                    onClick={() => {
                      setSelectedMunicipality(municipality);
                      handleSelect(label);
                    }}
                    className={`flex items-center justify-between p-2.5 rounded-xl text-xs font-bold border transition-colors text-left cursor-pointer ${
                      isSelected
                        ? "bg-[#246BFD]/15 border-[#246BFD] text-[#246BFD]"
                        : "border-[var(--border)] hover:border-[#246BFD]"
                    }`}
                  >
                    <span className="truncate">{municipality}</span>
                    {isSelected && <Check size={14} className="text-[#246BFD] shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {tab === "bairros" && (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold mb-1" style={{ color: "var(--text-secondary)" }}>
                  Município
                </label>
                <select
                  value={selectedMunicipality}
                  onChange={(e) => setSelectedMunicipality(e.target.value)}
                  className="w-full p-2.5 rounded-xl border text-xs outline-none cursor-pointer"
                  style={{
                    borderColor: "var(--border)",
                    backgroundColor: "var(--surface-secondary)",
                    color: "var(--text-primary)",
                  }}
                >
                  {UIGE_MUNICIPALITIES.map((m) => (
                    <option key={m} value={m} className="bg-slate-900 text-white">
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {bairrosForSelected.map((bairro) => {
                  const label = `${selectedMunicipality}, ${bairro}`;
                  const isSelected = currentLocation === label;
                  return (
                    <button
                      key={bairro}
                      type="button"
                      onClick={() => handleSelect(label)}
                      className={`flex items-center justify-between p-2.5 rounded-xl text-xs font-bold border transition-colors text-left cursor-pointer ${
                        isSelected
                          ? "bg-[#246BFD]/15 border-[#246BFD] text-[#246BFD]"
                          : "border-[var(--border)] hover:border-[#246BFD]"
                      }`}
                    >
                      <span className="truncate">{bairro}</span>
                      {isSelected && <Check size={14} className="text-[#246BFD] shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
