import React from "react";
import { Home, LayoutGrid, Plus, ShoppingCart, User as UserIcon } from "lucide-react";

interface BottomNavProps {
  activeView: string;
  onSelectNav: (view: string) => void;
  cartCount: number;
  embedded?: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeView,
  onSelectNav,
  cartCount,
  embedded = false,
}) => {
  const navItems = [
    { id: "home", label: "Início", icon: Home },
    { id: "categories", label: "Categorias", icon: LayoutGrid },
    { id: "publish", label: "Publicar", icon: Plus },
    { id: "cart", label: "Carrinho", icon: ShoppingCart, isCart: true },
    { id: "profile", label: "Conta", icon: UserIcon },
  ];

  return (
    <nav
      data-testid="mobile-bottom-nav"
      className={`${
        embedded ? "w-full" : "md:hidden fixed bottom-0 inset-x-0 z-40"
      } border-t backdrop-blur-xl transition-colors duration-200 pb-safe pointer-events-auto`}
      style={{
        backgroundColor: "var(--nav-bg)",
        borderColor: "var(--border)",
      }}
    >
      <div className="grid grid-cols-5 items-center h-16 px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            activeView === item.id ||
            (item.id === "profile" &&
              (activeView === "seller" ||
                activeView === "courier" ||
                activeView === "orders" ||
                activeView === "favorites")) ||
            (item.id === "categories" && activeView === "used");

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectNav(item.id)}
              className="flex flex-col items-center justify-center h-full min-h-[44px] py-1 px-0.5 relative cursor-pointer active:scale-95 transition-transform min-w-0"
              title={item.isCart ? "Ver Carrinho de Compras" : item.label}
              aria-label={item.isCart && cartCount > 0 ? `${item.label} (${cartCount})` : item.label}
            >
              <div className="relative flex items-center justify-center">
                <Icon
                  size={20}
                  className="transition-colors duration-200"
                  style={{
                    color: isActive ? "var(--accent)" : "var(--text-secondary)",
                  }}
                />
                {item.isCart && cartCount > 0 && (
                  <span className="absolute -top-2 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center shadow-sm tabular-nums">
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                )}
                {isActive && (
                  <span
                    className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: "var(--accent)" }}
                  />
                )}
              </div>
              <span
                className="text-[10px] font-bold mt-1 transition-colors leading-none truncate max-w-full"
                style={{
                  color: isActive ? "var(--accent)" : "var(--text-secondary)",
                }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
