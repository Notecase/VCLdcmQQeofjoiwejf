<script setup lang="ts">
import { ref } from 'vue'
import {
  Plus,
  Trash2,
  Clock,
  FileText,
  Search,
  GraduationCap,
  Play,
  Loader2,
} from 'lucide-vue-next'
import { ElSwitch } from 'element-plus'
import type {
  PlanScheduleItem,
  PlanScheduleWorkflow,
  PlanScheduleFrequency,
} from '@inkdown/shared/types'

const props = defineProps<{
  schedules: PlanScheduleItem[]
  planId: string
  runningScheduleId?: string | null
  runningSteps?: Array<{ text: string; status: 'active' | 'done' }>
}>()

const emit = defineEmits<{
  create: [schedule: Omit<PlanScheduleItem, 'id' | 'createdAt' | 'runCount' | 'planId'>]
  update: [id: string, updates: Partial<PlanScheduleItem>]
  delete: [id: string]
  toggle: [id: string, enabled: boolean]
  run: [scheduleId: string]
}>()

function handleRun(scheduleId: string) {
  if (props.runningScheduleId) return
  emit('run', scheduleId)
}

const expandedId = ref<string | null>(null)
const showAddForm = ref(false)

// Add form state
const newTitle = ref('')
const newInstructions = ref('')
const newWorkflow = ref<PlanScheduleWorkflow>('make_note_from_task')
const newFrequency = ref<PlanScheduleFrequency>('daily')
const newTime = ref('07:05')
const newDays = ref<string[]>([])

// Edit form state (inline editing in expanded card)
const editingId = ref<string | null>(null)
const editTitle = ref('')
const editInstructions = ref('')
const editWorkflow = ref<PlanScheduleWorkflow>('make_note_from_task')
const editFrequency = ref<PlanScheduleFrequency>('daily')
const editTime = ref('07:05')
const editDays = ref<string[]>([])

const allDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const workflowPills: { value: PlanScheduleWorkflow; label: string; color: string }[] = [
  { value: 'make_note_from_task', label: 'Note', color: '#10b981' },
  { value: 'research_topic_from_task', label: 'Research', color: '#818cf8' },
  { value: 'make_course_from_plan', label: 'Course', color: '#f59e0b' },
]

const frequencyPills: { value: PlanScheduleFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'custom', label: 'Custom' },
]

function getWorkflowPill(workflow: PlanScheduleWorkflow) {
  return workflowPills.find((p) => p.value === workflow) || workflowPills[0]
}

function toggleExpand(id: string) {
  if (expandedId.value === id) {
    expandedId.value = null
    editingId.value = null
  } else {
    expandedId.value = id
    editingId.value = null
  }
}

