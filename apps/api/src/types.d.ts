// Express request augmentations shared across routes (auth user lives in middleware/auth.ts).
declare namespace Express {
  interface Request {
    /** Raw JSON body as received, captured in app.ts for webhook signature verification. */
    rawBody?: string;
  }
}
