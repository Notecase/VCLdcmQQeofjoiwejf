import { ref, onMounted } from 'vue'
import { authFetch } from '@/utils/api'

const soulContent = ref('')
const soulLoading = ref(false)
const soulSaving = ref(false)

let saveTimer: ReturnType<typeof setTimeout> | null = null

async function loadSoul() {
  soulLoading.value = true
  try {
    const res = await authFetch('/api/context/soul')
    if (res.ok) {
      const data = await res.json()
      soulContent.value = data.content || ''
    }
  } finally {
    soulLoading.value = false
  }
}

async function saveSoul() {
  soulSaving.value = true
  try {
    await authFetch('/api/context/soul', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: soulContent.value }),
    })
  } finally {
    soulSaving.value = false
  }
}

function debouncedSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(saveSoul, 2000)
}

export function useSoul() {
  onMounted(() => {
    if (!soulContent.value && !soulLoading.value) {
      loadSoul()
    }
  })

  return {
    soulContent,
    soulLoading,
    soulSaving,
    loadSoul,
    saveSoul,
    debouncedSave,
  }
}
