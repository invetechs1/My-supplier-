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

const storageFor = (dir: string) => multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, dir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 8) || "";
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  },
});

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
