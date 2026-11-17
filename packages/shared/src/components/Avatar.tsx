import React, { useEffect, useState } from "react";

export interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps["size"]>, string> = {
  xs: "w-7 h-7 text-[11px]",
  sm: "w-9 h-9 text-xs",
  md: "w-11 h-11 text-sm",
  lg: "w-14 h-14 text-base",
  xl: "w-16 h-16 text-lg",
};

function getInitials(name?: string | null): string {
  const clean = (name || "").trim();
  if (!clean) return "MU";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = "md",
  className = "",
}) => {
  const cleanSrc = (src || "").trim();
  const [failed, setFailed] = useState(!cleanSrc);

  useEffect(() => {
    setFailed(!cleanSrc);
  }, [cleanSrc]);

  const sizeCls = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const alt = (name || "Utilizador").trim();

  if (!failed && cleanSrc) {
    return (
      <img
        src={cleanSrc}
        alt={alt}
        onError={() => setFailed(true)}
        className={`${sizeCls} rounded-full object-cover border border-black/15 dark:border-white/15 shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={alt}
      className={`${sizeCls} rounded-full grid place-items-center font-black select-none shrink-0 bg-red-600 text-white border border-black/10 dark:border-white/15 ${className}`}
    >
      {getInitials(name)}
    </div>
  );
};
