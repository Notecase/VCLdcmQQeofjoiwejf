/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_UNSPLASH_ACCESS_KEY?: string
  readonly VITE_MISSION_HUB_V1?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
