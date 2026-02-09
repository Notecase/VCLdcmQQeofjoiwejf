import { ref, computed, onMounted, onUnmounted } from 'vue'

const STORAGE_KEY = 'inkdown-fab-position'
const SNAP_MARGIN = 16
const DRAG_THRESHOLD = 5

interface Position {
  x: number
  y: number
}

export function useFloatingPosition(size = 56) {
  const position = ref<Position>({ x: -1, y: -1 })
  const isDragging = ref(false)

  let startX = 0
  let startY = 0
  let startPosX = 0
  let startPosY = 0
  let hasMoved = false
  let rafId = 0

  function loadPosition() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as Position
        position.value = clampPosition(parsed)
        return
      }
    } catch {
      /* ignore */
    }
    // Default: bottom-right corner
    position.value = {
      x: window.innerWidth - size - SNAP_MARGIN,
      y: window.innerHeight - size - SNAP_MARGIN - 80,
    }
  }

  function savePosition() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(position.value))
    } catch {
      /* ignore */
    }
  }

  function clampPosition(pos: Position): Position {
    return {
      x: Math.max(SNAP_MARGIN, Math.min(pos.x, window.innerWidth - size - SNAP_MARGIN)),
      y: Math.max(SNAP_MARGIN, Math.min(pos.y, window.innerHeight - size - SNAP_MARGIN)),
    }
  }

  function snapToNearestEdge() {
    const { x, y } = position.value
    const cx = x + size / 2
    const cy = y + size / 2
    const vw = window.innerWidth
    const vh = window.innerHeight

    const distances = {
      left: cx,
      right: vw - cx,
      top: cy,
      bottom: vh - cy,
    }

    const nearest = (Object.keys(distances) as Array<keyof typeof distances>).reduce((a, b) =>
      distances[a] < distances[b] ? a : b
    )

    const snapped = { ...position.value }
    if (nearest === 'left') snapped.x = SNAP_MARGIN
    else if (nearest === 'right') snapped.x = vw - size - SNAP_MARGIN
    else if (nearest === 'top') snapped.y = SNAP_MARGIN
    else snapped.y = vh - size - SNAP_MARGIN

    position.value = clampPosition(snapped)
    savePosition()
  }

  function onPointerDown(e: PointerEvent) {
    startX = e.clientX
    startY = e.clientY
    startPosX = position.value.x
    startPosY = position.value.y
    hasMoved = false
    isDragging.value = false

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
  }

  function onPointerMove(e: PointerEvent) {
    const dx = e.clientX - startX
    const dy = e.clientY - startY

    if (!hasMoved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
      return
    }

    hasMoved = true
    isDragging.value = true

    cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => {
      position.value = clampPosition({
        x: startPosX + dx,
        y: startPosY + dy,
      })
    })
  }

  function onPointerUp() {
    document.removeEventListener('pointermove', onPointerMove)
    document.removeEventListener('pointerup', onPointerUp)

    if (hasMoved) {
      snapToNearestEdge()
    }

    // Reset dragging after a tick so click handler can check it
    requestAnimationFrame(() => {
      isDragging.value = false
    })
  }

  function onResize() {
    position.value = clampPosition(position.value)
  }

  onMounted(() => {
    loadPosition()
    window.addEventListener('resize', onResize)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', onResize)
    cancelAnimationFrame(rafId)
  })

  const style = computed(() => ({
    position: 'fixed' as const,
    left: `${position.value.x}px`,
    top: `${position.value.y}px`,
    zIndex: 9999,
    transition: isDragging.value
      ? 'none'
      : 'left 0.4s cubic-bezier(0.16, 1, 0.3, 1), top 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
  }))

  return {
    position,
    isDragging,
    style,
    onPointerDown,
    wasDragged: () => hasMoved,
  }
}
