/**
 * Capability Registration
 *
 * Imports all capability modules and registers them with the registry.
 * Import this module to ensure all capabilities are available.
 */

import { registerCapability } from '../index'
import { notesSearch } from './notes-search'
import { contextTime } from './context-time'
import { notesRead, notesCreate } from './notes-crud'
import { scheduleRead } from './schedule-read'
import { researchQuick } from './research'
import { planningDecompose } from './planning'

// Register all capabilities
registerCapability(notesSearch)
registerCapability(contextTime)
registerCapability(notesRead)
registerCapability(notesCreate)
registerCapability(scheduleRead)
registerCapability(researchQuick)
registerCapability(planningDecompose)
