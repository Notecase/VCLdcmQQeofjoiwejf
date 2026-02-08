<script setup lang="ts">
import { ref, computed } from 'vue'
import { Play, ChevronDown, ChevronUp, List } from 'lucide-vue-next'
import type { Lesson } from '@inkdown/shared/types'
import MuyaRenderer from '@/components/shared/MuyaRenderer.vue'

const props = defineProps<{
  lesson: Lesson
}>()

const showTranscript = ref(false)

const videoUrl = computed(() => {
  if (props.lesson.content.videoId) {
    return `https://www.youtube.com/embed/${props.lesson.content.videoId}?rel=0`
  }
  if (props.lesson.content.videoUrl) {
    // Convert watch URLs to embed format
    const match = props.lesson.content.videoUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)
    if (match) return `https://www.youtube.com/embed/${match[1]}?rel=0`
    return props.lesson.content.videoUrl
  }
  return null
})

const keyPoints = computed(() => props.lesson.content.keyPoints ?? [])
const timestamps = computed(() => props.lesson.content.timestamps ?? [])
const transcript = computed(() => props.lesson.content.transcript ?? '')
</script>

<template>
  <div class="video-lesson">
    <h2 class="lesson-title">
      <Play :size="20" />
      {{ lesson.title }}
    </h2>

    <!-- Video Player -->
    <div v-if="videoUrl" class="video-container">
      <iframe
        :src="videoUrl"
        class="video-iframe"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
      />
    </div>
    <div v-else class="video-placeholder">
      <Play :size="48" />
      <p>No video available for this lesson</p>
    </div>

    <!-- Channel info -->
    <div v-if="lesson.content.videoChannel" class="channel-info">
      Source: {{ lesson.content.videoChannel }}
    </div>

    <!-- Key Points -->
    <div v-if="keyPoints.length > 0" class="key-points">
      <h3 class="section-heading">
        <List :size="16" />
        Key Points
      </h3>
      <ul class="points-list">
        <li v-for="(point, idx) in keyPoints" :key="idx">{{ point }}</li>
      </ul>
    </div>

    <!-- Timestamps -->
    <div v-if="timestamps.length > 0" class="timestamps">
      <h3 class="section-heading">Timestamps</h3>
      <div class="timestamp-list">
        <div v-for="(ts, idx) in timestamps" :key="idx" class="timestamp-item">
          <span class="timestamp-time">{{ ts.time }}</span>
          <span class="timestamp-label">{{ ts.label }}</span>
        </div>
      </div>
    </div>

    <!-- Transcript -->
    <div v-if="transcript" class="transcript-section">
      <button class="transcript-toggle" @click="showTranscript = !showTranscript">
        <span>Transcript</span>
        <ChevronUp v-if="showTranscript" :size="14" />
        <ChevronDown v-else :size="14" />
      </button>
      <div v-if="showTranscript" class="transcript-text">
        {{ transcript }}
      </div>
    </div>

    <!-- Markdown content (supplementary) -->
    <MuyaRenderer v-if="lesson.content.markdown" :markdown="lesson.content.markdown" />
  </div>
</template>

<style scoped>
.video-lesson {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.lesson-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-color, #e2e8f0);
  margin: 0;
}

.video-container {
  position: relative;
  width: 100%;
  padding-bottom: 56.25%;
  border-radius: 12px;
  overflow: hidden;
  background: #000;
}

.video-iframe {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: none;
}

.video-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px;
  border-radius: var(--radius-card, 12px);
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  backdrop-filter: blur(var(--glass-blur, 12px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  color: var(--text-color-secondary, #64748b);
}

.video-placeholder p {
  margin: 0;
  font-size: 14px;
}

.channel-info {
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-color, #e2e8f0);
  margin: 0 0 10px;
}

.points-list {
  margin: 0;
  padding: 0 0 0 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.points-list li {
  font-size: 14px;
  color: var(--text-color, #e2e8f0);
  line-height: 1.6;
}

.timestamp-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.timestamp-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 10px;
  border-radius: 6px;
  transition: background 0.15s;
}

.timestamp-item:hover {
  background: rgba(255, 255, 255, 0.03);
}

.timestamp-time {
  font-size: 13px;
  font-weight: 600;
  color: #3b82f6;
  font-family: 'SF Mono', 'JetBrains Mono', monospace;
  min-width: 50px;
}

.timestamp-label {
  font-size: 13px;
  color: var(--text-color, #e2e8f0);
}

.transcript-section {
  border-radius: var(--radius-md, 10px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  backdrop-filter: blur(var(--glass-blur, 12px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
  overflow: hidden;
}

.transcript-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 16px;
  border: none;
  background: transparent;
  color: var(--text-color, #e2e8f0);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition-fast, 150ms ease);
}

.transcript-toggle:hover {
  background: var(--glass-bg-hover, rgba(50, 50, 50, 0.65));
}

.transcript-text {
  padding: 16px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-color-secondary, #94a3b8);
  max-height: 400px;
  overflow-y: auto;
  white-space: pre-wrap;
  background: transparent;
  border-top: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
}

.transcript-text::-webkit-scrollbar {
  width: 4px;
}

.transcript-text::-webkit-scrollbar-thumb {
  background: var(--border-color, #333338);
  border-radius: 2px;
}

</style>
