import express, { Router, type IRouter } from "express";
import { db, clientDocumentsTable, clientsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";

const router: IRouter = Router();

/** Largest file accepted (bytes); the VPS nginx allows 20 MB per request. */
export const MAX_DOCUMENT_BYTES = 19 * 1024 * 1024;

const listColumns = {
  id: clientDocumentsTable.id,
  clientId: clientDocumentsTable.clientId,
  name: clientDocumentsTable.name,
  fileName: clientDocumentsTable.fileName,
  mimeType: clientDocumentsTable.mimeType,
  size: clientDocumentsTable.size,
  createdAt: clientDocumentsTable.createdAt,
};

const ids = (req: { params: Record<string, string | string[]> }) => ({
  clientId: parseInt(String(req.params.id), 10),
  docId: parseInt(String(req.params.docId ?? ""), 10),
});

const decode = (v: unknown) => {
  try { return decodeURIComponent(String(v ?? "")).trim(); } catch { return String(v ?? "").trim(); }
};

router.get("/clients/:id/documents", async (req, res): Promise<void> => {
  const { clientId } = ids(req);
  const rows = await db.select(listColumns).from(clientDocumentsTable)
    .where(eq(clientDocumentsTable.clientId, clientId))
    .orderBy(desc(clientDocumentsTable.createdAt));
  res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

/**
 * Upload: the raw file is the request body (any content type).
 * Name and original file name come in the X-Document-Name / X-File-Name headers (URI-encoded).
 */
router.post(
  "/clients/:id/documents",
  express.raw({ type: () => true, limit: MAX_DOCUMENT_BYTES }),
  async (req, res): Promise<void> => {
    const { clientId } = ids(req);
    const [client] = await db.select({ id: clientsTable.id }).from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (data.length === 0) {
      res.status(400).json({ error: "The file is empty" });
      return;
    }
    const fileName = decode(req.header("x-file-name")) || "file";
    const name = decode(req.header("x-document-name")) || fileName;
    const [row] = await db.insert(clientDocumentsTable).values({
      clientId,
      name: name.slice(0, 200),
      fileName: fileName.slice(0, 255),
      mimeType: (req.header("content-type") || "application/octet-stream").split(";")[0]!.slice(0, 120),
      size: data.length,
      data,
    }).returning(listColumns);
    res.status(201).json({ ...row!, createdAt: row!.createdAt.toISOString() });
  },
);

router.get("/clients/:id/documents/:docId/file", async (req, res): Promise<void> => {
  const { clientId, docId } = ids(req);
  const [row] = await db.select().from(clientDocumentsTable)
    .where(and(eq(clientDocumentsTable.id, docId), eq(clientDocumentsTable.clientId, clientId)));
  if (!row) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  // Only open safe types in the browser; everything else (HTML, SVG, scripts…) is downloaded
  const mime = (row.mimeType || "").toLowerCase();
  const safeInline = mime === "application/pdf" || mime === "text/plain" || (mime.startsWith("image/") && mime !== "image/svg+xml");
  const disposition = req.query.download || !safeInline ? "attachment" : "inline";
  const ascii = row.fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  res.setHeader("Content-Type", row.mimeType || "application/octet-stream");
  res.setHeader("Content-Length", String(row.data.length));
  res.setHeader("Content-Disposition", `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.fileName)}`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Chrome's PDF viewer does not run under a sandbox policy; other files get one
  if (mime !== "application/pdf") res.setHeader("Content-Security-Policy", "sandbox");
  res.end(row.data);
});

router.patch("/clients/:id/documents/:docId", async (req, res): Promise<void> => {
  const { clientId, docId } = ids(req);
  const name = String(req.body?.name ?? "").trim();
  if (!name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  const [row] = await db.update(clientDocumentsTable).set({ name: name.slice(0, 200) })
    .where(and(eq(clientDocumentsTable.id, docId), eq(clientDocumentsTable.clientId, clientId)))
    .returning(listColumns);
  if (!row) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.delete("/clients/:id/documents/:docId", async (req, res): Promise<void> => {
  const { clientId, docId } = ids(req);
  const [row] = await db.delete(clientDocumentsTable)
    .where(and(eq(clientDocumentsTable.id, docId), eq(clientDocumentsTable.clientId, clientId)))
    .returning({ id: clientDocumentsTable.id });
  if (!row) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
