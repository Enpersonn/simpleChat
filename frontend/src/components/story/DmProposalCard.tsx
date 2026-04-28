import type { DmProposal } from '@simplechat/types'
import s from './DmProposalCard.module.css'

interface Props {
  proposal: DmProposal
  onAccept: () => Promise<void>
  onDecline: () => void
  isAccepting: boolean
}

function getPreviewLines(proposal: DmProposal): string[] {
  const d = proposal.entityData
  const pub = (d.public ?? {}) as Record<string, unknown>
  const lines: string[] = []
  if (typeof d.name === 'string') lines.push(d.name)
  if (typeof d.role === 'string') lines.push(d.role)
  if (typeof d.description === 'string') lines.push(d.description)
  if (typeof d.summary === 'string') lines.push(d.summary)
  if (typeof d.characterName === 'string' && proposal.type === 'memory')
    lines.push(`For: ${d.characterName}`)
  const personality = Array.isArray(pub.personality) ? pub.personality as string[] :
    Array.isArray(d.personality) ? d.personality as string[] : []
  if (personality.length > 0) lines.push(personality.slice(0, 3).join(', '))
  const appearance = typeof pub.appearance === 'string' ? pub.appearance :
    typeof d.appearance === 'string' ? d.appearance : ''
  if (appearance) lines.push(appearance)
  return lines.filter(Boolean)
}

const TYPE_LABEL: Record<DmProposal['type'], string> = {
  character: 'Character',
  location: 'Location',
  memory: 'Backstory',
}

export function DmProposalCard({ proposal, onAccept, onDecline, isAccepting }: Props) {
  const preview = getPreviewLines(proposal)

  return (
    <div class={s.card}>
      <div class={s.header}>
        <span class={s.badge} data-type={proposal.type}>{TYPE_LABEL[proposal.type]}</span>
        <span class={s.title}>{typeof proposal.entityData.name === 'string' ? proposal.entityData.name : TYPE_LABEL[proposal.type]}</span>
      </div>
      {preview.slice(1).length > 0 && (
        <div class={s.preview}>
          {preview.slice(1).map((line, i) => <div key={i} class={s.previewLine}>{line}</div>)}
        </div>
      )}
      {proposal.rationale && (
        <div class={s.rationale}>{proposal.rationale}</div>
      )}
      <div class={s.actions}>
        <button
          class={s.acceptBtn}
          onClick={onAccept}
          disabled={isAccepting}
        >
          {isAccepting ? 'Adding…' : 'Accept'}
        </button>
        <button class={s.declineBtn} onClick={onDecline} disabled={isAccepting}>
          Decline
        </button>
      </div>
    </div>
  )
}
