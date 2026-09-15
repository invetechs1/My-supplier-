import fs from "fs";
import path from "path";
import multer from "multer";
import crypto from "crypto";
import { env } from "./env";

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.resolve(process.cwd(), "uploads");
/** Public assets (logos, product photos) – served statically under /uploads. */
export const PUBLIC_DIR = path.join(UPLOAD_DIR, "public");
/** Private files (CR/VAT documents) – never served statically; streamed through authenticated routes. */
export const PRIVATE_DIR = path.join(UPLOAD_DIR, "private");
export const UPLOAD_BASE_URL = process.env.UPLOAD_BASE_URL ?? `${env.apiUrl.replace(/\/api\/v1$/, "")}/uploads`;
fs.mkdirSync(PUBLIC_DIR, { recursive: true });
fs.mkdirSync(PRIVATE_DIR, { recursive: true });

const EXT_FOR_MIME: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "application/pdf": ".pdf" };

/** Stored names never reuse the client's extension: it is derived from the (validated) MIME type. */
const storageFor = (dir: string) => multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, dir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${EXT_FOR_MIME[file.mimetype] ?? ".bin"}`),
});

/** Checks the file's magic bytes match the declared MIME type; deletes the file and throws otherwise. */
export function assertMagicBytes(filePath: string, mime: string) {
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(12);
  fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);
  const hex = buf.toString("hex");
  const ok =
    (mime === "image/png" && hex.startsWith("89504e470d0a1a0a")) ||
    (mime === "image/jpeg" && hex.startsWith("ffd8ff")) ||
    (mime === "image/webp" && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") ||
    (mime === "application/pdf" && buf.toString("ascii", 0, 4) === "%PDF");
  if (!ok) {
    fs.unlink(filePath, () => undefined);
    throw new Error("File content does not match its type");
  }
}

export function uploader(kinds: "image" | "document", maxMb: number) {
  const allowed = kinds === "image" ? ["image/png", "image/jpeg", "image/webp"] : ["application/pdf", "image/png", "image/jpeg", "image/webp"];
  return multer({
    storage: storageFor(kinds === "image" ? PUBLIC_DIR : PRIVATE_DIR),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!allowed.includes(file.mimetype)) return cb(new Error(`Unsupported file type ${file.mimetype}`));
      cb(null, true);
    },
  });
}

export const publicUrl = (filename: string) => `${UPLOAD_BASE_URL}/${filename}`;
/** Resolves a private file name safely inside PRIVATE_DIR (no path traversal). */
export function privatePath(filename: string): string | null {
  const base = path.basename(filename);
  if (base !== filename || !base) return null;
  const full = path.join(PRIVATE_DIR, base);
  return fs.existsSync(full) ? full : null;
}
