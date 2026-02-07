<script setup lang="ts">
/**
 * ChatHero - Empty state hero with recommendation prompts
 */
import { type Component } from 'vue'
import {
  Sparkles,
  Brain,
  Code,
  Lightbulb,
} from 'lucide-vue-next'

interface Recommendation {
  id: string
  icon: Component
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
    icon: Brain,
    title: 'Explain VAE vs DAG',
    description: 'Compare Variational Autoencoders and DAG models from your Deep Learning notes.',
    action: 'Compare',
  },
  {
    id: 'neural',
    icon: Lightbulb,
    title: 'Quiz on Neural Pathways',
    description: 'Test your understanding of synaptic plasticity from Neuroscience 2.',
    action: 'Start Quiz',
  },
  {
    id: 'quantum',
    icon: Sparkles,
    title: 'Quantum Gates Cheatsheet',
    description: 'Generate a quick reference for Hadamard, CNOT, and Pauli gates.',
    action: 'Generate',
  },
  {
    id: 'react',
    icon: Code,
    title: 'React Hooks Deep Dive',
    description: 'Explain useEffect cleanup and dependency arrays from your React notes.',
    action: 'Explain',
  },
]
</script>

<template>
  <div class="chat-hero">
    <div class="hero-card">
      <div class="hero-icon">
        <Sparkles :size="18" />
      </div>
      <div>
        <h2>Start a guided session</h2>
        <p>Ask for summaries, generate study plans, or draft edits with inline diffs you can review.</p>
      </div>
    </div>

    <div class="prompt-grid">
      <button
        v-for="rec in recommendations"
        :key="rec.id"
        class="prompt-card"
        @click="emit('select', rec)"
      >
        <div class="prompt-icon">
          <component :is="rec.icon" :size="18" />
        </div>
        <div>
          <h3>{{ rec.title }}</h3>
          <p>{{ rec.description }}</p>
          <span class="prompt-action">{{ rec.action }} -></span>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-hero {
  padding: 32px 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  animation: fadeIn 0.5s ease-out;
}

.hero-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px;
  border-radius: 14px;
  border: 1px solid rgba(124, 158, 248, 0.2);
  background: rgba(124, 158, 248, 0.06);
}

.hero-card h2 {
  font-size: 17px;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--text-color, #e6edf3);
}

.hero-card p {
  font-size: 13px;
  color: var(--text-color-secondary, #8b949e);
}

.hero-icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: rgba(124, 158, 248, 0.15);
  color: var(--primary-color, #7c9ef8);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.prompt-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.prompt-card {
  display: flex;
  gap: 10px;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid var(--border-color, #30363d);
  background: transparent;
  text-align: left;
  transition: background 0.15s;
  cursor: pointer;
}

.prompt-card:hover {
  background: rgba(255, 255, 255, 0.04);
}

.prompt-card h3 {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 4px;
  color: var(--text-color, #e6edf3);
}

.prompt-card p {
  font-size: 12px;
  color: var(--text-color-secondary, #8b949e);
  margin-bottom: 6px;
}

.prompt-action {
  font-size: 12px;
  color: var(--primary-color, #7c9ef8);
  font-weight: 500;
}

.prompt-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--primary-color, #7c9ef8);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 720px) {
  .prompt-grid {
    grid-template-columns: 1fr;
  }
}
</style>
