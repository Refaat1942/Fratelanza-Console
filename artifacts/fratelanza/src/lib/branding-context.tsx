import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type Branding = {
  brandName: string;
  tagline: string;
  logoDataUrl: string | null;
  accentHsl: string; // e.g. "195 100% 50%"
};

const DEFAULT: Branding = {
  brandName: "FRATELANZA",
  tagline: "Management Console",
  logoDataUrl: null,
  accentHsl: "195 100% 50%",
};

const STORAGE_KEY = "fratelanza.branding";

type Ctx = Branding & {
  setBranding: (b: Partial<Branding>) => void;
  resetBranding: () => void;
};

const BrandingContext = createContext<Ctx | undefined>(undefined);

function load(): Branding {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT, ...parsed };
  } catch { return DEFAULT; }
}

function applyAccent(hsl: string) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--primary", hsl);
  document.documentElement.style.setProperty("--ring", hsl);
  document.documentElement.style.setProperty("--sidebar-primary", hsl);
  document.documentElement.style.setProperty("--sidebar-ring", hsl);
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Branding>(() => load());

  useEffect(() => {
    applyAccent(state.accentHsl);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }, [state]);

  const setBranding = (b: Partial<Branding>) => setState((prev) => ({ ...prev, ...b }));
  const resetBranding = () => setState(DEFAULT);

  return (
    <BrandingContext.Provider value={{ ...state, setBranding, resetBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error("useBranding must be used within BrandingProvider");
  return ctx;
}

export const ACCENT_PRESETS: { name: string; hsl: string }[] = [
  { name: "Electric Blue", hsl: "195 100% 50%" },
  { name: "Royal Purple", hsl: "265 85% 60%" },
  { name: "Emerald", hsl: "150 70% 45%" },
  { name: "Sunset", hsl: "20 95% 55%" },
  { name: "Rose", hsl: "340 85% 60%" },
  { name: "Gold", hsl: "42 95% 55%" },
];
