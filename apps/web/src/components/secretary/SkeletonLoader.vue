<script setup lang="ts">
defineProps<{
  variant: 'plan-card' | 'task-list' | 'chat-message' | 'file-list'
}>()
</script>

<template>
  <div
    class="skeleton"
    :class="variant"
  >
    <!-- plan-card variant -->
    <template v-if="variant === 'plan-card'">
      <div class="skel-row">
        <div class="skel-badge shimmer" />
        <div class="skel-line w60 shimmer" />
      </div>
      <div
        class="skel-line w80 shimmer"
        style="height: 8px; border-radius: 4px; margin-top: 12px"
      />
      <div
        class="skel-row"
        style="margin-top: 10px"
      >
        <div class="skel-line w30 shimmer" />
        <div class="skel-line w30 shimmer" />
      </div>
    </template>

    <!-- task-list variant -->
    <template v-if="variant === 'task-list'">
      <div
        v-for="i in 5"
        :key="i"
        class="skel-task-row"
      >
        <div class="skel-circle shimmer" />
        <div class="skel-line w15 shimmer" />
        <div
          class="skel-line shimmer"
          :style="{ width: `${40 + ((i * 8) % 30)}%` }"
        />
      </div>
    </template>

    <!-- chat-message variant -->
    <template v-if="variant === 'chat-message'">
      <div
        v-for="i in 3"
        :key="i"
        class="skel-message"
        :class="i % 2 === 1 ? 'right' : 'left'"
      >
        <div
          class="skel-line shimmer"
          :style="{ width: `${50 + ((i * 12) % 30)}%`, height: `${24 + i * 8}px` }"
        />
      </div>
    </template>

    <!-- file-list variant -->
    <template v-if="variant === 'file-list'">
      <div
        v-for="i in 6"
        :key="i"
        class="skel-file-row"
      >
        <div
          class="skel-circle shimmer"
          style="width: 14px; height: 14px"
        />
        <div
          class="skel-line shimmer"
          :style="{ width: `${40 + ((i * 10) % 35)}%` }"
        />
        <div
          class="skel-line w20 shimmer"
          style="margin-left: auto"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.skeleton {
  padding: 16px;
  border-radius: 12px;
  background: var(--card-bg, #242428);
  border: 1px solid var(--border-color, #333338);
}

.skel-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.skel-badge {
  width: 60px;
  height: 20px;
  border-radius: 10px;
}

.skel-line {
  height: 12px;
  border-radius: 6px;
}

.skel-circle {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  flex-shrink: 0;
}

.w15 {
  width: 15%;
}
.w20 {
  width: 20%;
}
.w30 {
  width: 30%;
}
.w60 {
  width: 60%;
}
.w80 {
  width: 80%;
}

.skel-task-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}

.skel-message {
  margin-bottom: 10px;
}

.skel-message.right {
  display: flex;
  justify-content: flex-end;
}

.skel-message.left {
  display: flex;
  justify-content: flex-start;
}

.skel-file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}

.shimmer {
  background: linear-gradient(90deg, #1a1a1e 25%, #2a2a2e 50%, #1a1a1e 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
