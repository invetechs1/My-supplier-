// Minimal typing for the `process.env` global that Metro/Expo inline at
// bundle time (EXPO_PUBLIC_* variables). Avoids pulling in @types/node.
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_URL?: string;
    EXPO_PUBLIC_WEB_URL?: string;
    NODE_ENV?: "development" | "production" | "test";
    [key: string]: string | undefined;
  }
}

declare var process: { env: NodeJS.ProcessEnv };
