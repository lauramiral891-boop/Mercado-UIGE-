import React, { useState, useEffect } from "react";
import { Store as StoreIcon, Package } from "lucide-react";

interface SafeImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
  fallbackType?: "product" | "store";
  fallbackLabel?: string;
  fallbackText?: string;
  fallbackIcon?: React.ReactNode;
}

export const SafeImage: React.FC<SafeImageProps> = ({
  src,
  alt,
  className = "",
  loading = "lazy",
  fallbackType = "product",
  fallbackLabel,
  fallbackText,
  fallbackIcon,
}) => {
  const [failed, setFailed] = useState(!src || !src.trim());

  useEffect(() => {
    setFailed(!src || !src.trim());
  }, [src]);

  if (failed || !src) {
    const Icon = fallbackType === "store" ? StoreIcon : Package;
    const label = fallbackText ?? fallbackLabel ?? (fallbackIcon ? "" : "Sem fotografia");

    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 bg-slate-900/60 text-slate-400 select-none ${className}`}
        role="img"
        aria-label={alt}
      >
        {fallbackIcon || <Icon size={24} className="text-[#246BFD] opacity-75 shrink-0" />}
        {label && (
          <span className="text-[10px] font-semibold opacity-80 px-1 text-center leading-tight">
            {label}
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => setFailed(true)}
    />
  );
};
