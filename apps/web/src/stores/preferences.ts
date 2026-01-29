import { defineStore } from 'pinia'
import localforage from 'localforage'
import { supabase, isSupabaseConfigured } from '@/services'
import { DEFAULT_PREFERENCES, type UserPreferences } from '@/types'

const localPrefsStore = localforage.createInstance({
  name: 'marktext',
  storeName: 'preferences',
})

const PREFS_KEY = 'user_preferences'

export const usePreferencesStore = defineStore('preferences', {
  state: (): UserPreferences => ({ ...DEFAULT_PREFERENCES }),

  actions: {
    /**
     * Load preferences from storage
     */
    async load() {
      if (isSupabaseConfigured) {
        const { data: session } = await supabase.auth.getSession()
        if (session.session) {
          const { data } = await supabase
            .from('user_preferences')
            .select('*')
            .eq('user_id', session.session.user.id)
            .single()

          if (data?.settings) {
            this.$patch(data.settings as UserPreferences)
            return
          }
        }
      }

      // Fallback to local storage
      const stored = await localPrefsStore.getItem<UserPreferences>(PREFS_KEY)
      if (stored) {
        this.$patch(stored)
      }
    },

    /**
     * Save preferences to storage
     */
    async save() {
      const prefs = this.$state

      if (isSupabaseConfigured) {
        const { data: session } = await supabase.auth.getSession()
        if (session.session) {
          await supabase.from('user_preferences').upsert({
            user_id: session.session.user.id,
            theme: prefs.theme,
            font_size: prefs.fontSize,
            line_height: prefs.lineHeight,
            settings: prefs,
          })
          return
        }
      }

      // Fallback to local storage
      await localPrefsStore.setItem(PREFS_KEY, prefs)
    },

    /**
     * Update a single preference
     */
    async update<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
      ;(this as any)[key] = value
      await this.save()
    },

    /**
     * Reset to defaults
     */
    async reset() {
      this.$patch(DEFAULT_PREFERENCES)
      await this.save()
    },

    /**
     * Set theme
     */
    setTheme(theme: UserPreferences['theme']) {
      this.theme = theme
      document.documentElement.setAttribute('data-theme', theme)
      this.save()
    },

    /**
     * Toggle typewriter mode
     */
    toggleTypewriter() {
      this.typewriter = !this.typewriter
      this.save()
    },

    /**
     * Toggle focus mode
     */
    toggleFocus() {
      this.focus = !this.focus
      this.save()
    },

    /**
     * Toggle source code mode
     */
    toggleSourceCode() {
      this.sourceCode = !this.sourceCode
      this.save()
    },
  },
})
