import type { ChatMode } from '@simplechat/types'

const LABELS: Record<ChatMode, string> = {
  interactive: 'RP',
  storyteller: 'Story',
  planning: 'Plan',
}

interface Props {
  mode: ChatMode
  long?: boolean
}

export function ModeTag({ mode, long = false }: Props) {
  const label = long
    ? (mode === 'interactive' ? 'Interactive RP' : mode === 'storyteller' ? 'Storyteller' : 'Planning')
    : LABELS[mode] ?? mode

  const cls = [
    'text-[9px] font-semibold tracking-[0.05em] uppercase px-[7px] py-[2px] rounded-full shrink-0 border',
    mode === 'interactive' ? 'bg-accent-dim text-accent border-accent-border' :
    mode === 'storyteller' ? 'bg-warning-dim text-warning border-warning-border' :
    'bg-bg-tertiary text-text-muted border-border',
  ].join(' ')

  return <span class={cls} data-mode={mode}>{label}</span>
}