function formatScheduleText(schedule: PlanScheduleItem): string {
  const freq =
    schedule.frequency === 'daily'
      ? 'Every day'
      : schedule.frequency === 'weekly'
        ? `Every ${(schedule.days || ['Sun']).join(', ')}`
        : `On ${(schedule.days || []).join(', ')}`
  return freq
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, '0')} ${suffix}`
}

function handleToggle(schedule: PlanScheduleItem, val: boolean) {
  emit('toggle', schedule.id, val)
}

function toggleNewDay(day: string) {
  const idx = newDays.value.indexOf(day)
  if (idx >= 0) {
    newDays.value.splice(idx, 1)
  } else {
    newDays.value.push(day)
  }
}

function toggleEditDay(day: string) {
  const idx = editDays.value.indexOf(day)
  if (idx >= 0) {
    editDays.value.splice(idx, 1)
  } else {
    editDays.value.push(day)
  }
}

function startEditing(schedule: PlanScheduleItem) {
  editingId.value = schedule.id
  editTitle.value = schedule.title
  editInstructions.value = schedule.instructions || ''
  editWorkflow.value = schedule.workflow
  editFrequency.value = schedule.frequency
  editTime.value = schedule.time
  editDays.value = [...(schedule.days || [])]
}

function cancelEditing() {
  editingId.value = null
}

function submitEdit(id: string) {
  if (!editTitle.value.trim()) return
  emit('update', id, {
    title: editTitle.value.trim(),
    instructions: editInstructions.value.trim() || undefined,
    workflow: editWorkflow.value,
    frequency: editFrequency.value,
    time: editTime.value,
    days: editFrequency.value !== 'daily' ? editDays.value : undefined,
  })
  editingId.value = null
}

function submitNewSchedule() {
  if (!newTitle.value.trim()) return
  emit('create', {
    title: newTitle.value.trim(),
    instructions: newInstructions.value.trim() || undefined,
    workflow: newWorkflow.value,
    frequency: newFrequency.value,
    time: newTime.value,
    days: newFrequency.value !== 'daily' ? newDays.value : undefined,
    enabled: true,
  })
  // Reset form
  newTitle.value = ''
  newInstructions.value = ''
  newWorkflow.value = 'make_note_from_task'
  newFrequency.value = 'daily'
  newTime.value = '07:05'
  newDays.value = []
  showAddForm.value = false
}

function handleDelete(id: string) {
  emit('delete', id)
}
</script>

<template>
  <section class="plan-schedule">
    <span class="section-label">Repeats</span>

    <div
      v-if="schedules.length > 0"
      class="schedule-list"
    >
      <div
        v-for="schedule in schedules"
        :key="schedule.id"
        class="schedule-card"
        :class="{ expanded: expandedId === schedule.id, disabled: !schedule.enabled }"
      >
        <!-- Row 1: Toggle + Title + Schedule text -->
        <div
          class="card-header"
          @click="toggleExpand(schedule.id)"
        >
          <ElSwitch
            :model-value="schedule.enabled"
            size="small"
            active-color="var(--sec-primary, #10b981)"
            @update:model-value="(val: boolean) => handleToggle(schedule, val)"
            @click.stop
          />
          <span class="card-title">{{ schedule.title }}</span>
          <span class="card-schedule-text"
            >{{ formatScheduleText(schedule) }} · {{ formatTime(schedule.time) }}</span
          >
          <button
            class="run-now-btn"
            :class="{ running: runningScheduleId === schedule.id }"
            :disabled="!!runningScheduleId"
            title="Run now"
            @click.stop="handleRun(schedule.id)"
          >
            <component
              :is="runningScheduleId === schedule.id ? Loader2 : Play"
              :size="12"
              :class="{ spinning: runningScheduleId === schedule.id }"
            />
          </button>
        </div>

        <!-- Row 2: Workflow badge + Run stats -->
        <div
          class="card-meta"
          @click="toggleExpand(schedule.id)"
        >
          <span
            class="workflow-badge"
            :style="{
              background: getWorkflowPill(schedule.workflow).color + '18',
              color: getWorkflowPill(schedule.workflow).color,
              borderColor: getWorkflowPill(schedule.workflow).color + '30',
            }"
          >
            <component
              :is="
                schedule.workflow === 'make_note_from_task'
                  ? FileText
                  : schedule.workflow === 'research_topic_from_task'
                    ? Search
                    : GraduationCap
              "
              :size="11"
            />
            {{ getWorkflowPill(schedule.workflow).label }}
          </span>
          <span class="run-stats">
            {{ schedule.runCount }} run{{ schedule.runCount !== 1 ? 's' : '' }}
            <template v-if="schedule.lastRunStatus">
              · last:
              <span
                class="run-status-badge"
                :class="schedule.lastRunStatus"
                >{{ schedule.lastRunStatus }}</span
              >
            </template>
          </span>
        </div>

        <!-- Inline progress (during Run Now) -->
        <div
          v-if="runningScheduleId === schedule.id && runningSteps?.length"
          class="run-progress"
        >
          <div
            v-for="(step, i) in runningSteps"
            :key="i"
            class="progress-step"
            :class="'step-' + step.status"
          >
            <span class="step-icon">{{ step.status === 'done' ? '✓' : '●' }}</span>
            <span class="step-text">{{ step.text }}</span>
          </div>
        </div>

        <!-- Expanded area -->
        <div
          v-if="expandedId === schedule.id"
          class="card-expanded"
        >
          <!-- View mode -->
          <template v-if="editingId !== schedule.id">
            <div
              v-if="schedule.instructions"
              class="instructions-preview"
            >
              <span class="instructions-label">Instructions</span>
              <p class="instructions-text">{{ schedule.instructions }}</p>
            </div>

            <div
              v-if="schedule.lastRunAt"
              class="last-run-info"
            >
              <Clock :size="12" />
              <span>Last run: {{ new Date(schedule.lastRunAt).toLocaleString() }}</span>
            </div>

            <div class="expanded-actions">
              <button
                class="action-btn edit"
                @click.stop="startEditing(schedule)"
              >
                Edit
              </button>
              <button
                class="action-btn delete"
                @click.stop="handleDelete(schedule.id)"
              >
                <Trash2 :size="12" />
                Remove
              </button>
            </div>
          </template>

          <!-- Edit mode -->
          <template v-else>
            <div class="inline-edit-form">
              <input
                v-model="editTitle"
                class="form-input"
                placeholder="Name this automation"
              />
              <textarea
                v-model="editInstructions"
                class="form-textarea"
                placeholder="Describe what the AI should do each time it runs..."
                rows="3"
              />

              <div class="form-row-compact">
                <div class="form-field">
                  <span class="pill-label">Runs</span>
                  <div class="pill-row">
                    <button
                      v-for="pill in frequencyPills"
                      :key="pill.value"
                      class="pill-btn"
                      :class="{ active: editFrequency === pill.value }"
                      @click="editFrequency = pill.value"
                    >
                      {{ pill.label }}
                    </button>
                  </div>
                </div>
                <div class="form-field">
                  <span class="pill-label">At</span>
                  <input
                    v-model="editTime"
                    type="time"
                    class="form-input time-input"
                  />
                </div>
              </div>

              <div
                v-if="editFrequency !== 'daily'"
                class="day-selector"
              >
                <span class="pill-label">Days</span>
                <div class="day-chips">
                  <button
                    v-for="day in allDays"
                    :key="day"
                    class="day-chip"
                    :class="{ active: editDays.includes(day) }"
                    @click="toggleEditDay(day)"
                  >
                    {{ day }}
                  </button>
                </div>
              </div>

              <div class="form-actions">
                <button
                  class="form-btn cancel"
                  @click.stop="cancelEditing"
                >
                  Cancel
                </button>
                <button
                  class="form-btn submit"
                  :disabled="!editTitle.trim()"
                  @click.stop="submitEdit(schedule.id)"
                >
                  Save
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div
      v-else
      class="empty-schedules"
    >
      <p>No automations yet. Add one to generate content on a schedule.</p>
    </div>

    <!-- Add automation form -->
    <div
      v-if="showAddForm"
      class="add-form"
    >
      <input
        v-model="newTitle"
        class="form-input"
        placeholder="Name this automation (e.g. Morning study recap)"
      />
      <textarea
        v-model="newInstructions"
        class="form-textarea"
        placeholder="Describe what the AI should do each time it runs. Be specific — e.g. 'Summarize key concepts from today's topic and create practice questions' or 'Research the next topic and save a brief with the top 5 insights'."
        rows="3"
      />

      <div class="form-row-compact">
        <div class="form-field">
          <span class="pill-label">Runs</span>
          <div class="pill-row">
            <button
              v-for="pill in frequencyPills"
              :key="pill.value"
              class="pill-btn"
              :class="{ active: newFrequency === pill.value }"
              @click="newFrequency = pill.value"
            >
              {{ pill.label }}
            </button>
          </div>
        </div>
        <div class="form-field">
          <span class="pill-label">At</span>
          <input
            v-model="newTime"
            type="time"
            class="form-input time-input"
          />
        </div>
      </div>

      <div
        v-if="newFrequency !== 'daily'"
        class="day-selector"
      >
        <span class="pill-label">Days</span>
        <div class="day-chips">
          <button
            v-for="day in allDays"
            :key="day"
            class="day-chip"
            :class="{ active: newDays.includes(day) }"
            @click="toggleNewDay(day)"
          >
            {{ day }}
          </button>
        </div>
      </div>

      <div class="form-actions">
        <button
          class="form-btn cancel"
          @click="showAddForm = false"
        >
          Cancel
        </button>
        <button
          class="form-btn submit"
          :disabled="!newTitle.trim()"
          @click="submitNewSchedule"
        >
          Add
        </button>
      </div>
    </div>

    <button
      v-if="!showAddForm"
      class="add-btn"
      @click="showAddForm = true"
    >
      <Plus :size="14" />
      Add automation
    </button>
  </section>
</template>

<style scoped>
.plan-schedule {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-label {
  font-size: var(--pw-label-size, 12px);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-color-secondary, #94a3b8);
}

.schedule-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* ── Card ───────────────────────────────────────────────── */
.schedule-card {
  border: 1px solid var(--sec-glass-border);
  border-radius: var(--sec-radius-sm, 8px);
  background: var(--sec-surface-card);
  transition:
    border-color var(--sec-transition-fast) ease,
    background var(--sec-transition-fast) ease;
  overflow: hidden;
}

.schedule-card:hover {
  border-color: var(--sec-glass-border-hover, rgba(255, 255, 255, 0.14));
  background: var(--sec-surface-card-hover, rgba(255, 255, 255, 0.045));
}

.schedule-card.expanded {
  border-color: var(--sec-primary-border);
}

.schedule-card.disabled {
  opacity: 0.55;
}

.schedule-card.disabled:hover {
  opacity: 0.7;
}

/* ── Card header (Row 1) ────────────────────────────────── */
.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px 0 14px;
  cursor: pointer;
}

.run-now-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--sec-glass-border);
  border-radius: 50%;
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  cursor: pointer;
  flex-shrink: 0;
  margin-left: auto;
  transition: all 0.15s ease;
}

.run-now-btn:hover:not(:disabled) {
  border-color: var(--sec-primary, #10b981);
  color: var(--sec-primary, #10b981);
  background: rgba(16, 185, 129, 0.08);
}

.run-now-btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.run-now-btn.running {
  border-color: var(--sec-primary, #10b981);
  color: var(--sec-primary, #10b981);
  opacity: 1;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Inline progress (Run Now) ───────────────────────────── */
.run-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 14px 10px;
  border-top: 1px solid var(--sec-glass-border, rgba(255, 255, 255, 0.06));
}

.progress-step {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  line-height: 1.4;
}

.step-icon {
  width: 14px;
  text-align: center;
  flex-shrink: 0;
  font-size: 11px;
}

.step-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-done {
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.7;
}

.step-done .step-icon {
  color: var(--sec-primary, #10b981);
}

.step-active {
  color: var(--text-color, #e2e8f0);
}

.step-active .step-icon {
  color: var(--sec-primary, #10b981);
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-schedule-text {
  font-size: 11.5px;
  color: var(--text-color-secondary, #94a3b8);
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── Card meta (Row 2) ──────────────────────────────────── */
.card-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px 10px 48px;
  cursor: pointer;
}

.workflow-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--sec-radius-pill, 999px);
  border: 1px solid;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1;
  white-space: nowrap;
}

.run-stats {
  font-size: 11.5px;
  color: var(--text-color-secondary, #94a3b8);
}

.run-status-badge {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.run-status-badge.success {
  background: var(--sec-primary-bg);
  color: var(--sec-primary);
}

.run-status-badge.error {
  background: rgba(248, 81, 73, 0.12);
  color: #f85149;
}

/* ── Expanded area ──────────────────────────────────────── */
.card-expanded {
  padding: 4px 14px 14px 14px;
  border-top: 1px solid var(--sec-glass-border);
  margin-top: 6px;
}

.instructions-preview {
  margin-top: 10px;
  margin-bottom: 6px;
}

.instructions-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-color-secondary, #94a3b8);
}

.instructions-text {
  margin: 4px 0 0 0;
  font-size: 12.5px;
  color: var(--text-color, #e2e8f0);
  opacity: 0.85;
  font-style: italic;
  line-height: 1.5;
}

.last-run-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--text-color-secondary, #94a3b8);
}

.expanded-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border: 1px solid var(--sec-glass-border);
  border-radius: 6px;
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--sec-transition-fast) ease;
}

.action-btn.edit {
  color: var(--text-color, #e2e8f0);
}

.action-btn.edit:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: var(--sec-glass-border-hover, rgba(255, 255, 255, 0.14));
}

.action-btn.delete {
  color: var(--text-color-secondary, #94a3b8);
}

.action-btn.delete:hover {
  background: rgba(248, 81, 73, 0.1);
  color: #f85149;
  border-color: rgba(248, 81, 73, 0.25);
}

/* ── Inline edit form ───────────────────────────────────── */
.inline-edit-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}

/* ── Shared form styles ─────────────────────────────────── */
.form-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--sec-glass-border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-color, #e2e8f0);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
  transition: border-color var(--sec-transition-fast) ease;
}

.form-input:focus {
  border-color: var(--sec-primary-border);
}

.form-textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--sec-glass-border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-color, #e2e8f0);
  font-size: 12.5px;
  font-family: inherit;
  outline: none;
  resize: vertical;
  min-height: 44px;
  box-sizing: border-box;
  transition: border-color var(--sec-transition-fast) ease;
}

.form-textarea:focus {
  border-color: var(--sec-primary-border);
}

.form-textarea::placeholder,
.form-input::placeholder {
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.6;
}

/* ── Pill groups (workflow, frequency) ──────────────────── */
/* ── Compact row: output + frequency + time on one line ─ */
.form-row-compact {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  align-items: flex-start;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pill-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pill-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-color-secondary, #94a3b8);
}

.pill-row {
  display: flex;
  gap: 4px;
}

.pill-btn {
  padding: 4px 12px;
  border: 1px solid var(--sec-glass-border);
  border-radius: var(--sec-radius-pill, 999px);
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--sec-transition-fast) ease;
  white-space: nowrap;
}

.pill-btn:hover:not(.active) {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-color, #e2e8f0);
}

.pill-btn.active {
  /* Default active state for frequency pills (green) */
  background: var(--sec-primary-bg);
  color: var(--sec-primary);
  border-color: var(--sec-primary-border);
}

/* ── Time row ───────────────────────────────────────────── */
.time-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.time-input {
  width: 110px;
  flex-shrink: 0;
}

/* ── Day selector ───────────────────────────────────────── */
.day-selector {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.day-chips {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.day-chip {
  padding: 3px 10px;
  border: 1px solid var(--sec-glass-border);
  border-radius: var(--sec-radius-pill, 999px);
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--sec-transition-fast) ease;
}

.day-chip:hover:not(.active) {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-color, #e2e8f0);
}

.day-chip.active {
  background: var(--sec-primary-bg);
  color: var(--sec-primary);
  border-color: var(--sec-primary-border);
}

/* ── Form actions ───────────────────────────────────────── */
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 2px;
}

.form-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--sec-transition-fast) ease;
}

.form-btn.cancel {
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
}

.form-btn.cancel:hover {
  color: var(--text-color, #e2e8f0);
}

.form-btn.submit {
  background: var(--sec-primary-bg);
  color: var(--sec-primary);
  border: 1px solid var(--sec-primary-border);
}

.form-btn.submit:hover:not(:disabled) {
  background: rgba(16, 185, 129, 0.2);
}

.form-btn.submit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Add form card ──────────────────────────────────────── */
.add-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--sec-glass-border);
  border-radius: var(--sec-radius-sm, 8px);
  background: var(--sec-surface-card);
}

/* ── Empty state ────────────────────────────────────────── */
.empty-schedules {
  padding: 8px 0;
}

.empty-schedules p {
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
  margin: 0;
}

/* ── Add button ─────────────────────────────────────────── */
.add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px dashed var(--sec-glass-border);
  border-radius: var(--sec-radius-sm, 8px);
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--sec-transition-fast) ease;
  align-self: flex-start;
}

.add-btn:hover {
  border-color: var(--sec-primary-border);
  color: var(--sec-primary);
  background: var(--sec-primary-bg);
}
</style>
