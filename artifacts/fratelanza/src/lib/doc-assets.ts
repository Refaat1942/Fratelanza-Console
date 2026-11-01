import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_MARK_PREFS, type DocAssets, type DocMarkPrefs } from "@/lib/contract-document";

const base = () => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
const KEY = ["doc-assets"];

/** Company stamp and manager's signatures uploaded in Settings (shared by all users). */
export function useDocAssets() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<DocAssets> => {
      const r = await fetch(`${base()}/doc-assets`, { credentials: "include" });
      if (!r.ok) return { stamp: "", signatureAr: "", signatureEn: "", prefs: DEFAULT_MARK_PREFS };
      return r.json() as Promise<DocAssets>;
    },
    staleTime: 5 * 60_000,
  });
}

export function useSaveDocAssets() {
  const qc = useQueryClient();
  return async (patch: Partial<Pick<DocAssets, "stamp" | "signatureAr" | "signatureEn">> & { prefs?: Partial<DocMarkPrefs> }) => {
    const r = await fetch(`${base()}/doc-assets`, {
      method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    const json = await r.json().catch(() => ({})) as DocAssets & { error?: string };
    if (!r.ok) throw new Error(json.error ?? `Error ${r.status}`);
    qc.setQueryData(KEY, json);
    return json;
  };
}

/**
 * A photo of a stamp or signature on paper as a transparent PNG: the paper
 * (and faint ruled lines) become transparent, the ink keeps its colour, the
 * image is cropped to the ink and scaled to at most 640px wide. Images that
 * already have transparency are only cropped and scaled.
 */
export async function inkImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url; });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height);
    const px = data.data;
    const hasAlpha = (() => { for (let i = 3; i < px.length; i += 16) if (px[i]! < 250) return true; return false; })();
    if (!hasAlpha) {
      // Paper brightness: a high percentile of the image's luminance
      const lums: number[] = [];
      for (let i = 0; i < px.length; i += 4 * 7) lums.push(0.3 * px[i]! + 0.59 * px[i + 1]! + 0.11 * px[i + 2]!);
      lums.sort((a, b) => a - b);
      const paper = lums[Math.floor(lums.length * 0.9)] ?? 235;
      const n = px.length / 4;
      const blue = new Float32Array(n), dark = new Float32Array(n);
      let blueCount = 0, darkCount = 0;
      for (let k = 0; k < n; k++) {
        const r = px[k * 4]!, g = px[k * 4 + 1]!, b = px[k * 4 + 2]!;
        // Blue / purple ink stands out from the paper and from teal ruled lines (blue well above green)
        blue[k] = Math.max(0, Math.min(255, (b - g - 25) * 3));
        // Black ink: much darker than the paper (ruled lines and shadows are not)
        dark[k] = Math.max(0, Math.min(255, (paper - 95 - (0.3 * r + 0.59 * g + 0.11 * b)) * 3));
        if (blue[k]! > 128) blueCount++;
        if (dark[k]! > 128) darkCount++;
      }
      // A blue stamp: ignore dark areas (photo edges, shadows)
      const useDark = blueCount < darkCount * 0.5;
      // One solid ink colour: the strong blue pixels when the ink is blue, else the darkest ones
      let sr = 0, sg = 0, sb = 0, sc = 0;
      const colourFromBlue = blueCount > 200;
      for (let k = 0; k < n; k++) {
        if ((colourFromBlue ? blue[k]! : dark[k]!) > 200) { sr += px[k * 4]!; sg += px[k * 4 + 1]!; sb += px[k * 4 + 2]!; sc++; }
      }
      const ink = sc ? [sr / sc * 0.8, sg / sc * 0.8, sb / sc * 0.8] : [30, 40, 120];
      for (let k = 0; k < n; k++) {
        const a = useDark ? Math.max(blue[k]!, dark[k]!) : blue[k]!;
        px[k * 4] = ink[0]!; px[k * 4 + 1] = ink[1]!; px[k * 4 + 2] = ink[2]!;
        px[k * 4 + 3] = Math.min(255, a * 1.4);
      }
      ctx.putImageData(data, 0, 0);
    }
    // Crop to the ink
    let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      if (px[(y * c.width + x) * 4 + 3]! > 90) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 <= x0 || y1 <= y0) throw new Error("No stamp or signature found in the image.");
    const pad = 6;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(c.width - 1, x1 + pad); y1 = Math.min(c.height - 1, y1 + pad);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const scale = Math.min(1, 640 / w);
    const out = document.createElement("canvas");
    out.width = Math.round(w * scale); out.height = Math.round(h * scale);
    out.getContext("2d")!.drawImage(c, x0, y0, w, h, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
