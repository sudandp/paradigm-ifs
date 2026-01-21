// FIX: Manually define ImportMetaEnv to resolve issues with Vite environment variables not being found.
// This replaces the non-functional /// <reference types="vite/client" />
/// <reference lib="webworker" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
    readonly VITE_API_KEY: string;
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }