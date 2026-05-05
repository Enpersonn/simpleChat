import type { ContextSnapshot } from '../../lib/debug-types.js'

interface Props {
  snapshot: ContextSnapshot | null
}

interface GraphNode {
  id: string
  label: string
  fullLabel: string
  cx: number
  cy: number
  active: boolean
  kind: 'story' | 'persona' | 'speaker' | 'char' | 'memory' | 'location' | 'mood'
}

interface GraphEdge {
  x1: number
  y1: number
  x2: number
  y2: number
  active: boolean
  dashed: boolean
}

const SVG_WIDTH = 252
const ROW_H = 60
const NODE_R = 16
const NODE_GAP = 6

const LANE_LABELS = ['Story', 'Personas', 'Speaker', 'Others', 'Memories', 'Locations', 'Mood']

function placeRow(
  items: Array<{ id: string; label: string; fullLabel: string; active: boolean; kind: GraphNode['kind'] }>,
  rowIndex: number,
): GraphNode[] {
  if (items.length === 0) return []
  const nodeW = NODE_R * 2
  const totalW = items.length * nodeW + (items.length - 1) * NODE_GAP
  const startX = (SVG_WIDTH - totalW) / 2 + NODE_R
  const cy = rowIndex * ROW_H + ROW_H / 2
  return items.map((item, i) => ({
    ...item,
    cx: startX + i * (nodeW + NODE_GAP),
    cy,
  }))
}

function buildGraph(snapshot: ContextSnapshot): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  // Row 0: Story
  nodes.push(...placeRow([{
    id: 'story',
    label: snapshot.story.title.slice(0, 7),
    fullLabel: snapshot.story.title,
    active: true,
    kind: 'story',
  }], 0))

  // Row 1: User personas
  const personas = snapshot.characters.filter((c) => c.isUserPersona)
  nodes.push(...placeRow(personas.map((c) => ({
    id: c.id,
    label: c.name.slice(0, 7),
    fullLabel: `${c.name} — ${c.role} (persona)`,
    active: true,
    kind: 'persona' as GraphNode['kind'],
  })), 1))

  // Row 2: Active speaker
  const speaker = snapshot.characters.find((c) => c.id === snapshot.activeSpeakerId)
  if (speaker) {
    nodes.push(...placeRow([{
      id: speaker.id,
      label: speaker.name.slice(0, 7),
      fullLabel: buildCharFullLabel(speaker),
      active: true,
      kind: 'speaker',
    }], 2))
  }

  // Row 3: Other chars (non-persona, non-speaker, non-narrator)
  const others = snapshot.characters.filter(
    (c) => !c.isUserPersona && c.id !== snapshot.activeSpeakerId && !c.isNarrator,
  )
  nodes.push(...placeRow(others.map((c) => ({
    id: c.id,
    label: c.name.slice(0, 7),
    fullLabel: buildCharFullLabel(c),
    active: true,
    kind: 'char' as GraphNode['kind'],
  })), 3))

  // Row 4: Memories (accessible chain, split active/dim)
  const injectedSet = new Set(snapshot.injectedMemoryIds)
  nodes.push(...placeRow(snapshot.accessibleMemories.map((m) => ({
    id: m.id,
    label: m.summary.slice(0, 7),
    fullLabel: `${m.summary}\nTags: ${m.tags.join(', ')}\nImportance: ${m.importance.toFixed(2)}`,
    active: injectedSet.has(m.id),
    kind: 'memory' as GraphNode['kind'],
  })), 4))

  // Row 5: Locations
  nodes.push(...placeRow(snapshot.locations.map((l) => ({
    id: l.id,
    label: l.name.slice(0, 7),
    fullLabel: l.name + (l.isCurrent ? ' (current)' : ''),
    active: l.isCurrent,
    kind: 'location' as GraphNode['kind'],
  })), 5))

  // Row 6: Mood node (if any mood or feel text)
  if (snapshot.moodTags.length > 0 || snapshot.feelText.trim()) {
    const moodLabel = snapshot.moodTags.length > 0
      ? snapshot.moodTags.join(', ')
      : snapshot.feelText.slice(0, 60)
    nodes.push(...placeRow([{
      id: 'mood',
      label: 'Mood',
      fullLabel: `Mood: ${moodLabel}`,
      active: true,
      kind: 'mood',
    }], 6))
  }

  // Edges: speaker → memories
  const speakerNode = nodes.find((n) => n.id === snapshot.activeSpeakerId)
  if (speakerNode) {
    for (const mem of snapshot.accessibleMemories) {
      const memNode = nodes.find((n) => n.id === mem.id)
      if (!memNode) continue
      const active = injectedSet.has(mem.id)
      edges.push({
        x1: speakerNode.cx,
        y1: speakerNode.cy + NODE_R,
        x2: memNode.cx,
        y2: memNode.cy - NODE_R,
        active,
        dashed: !active,
      })
    }

    // Edge: speaker → current location
    if (snapshot.currentLocationId) {
      const locNode = nodes.find((n) => n.id === snapshot.currentLocationId)
      if (locNode) {
        edges.push({
          x1: speakerNode.cx,
          y1: speakerNode.cy + NODE_R,
          x2: locNode.cx,
          y2: locNode.cy - NODE_R,
          active: true,
          dashed: false,
        })
      }
    }
  }

  return { nodes, edges }
}

