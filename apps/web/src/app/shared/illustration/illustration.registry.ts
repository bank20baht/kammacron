/** Small application artwork only; explicit statuses and functional icons belong to the UI. */
export const ILLUSTRATIONS = {
  cloud: '/illustrations/objects/cloud.webp?v=workshop-2',
  gear: '/illustrations/objects/gear.webp?v=workshop-2',
  mug: '/illustrations/objects/mug.webp?v=workshop-2',
  mirror: '/illustrations/objects/mirror.webp?v=workshop-2',
  clock: '/illustrations/objects/clock.webp?v=workshop-2',
  wheel: '/illustrations/objects/wheel.webp?v=workshop-2',
  rice: '/illustrations/objects/rice.webp?v=workshop-2',
  calendar: '/illustrations/objects/calendar.webp?v=workshop-2',
  toolbox: '/illustrations/objects/toolbox.webp?v=workshop-2',
  banknote: '/illustrations/objects/banknote.webp?v=workshop-2',
} as const

export type Illustration = keyof typeof ILLUSTRATIONS

/** Unknown and stale states deliberately have no metaphor. */
export const runIllustration = (status: string): Illustration | null => {
  switch (status) {
    case 'running':
      return 'gear'
    case 'succeeded':
      return 'rice'
    case 'review':
      return 'mirror'
    case 'failed':
      return 'wheel'
    case 'stopped':
      return 'mug'
    default:
      return null
  }
}

/** Global pause wins over active runs, matching the existing shell status label. */
export const workerIllustration = (worker: {
  paused: boolean
  running: readonly unknown[]
}): Illustration => (worker.paused ? 'mug' : worker.running.length > 0 ? 'gear' : 'cloud')
