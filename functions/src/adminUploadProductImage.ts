import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getStorage } from "firebase-admin/storage";
import Busboy from "busboy";
import { ADMIN_EMAILS, requireAdmin } from "./lib/auth";
import { applyCors } from "./lib/cors";

// Firebase has migrated default bucket naming from
// {projectId}.appspot.com to {projectId}.firebasestorage.app for newer
// projects, and `getStorage().bucket()` without arguments resolves to the
// legacy form which doesn't exist here. Pin the explicit bucket name.
const BUCKET_NAME = "drumsareme-website.firebasestorage.app";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface ParsedUpload {
  productId: string;
  buffer: Buffer;
  mimeType: string;
  filename: string;
  truncated: boolean;
}

function parseMultipart(
  headers: Record<string, string | string[] | undefined>,
  rawBody: Buffer,
): Promise<ParsedUpload | { error: string }> {
  return new Promise((resolve) => {
    const bb = Busboy({ headers, limits: { fileSize: MAX_BYTES, files: 1 } });
    let productId = "";
    let buffer: Buffer | null = null;
    let mimeType = "";
    let filename = "";
    let truncated = false;
    let fileError: string | null = null;

    bb.on("field", (name, value) => {
      if (name === "productId") productId = value;
    });
    bb.on("file", (_name, file, info) => {
      filename = info.filename;
      mimeType = info.mimeType;
      const chunks: Buffer[] = [];
      file.on("data", (chunk: Buffer) => chunks.push(chunk));
      file.on("limit", () => {
        truncated = true;
      });
      file.on("end", () => {
        buffer = Buffer.concat(chunks);
      });
    });
    bb.on("error", (err: Error) => {
      fileError = err.message;
    });
    bb.on("close", () => {
      if (fileError) return resolve({ error: fileError });
      if (truncated) return resolve({ error: "File exceeds 5MB" });
      if (!buffer) return resolve({ error: "No file uploaded" });
      if (!productId) return resolve({ error: "Missing productId" });
      resolve({ productId, buffer, mimeType, filename, truncated });
    });
    bb.end(rawBody);
  });
}

function pickExtension(mimeType: string, filename: string): string {
  const fromMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  if (fromMime[mimeType]) return fromMime[mimeType];
  const dot = filename.lastIndexOf(".");
  if (dot !== -1) {
    const candidate = filename.slice(dot + 1).toLowerCase();
    if (/^[a-z0-9]{2,5}$/.test(candidate)) return candidate;
  }
  return "jpg";
}

export const adminUploadProductImage = onRequest(
  {
    region: "us-central1",
    cors: false,
    invoker: "public",
    memory: "512MiB",
  },
  async (req, res) => {
    applyCors(req, res, "POST");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    void ADMIN_EMAILS;

    const auth = await requireAdmin(req, res);
    if (!auth) return;

    const rawBody = req.rawBody;
    if (!rawBody || rawBody.length === 0) {
      res.status(400).json({ error: "Empty body" });
      return;
    }
    if (rawBody.length > MAX_BYTES + 64 * 1024) {
      res.status(400).json({ error: "File exceeds 5MB" });
      return;
    }

    const parsed = await parseMultipart(
      req.headers as Record<string, string | string[] | undefined>,
      rawBody,
    );
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    if (!SLUG_PATTERN.test(parsed.productId)) {
      res.status(400).json({ error: "Invalid productId" });
      return;
    }
    if (!ALLOWED_MIME.has(parsed.mimeType)) {
      res.status(400).json({
        error: `Unsupported image type ${parsed.mimeType}. Allowed: jpeg, png, webp`,
      });
      return;
    }

    try {
      const ext = pickExtension(parsed.mimeType, parsed.filename);
      const path = `product-images/${parsed.productId}/${Date.now()}.${ext}`;
      const bucket = getStorage().bucket(BUCKET_NAME);
      const file = bucket.file(path);
      await file.save(parsed.buffer, {
        contentType: parsed.mimeType,
        public: true,
        metadata: {
          cacheControl: "public, max-age=31536000, immutable",
        },
      });

      const url = `https://storage.googleapis.com/${bucket.name}/${path}`;
      logger.info("adminUploadProductImage", {
        uid: auth.uid,
        productId: parsed.productId,
        path,
        size: parsed.buffer.length,
        mimeType: parsed.mimeType,
      });
      res.status(200).json({ url, path });
    } catch (err) {
      logger.error("adminUploadProductImage failed", {
        uid: auth.uid,
        productId: parsed.productId,
        err: String(err),
      });
      if (!res.headersSent) {
        res.status(500).json({ error: "Upload failed" });
      }
    }
  },
);
