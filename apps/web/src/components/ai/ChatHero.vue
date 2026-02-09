<script setup lang="ts">
/**
 * ChatHero - 4-quadrant suggestion layout for empty chat state
 * Features: "SUGGESTED FOR YOU" header, 2 crossing lines (no outer border), 4 recommendation cards
 */

interface Recommendation {
  id: string
  title: string
  description: string
  action: string
}

const emit = defineEmits<{
  select: [rec: Recommendation]
}>()

const recommendations: Recommendation[] = [
  {
    id: 'vae',
    title: 'Explain VAE vs DAG',
    description: 'Compare Variational Autoencoders and DAG models from your Deep Learning notes.',
    action: 'Compare',
  },
  {
    id: 'neural',
    title: 'Quiz on Neural Pathways',
    description: 'Test your understanding of synaptic plasticity from Neuroscience 2.',
    action: 'Start Quiz',
  },
  {
    id: 'quantum',
    title: 'Quantum Gates Cheatsheet',
    description: 'Generate a quick reference for Hadamard, CNOT, and Pauli gates.',
    action: 'Generate',
  },
  {
    id: 'react',
    title: 'React Hooks Deep Dive',
    description: 'Explain useEffect cleanup and dependency arrays from your React notes.',
    action: 'Explain',
  },
]
</script>

<template>
  <div class="chat-hero">
    <!-- Header with accent bar -->
    <div class="hero-header">
      <span class="accent-bar" />
      <span class="hero-label">SUGGESTED FOR YOU</span>
    </div>

    <!-- 4-quadrant grid with only crossing lines (no outer border) -->
    <div class="quadrant-grid">
      <button
        v-for="rec in recommendations"
        :key="rec.id"
        class="quadrant-card"
        @click="emit('select', rec)"
      >
        <span class="card-title">{{ rec.title }}</span>
        <span class="card-description">{{ rec.description }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-hero {
  padding: 32px 0 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  animation: fadeIn 0.4s ease-out;
}

.hero-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.accent-bar {
  width: 3px;
  height: 14px;
  background: #58a6ff;
  border-radius: 2px;
}

.hero-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color-secondary, #8b949e);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* 4-quadrant grid with ONLY crossing lines - no outer border */
.quadrant-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto auto;
  gap: 0;
  /* No outer border */
}

.quadrant-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px;
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
  position: relative;
}

/* Only crossing lines - top row has bottom border, left column has right border */
.quadrant-card:nth-child(1) {
  border-right: 1px solid rgba(48, 54, 61, 0.6);
  border-bottom: 1px solid rgba(48, 54, 61, 0.6);
}

.quadrant-card:nth-child(2) {
  border-bottom: 1px solid rgba(48, 54, 61, 0.6);
}

.quadrant-card:nth-child(3) {
  border-right: 1px solid rgba(48, 54, 61, 0.6);
}

.quadrant-card:nth-child(4) {
  /* No borders - bottom right corner */
}

.quadrant-card:hover {
  background: rgba(255, 255, 255, 0.03);
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color, #e6edf3);
  line-height: 1.3;
}

.card-description {
  font-size: 12px;
  color: var(--text-color-secondary, #8b949e);
  line-height: 1.5;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
