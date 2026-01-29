import { supabase, isSupabaseConfigured } from './supabase'
import localforage from 'localforage'
import { v4 as uuidv4 } from 'uuid'
import type { Document, CreateDocument, UpdateDocument } from '@/types'

// Local storage fallback for offline/unauthenticated mode
const localDocStore = localforage.createInstance({
  name: 'marktext',
  storeName: 'documents',
})

export const documentService = {
  /**
   * List all documents for the current user
   */
  async list(): Promise<Document[]> {
    if (isSupabaseConfigured) {
      const { data: session } = await supabase.auth.getSession()
      if (session.session) {
        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .order('updated_at', { ascending: false })

        if (error) throw error
        return data || []
      }
    }

    // Fallback to local storage
    const docs: Document[] = []
    await localDocStore.iterate<Document, void>((value) => {
      docs.push(value)
    })
    return docs.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  },

  /**
   * Get a single document by ID
   */
  async get(id: string): Promise<Document | null> {
    if (isSupabaseConfigured) {
      const { data: session } = await supabase.auth.getSession()
      if (session.session) {
        const { data, error } = await supabase.from('documents').select('*').eq('id', id).single()

        if (error) {
          if (error.code === 'PGRST116') return null // Not found
          throw error
        }
        return data
      }
    }

    // Fallback to local storage
    return localDocStore.getItem<Document>(id)
  },

  /**
   * Create a new document
   */
  async create(doc: Partial<CreateDocument> = {}): Promise<Document> {
    const now = new Date().toISOString()
    const newDoc: Document = {
      id: uuidv4(),
      user_id: '',
      title: doc.title || 'Untitled',
      content: doc.content || '',
      word_count: 0,
      is_pinned: false,
      created_at: now,
      updated_at: now,
      ...doc,
    }

    if (isSupabaseConfigured) {
      const { data: session } = await supabase.auth.getSession()
      if (session.session) {
        newDoc.user_id = session.session.user.id
        const { data, error } = await supabase.from('documents').insert(newDoc).select().single()

        if (error) throw error
        return data
      }
    }

    // Fallback to local storage
    await localDocStore.setItem(newDoc.id, newDoc)
    return newDoc
  },

  /**
   * Update an existing document
   */
  async update(id: string, updates: UpdateDocument): Promise<Document | null> {
    const updatedData = {
      ...updates,
      updated_at: new Date().toISOString(),
    }

    if (isSupabaseConfigured) {
      const { data: session } = await supabase.auth.getSession()
      if (session.session) {
        const { data, error } = await supabase
          .from('documents')
          .update(updatedData)
          .eq('id', id)
          .select()
          .single()

        if (error) throw error
        return data
      }
    }

    // Fallback to local storage
    const existing = await localDocStore.getItem<Document>(id)
    if (!existing) return null

    const updated = { ...existing, ...updatedData }
    await localDocStore.setItem(id, updated)
    return updated
  },

  /**
   * Delete a document
   */
  async delete(id: string): Promise<boolean> {
    if (isSupabaseConfigured) {
      const { data: session } = await supabase.auth.getSession()
      if (session.session) {
        const { error } = await supabase.from('documents').delete().eq('id', id)

        if (error) throw error
        return true
      }
    }

    // Fallback to local storage
    await localDocStore.removeItem(id)
    return true
  },

  /**
   * Search documents by title or content
   */
  async search(query: string): Promise<Document[]> {
    const allDocs = await this.list()
    const lowerQuery = query.toLowerCase()

    return allDocs.filter(
      (doc) =>
        doc.title.toLowerCase().includes(lowerQuery) ||
        doc.content.toLowerCase().includes(lowerQuery)
    )
  },
}
