import { Router, type IRouter } from "express";
import { db, appSettingsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { requireAdmin } from "../middlewares/require-auth";

const router: IRouter = Router();

/**
 * Company stamp and the manager's signatures (Arabic / English) printed on
 * contracts and receipts, plus where they are printed by default. Kept on the
 * server (app_settings) so every user and device prints the same marks.
 */
const KEYS = { stamp: "doc_stamp", signatureAr: "doc_signature_ar", signatureEn: "doc_signature_en", prefs: "doc_mark_prefs" } as const;
type ImageField = "stamp" | "signatureAr" | "signatureEn";
const IMAGE_FIELDS: ImageField[] = ["stamp", "signatureAr", "signatureEn"];
const SIGNATURES = ["none", "ar", "en"];
const DEFAULT_PREFS = { contractsStamp: true, contractsSignature: "ar", receiptsStamp: true, receiptsSignature: "ar" };
const MAX_IMAGE = 1_500_000; // characters of the data URL (~1.1 MB image)

async function load() {
  const rows = await db.select().from(appSettingsTable).where(inArray(appSettingsTable.key, Object.values(KEYS)));
  const get = (k: string) => rows.find((r) => r.key === k)?.value ?? "";
  let prefs = { ...DEFAULT_PREFS };
  try { prefs = { ...prefs, ...(JSON.parse(get(KEYS.prefs) || "{}") as object) }; } catch { /* keep defaults */ }
  return { stamp: get(KEYS.stamp), signatureAr: get(KEYS.signatureAr), signatureEn: get(KEYS.signatureEn), prefs };
}

async function put(key: string, value: string) {
  await db.insert(appSettingsTable).values({ key, value }).onConflictDoUpdate({ target: appSettingsTable.key, set: { value } });
}

router.get("/doc-assets", async (_req, res): Promise<void> => {
  res.json(await load());
});

/** Replace (data URL), remove ("") an image, and/or change the defaults. */
router.put("/doc-assets", requireAdmin, async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as Partial<Record<ImageField, unknown>> & { prefs?: Record<string, unknown> };
  for (const f of IMAGE_FIELDS) {
    const v = body[f];
    if (v === undefined) continue;
    if (typeof v !== "string" || (v && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v))) {
      res.status(400).json({ error: "Upload a PNG, JPG or WEBP image." });
      return;
    }
    if (v.length > MAX_IMAGE) {
      res.status(400).json({ error: "The image is too large (max about 1 MB)." });
      return;
    }
  }
  if (body.prefs !== undefined) {
    const p = body.prefs;
    const ok = p && typeof p === "object"
      && ["contractsStamp", "receiptsStamp"].every((k) => p[k] === undefined || typeof p[k] === "boolean")
      && ["contractsSignature", "receiptsSignature"].every((k) => p[k] === undefined || SIGNATURES.includes(p[k] as string));
    if (!ok) {
      res.status(400).json({ error: "Invalid defaults" });
      return;
    }
  }
  for (const f of IMAGE_FIELDS) if (typeof body[f] === "string") await put(KEYS[f], body[f] as string);
  if (body.prefs) {
    const current = (await load()).prefs;
    const next = Object.fromEntries(Object.keys(DEFAULT_PREFS).map((k) => [k, body.prefs![k] ?? current[k as keyof typeof current]]));
    await put(KEYS.prefs, JSON.stringify(next));
  }
  res.json(await load());
});

export default router;
