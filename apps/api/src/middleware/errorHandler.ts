import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { HttpError } from "../lib/errors";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: err.flatten() });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = (err.meta as { target?: string[] | string } | undefined)?.target;
      const fields = Array.isArray(target) ? target.join(", ") : typeof target === "string" ? target : "";
      return res.status(409).json({ error: fields ? `A record with the same ${fields} already exists` : "A record with these details already exists" });
    }
    if (err.code === "P2025") return res.status(404).json({ error: "Record not found" });
  }
  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}

/** Wrap async handlers so thrown errors reach the error handler. */
export const asyncHandler =
  <T extends Request>(fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req as T, res, next).catch(next);
