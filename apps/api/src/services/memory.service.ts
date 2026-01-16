/**
 * Memory Service
 * 
 * Replaces Note3's file-based memory system (AI.md, Plan.md, Daily.md)
 * with database-backed operations using Supabase.
 */

import { SupabaseClient } from '@supabase/supabase-js'

// Memory types matching the database constraint
export type MemoryType =
    | 'preferences'    // AI.md: User preferences
    | 'plan_index'     // Plan.md: Roadmap index
    | 'daily'          // Daily.md: Legacy daily plan
    | 'today'          // Today.md: Current day's tasks
    | 'tomorrow'       // Tomorrow.md: Next day's tasks
    | 'context'        // General context

export interface MemoryContent {
    content: string
    metadata: Record<string, unknown>
    updatedAt: Date
}

export interface MemoryService {
    getMemory(type: MemoryType): Promise<MemoryContent | null>
    setMemory(type: MemoryType, content: string, metadata?: Record<string, unknown>): Promise<void>
    listMemoryTypes(): Promise<{ type: MemoryType; updatedAt: Date }[]>
    deleteMemory(type: MemoryType): Promise<boolean>
}

/**
 * Create a memory service for a specific user
 */
export function createMemoryService(
    supabase: SupabaseClient,
    userId: string
): MemoryService {
    return {
        /**
         * Get memory content by type
         * Equivalent to reading AI.md, Plan.md, etc.
         */
        async getMemory(type: MemoryType): Promise<MemoryContent | null> {
            const { data, error } = await supabase
                .rpc('get_ai_memory', {
                    p_user_id: userId,
                    p_memory_type: type,
                })
                .single<{ content: string; metadata: Record<string, unknown>; updated_at: string }>()

            if (error || !data) {
                return null
            }

            return {
                content: data.content,
                metadata: data.metadata || {},
                updatedAt: new Date(data.updated_at),
            }
        },

        /**
         * Set memory content (upsert)
         * Equivalent to writing AI.md, Plan.md, etc.
         */
        async setMemory(
            type: MemoryType,
            content: string,
            metadata: Record<string, unknown> = {}
        ): Promise<void> {
            const { error } = await supabase.rpc('set_ai_memory', {
                p_user_id: userId,
                p_memory_type: type,
                p_content: content,
                p_metadata: metadata,
            })

            if (error) {
                throw new Error(`Failed to set memory: ${error.message}`)
            }
        },

        /**
         * List all memory types for the user
         * Equivalent to listing files in memory directory
         */
        async listMemoryTypes(): Promise<{ type: MemoryType; updatedAt: Date }[]> {
            const { data, error } = await supabase.rpc('list_ai_memory_types', {
                p_user_id: userId,
            })

            if (error) {
                throw new Error(`Failed to list memory types: ${error.message}`)
            }

            return (data || []).map((item: { memory_type: MemoryType; updated_at: string }) => ({
                type: item.memory_type,
                updatedAt: new Date(item.updated_at),
            }))
        },

        /**
         * Delete memory by type
         * Equivalent to deleting a memory file
         */
        async deleteMemory(type: MemoryType): Promise<boolean> {
            const { data, error } = await supabase.rpc('delete_ai_memory', {
                p_user_id: userId,
                p_memory_type: type,
            })

            if (error) {
                throw new Error(`Failed to delete memory: ${error.message}`)
            }

            return data === true
        },
    }
}

/**
 * Roadmap Service
 * 
 * Manages learning roadmaps from the Secretary/Planner agent
 */

export interface LearningRoadmap {
    id: string
    title: string
    description?: string
    topic?: string
    status: 'active' | 'completed' | 'archived' | 'paused'
    currentWeek: number
    totalWeeks: number
    startDate: Date
    endDate?: Date
    content: RoadmapContent
    createdAt: Date
    updatedAt: Date
}

export interface RoadmapContent {
    phases: RoadmapPhase[]
    milestones: RoadmapMilestone[]
    preferences: RoadmapPreferences
}

export interface RoadmapPhase {
    name: string
    weeks: number
    themes: {
        week: number
        focus: string
        topics: string[]
        resources: string[]
    }[]
}

export interface RoadmapMilestone {
    week: number
    title: string
    description: string
    completed: boolean
}

export interface RoadmapPreferences {
    hoursPerDay: number
    focusTime: string
    breakFrequency: string
}

export interface RoadmapService {
    create(data: Omit<LearningRoadmap, 'id' | 'createdAt' | 'updatedAt'>): Promise<LearningRoadmap>
    getById(id: string): Promise<LearningRoadmap | null>
    getActive(): Promise<LearningRoadmap[]>
    update(id: string, data: Partial<LearningRoadmap>): Promise<LearningRoadmap>
    archive(id: string): Promise<void>
    advanceWeek(id: string): Promise<LearningRoadmap>
}

export function createRoadmapService(
    supabase: SupabaseClient,
    userId: string
): RoadmapService {
    return {
        async create(data) {
            const { data: roadmap, error } = await supabase
                .from('learning_roadmaps')
                .insert({
                    user_id: userId,
                    title: data.title,
                    description: data.description,
                    topic: data.topic,
                    status: data.status,
                    current_week: data.currentWeek,
                    total_weeks: data.totalWeeks,
                    start_date: data.startDate,
                    end_date: data.endDate,
                    content: data.content,
                })
                .select()
                .single()

            if (error) throw new Error(`Failed to create roadmap: ${error.message}`)
            return mapRoadmap(roadmap)
        },

        async getById(id) {
            const { data, error } = await supabase
                .from('learning_roadmaps')
                .select('*')
                .eq('id', id)
                .eq('user_id', userId)
                .single()

            if (error || !data) return null
            return mapRoadmap(data)
        },

        async getActive() {
            const { data, error } = await supabase
                .from('learning_roadmaps')
                .select('*')
                .eq('user_id', userId)
                .eq('status', 'active')
                .order('updated_at', { ascending: false })

            if (error) throw new Error(`Failed to get roadmaps: ${error.message}`)
            return (data || []).map(mapRoadmap)
        },

        async update(id, updates) {
            const updateData: Record<string, unknown> = {}
            if (updates.title) updateData.title = updates.title
            if (updates.description !== undefined) updateData.description = updates.description
            if (updates.status) updateData.status = updates.status
            if (updates.currentWeek) updateData.current_week = updates.currentWeek
            if (updates.content) updateData.content = updates.content

            const { data, error } = await supabase
                .from('learning_roadmaps')
                .update(updateData)
                .eq('id', id)
                .eq('user_id', userId)
                .select()
                .single()

            if (error) throw new Error(`Failed to update roadmap: ${error.message}`)
            return mapRoadmap(data)
        },

        async archive(id) {
            const { error } = await supabase
                .from('learning_roadmaps')
                .update({ status: 'archived' })
                .eq('id', id)
                .eq('user_id', userId)

            if (error) throw new Error(`Failed to archive roadmap: ${error.message}`)
        },

        async advanceWeek(id) {
            const roadmap = await this.getById(id)
            if (!roadmap) throw new Error('Roadmap not found')

            const newWeek = Math.min(roadmap.currentWeek + 1, roadmap.totalWeeks)
            return this.update(id, { currentWeek: newWeek })
        },
    }
}

// Helper to map database row to typed object
function mapRoadmap(row: Record<string, unknown>): LearningRoadmap {
    return {
        id: row.id as string,
        title: row.title as string,
        description: row.description as string | undefined,
        topic: row.topic as string | undefined,
        status: row.status as LearningRoadmap['status'],
        currentWeek: row.current_week as number,
        totalWeeks: row.total_weeks as number,
        startDate: new Date(row.start_date as string),
        endDate: row.end_date ? new Date(row.end_date as string) : undefined,
        content: row.content as RoadmapContent,
        createdAt: new Date(row.created_at as string),
        updatedAt: new Date(row.updated_at as string),
    }
}

/**
 * Agent Session Service
 * 
 * Manages LangGraph state persistence
 */

export interface AgentSession {
    id: string
    agentType: 'chat' | 'note' | 'planner' | 'course' | 'slides' | 'research'
    threadId: string
    state: Record<string, unknown>
    checkpointId?: string
    contextNoteIds: string[]
    contextProjectId?: string
    isActive: boolean
    createdAt: Date
    updatedAt: Date
}

export interface AgentSessionService {
    getOrCreate(agentType: AgentSession['agentType'], threadId?: string): Promise<AgentSession>
    updateState(sessionId: string, state: Record<string, unknown>, checkpointId?: string): Promise<void>
    getByThread(threadId: string): Promise<AgentSession | null>
    listActive(agentType?: AgentSession['agentType']): Promise<AgentSession[]>
    deactivate(sessionId: string): Promise<void>
}

export function createAgentSessionService(
    supabase: SupabaseClient,
    userId: string
): AgentSessionService {
    return {
        async getOrCreate(agentType, threadId) {
            const thread = threadId || crypto.randomUUID()

            // Try to get existing session
            const { data: existing } = await supabase
                .from('agent_sessions')
                .select('*')
                .eq('user_id', userId)
                .eq('agent_type', agentType)
                .eq('thread_id', thread)
                .single()

            if (existing) {
                return mapAgentSession(existing)
            }

            // Create new session
            const { data, error } = await supabase
                .from('agent_sessions')
                .insert({
                    user_id: userId,
                    agent_type: agentType,
                    thread_id: thread,
                    state: {},
                    is_active: true,
                })
                .select()
                .single()

            if (error) throw new Error(`Failed to create session: ${error.message}`)
            return mapAgentSession(data)
        },

        async updateState(sessionId, state, checkpointId) {
            const update: Record<string, unknown> = { state }
            if (checkpointId) update.checkpoint_id = checkpointId

            const { error } = await supabase
                .from('agent_sessions')
                .update(update)
                .eq('id', sessionId)
                .eq('user_id', userId)

            if (error) throw new Error(`Failed to update state: ${error.message}`)
        },

        async getByThread(threadId) {
            const { data, error } = await supabase
                .from('agent_sessions')
                .select('*')
                .eq('user_id', userId)
                .eq('thread_id', threadId)
                .single()

            if (error || !data) return null
            return mapAgentSession(data)
        },

        async listActive(agentType) {
            let query = supabase
                .from('agent_sessions')
                .select('*')
                .eq('user_id', userId)
                .eq('is_active', true)

            if (agentType) {
                query = query.eq('agent_type', agentType)
            }

            const { data, error } = await query.order('updated_at', { ascending: false })

            if (error) throw new Error(`Failed to list sessions: ${error.message}`)
            return (data || []).map(mapAgentSession)
        },

        async deactivate(sessionId) {
            const { error } = await supabase
                .from('agent_sessions')
                .update({ is_active: false })
                .eq('id', sessionId)
                .eq('user_id', userId)

            if (error) throw new Error(`Failed to deactivate session: ${error.message}`)
        },
    }
}

function mapAgentSession(row: Record<string, unknown>): AgentSession {
    return {
        id: row.id as string,
        agentType: row.agent_type as AgentSession['agentType'],
        threadId: row.thread_id as string,
        state: row.state as Record<string, unknown>,
        checkpointId: row.checkpoint_id as string | undefined,
        contextNoteIds: (row.context_note_ids || []) as string[],
        contextProjectId: row.context_project_id as string | undefined,
        isActive: row.is_active as boolean,
        createdAt: new Date(row.created_at as string),
        updatedAt: new Date(row.updated_at as string),
    }
}