function buildCharFullLabel(c: ContextSnapshot['characters'][0]): string {
  const parts = [`${c.name} — ${c.role}`]
  const personalityAdded = c.effectivePersonality.filter((t) => !c.basePersonality.includes(t))
  const personalityRemoved = c.basePersonality.filter((t) => !c.effectivePersonality.includes(t))
  if (personalityAdded.length > 0) parts.push(`+${personalityAdded.join(', ')}`)
  if (personalityRemoved.length > 0) parts.push(`−${personalityRemoved.join(', ')}`)
  if (c.effectiveSpeechStyle !== c.baseSpeechStyle && c.effectiveSpeechStyle)
    parts.push(`speech: ${c.effectiveSpeechStyle.slice(0, 40)}`)
  return parts.join('\n')
}

export function ContextGraph({ snapshot }: Props) {
  if (!snapshot) {
    return (
      <div class="text-[11px] text-text-muted text-center py-6">
        Send a message to see the context graph
      </div>
    )
  }

  const { nodes, edges } = buildGraph(snapshot)
  const hasRow6 = snapshot.moodTags.length > 0 || snapshot.feelText.trim()
  const svgHeight = (hasRow6 ? 7 : 6) * ROW_H

  return (
    <div class="overflow-x-auto">
      <svg
        class="block w-full"
        width={SVG_WIDTH}
        height={svgHeight}
        viewBox={`0 0 ${SVG_WIDTH} ${svgHeight}`}
      >
        {/* Lane backgrounds */}
        {LANE_LABELS.slice(0, hasRow6 ? 7 : 6).map((label, i) => (
          <g key={i}>
            <rect
              x={0}
              y={i * ROW_H}
              width={SVG_WIDTH}
              height={ROW_H}
              fill={i % 2 === 0 ? 'var(--bg-tertiary)' : 'var(--bg-secondary)'}
              opacity={0.5}
            />
            <text
              x={SVG_WIDTH - 3}
              y={i * ROW_H + 10}
              text-anchor="end"
              font-size="7"
              fill="var(--text-muted)"
              opacity={0.7}
            >
              {label}
            </text>
          </g>
        ))}

        {/* Edges (drawn behind nodes) */}
        {edges.map((edge, i) => (
          <line
            key={i}
            x1={edge.x1}
            y1={edge.y1}
            x2={edge.x2}
            y2={edge.y2}
            stroke={edge.active ? 'var(--accent)' : 'var(--border)'}
            stroke-width={edge.active ? 1.5 : 0.75}
            stroke-dasharray={edge.dashed ? '3,3' : undefined}
            opacity={edge.active ? 0.5 : 0.2}
          />
        ))}

        {/* Nodes */}
        {nodes.map((node) => (
          <g key={node.id}>
            <circle
              cx={node.cx}
              cy={node.cy}
              r={NODE_R}
              fill={node.active ? 'var(--accent)' : 'var(--bg-hover)'}
              stroke={node.active ? 'var(--accent-hover, var(--accent))' : 'var(--border)'}
              stroke-width={1.5}
              opacity={node.active ? 1 : 0.4}
            />
            <text
              x={node.cx}
              y={node.cy + 3}
              text-anchor="middle"
              font-size="7"
              fill={node.active ? '#fff' : 'var(--text-muted)'}
              opacity={node.active ? 1 : 0.7}
            >
              {node.label}
            </text>
            <title>{node.fullLabel}</title>
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div class="flex gap-2.5 mt-1.5 text-[9px] text-text-muted">
        <span class="flex items-center gap-[3px]">
          <span class="w-2 h-2 rounded-full bg-accent inline-block" />
          injected
        </span>
        <span class="flex items-center gap-[3px]">
          <span
            class="w-2 h-2 rounded-full bg-bg-hover border border-border inline-block"
            style={{ opacity: 0.6 }}
          />
          available
        </span>
        <span class="flex items-center gap-[3px]">
          <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke="var(--accent)" stroke-width="1.5" opacity="0.5" /></svg>
          in use
        </span>
        <span class="flex items-center gap-[3px]">
          <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke="var(--border)" stroke-width="0.75" stroke-dasharray="3,3" opacity="0.4" /></svg>
          accessible
        </span>
      </div>
    </div>
  )
}
