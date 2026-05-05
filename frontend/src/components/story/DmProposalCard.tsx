import type { DmProposal } from '@simplechat/types';

interface Props {
	proposal: DmProposal;
	onAccept: () => Promise<void>;
	onDecline: () => void;
	isAccepting: boolean;
}

function getPreviewLines(proposal: DmProposal): string[] {
	const d = proposal.entityData;
	const pub = (d.public ?? {}) as Record<string, unknown>;
	const lines: string[] = [];
	if (typeof d.name === 'string') lines.push(d.name);
	if (typeof d.role === 'string') lines.push(d.role);
	if (typeof d.description === 'string') lines.push(d.description);
	if (typeof d.summary === 'string') lines.push(d.summary);
	if (typeof d.characterName === 'string' && proposal.type === 'memory')
		lines.push(`For: ${d.characterName}`);
	const personality = Array.isArray(pub.personality)
		? (pub.personality as string[])
		: Array.isArray(d.personality)
			? (d.personality as string[])
			: [];
	if (personality.length > 0) lines.push(personality.slice(0, 3).join(', '));
	const appearance =
		typeof pub.appearance === 'string'
			? pub.appearance
			: typeof d.appearance === 'string'
				? d.appearance
				: '';
	if (appearance) lines.push(appearance);
	return lines.filter(Boolean);
}

const TYPE_LABEL: Record<DmProposal['type'], string> = {
	character: 'Character',
	location: 'Location',
	memory: 'Backstory',
};

const BADGE_CLS: Record<DmProposal['type'], string> = {
	character: 'bg-[#6c63ff22] text-[#9d97ff] border border-[#6c63ff44]',
	location: 'bg-[#22aa6633] text-[#5dd9a0] border border-[#22aa6655]',
	memory: 'bg-[#cc880033] text-[#ffcc55] border border-[#cc880055]',
};

export function DmProposalCard({
	proposal,
	onAccept,
	onDecline,
	isAccepting,
}: Props) {
	const preview = getPreviewLines(proposal);

	return (
		<div class="flex flex-col gap-1.5 rounded border border-accent bg-bg-tertiary p-3.5">
			<div class="flex items-center gap-2">
				<span
					class={`shrink-0 rounded-full px-[7px] py-[2px] font-bold text-sm uppercase tracking-[0.08em] ${BADGE_CLS[proposal.type]}`}
				>
					{TYPE_LABEL[proposal.type]}
				</span>
				<span class="overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-[13px] text-text-primary">
					{typeof proposal.entityData.name === 'string'
						? proposal.entityData.name
						: TYPE_LABEL[proposal.type]}
				</span>
			</div>
			{preview.slice(1).length > 0 && (
				<div class="flex flex-col gap-0.5">
					{preview.slice(1).map((line, i) => (
						<div
							key={i}
							class="overflow-hidden text-ellipsis whitespace-nowrap text-text-secondary text-xs"
						>
							{line}
						</div>
					))}
				</div>
			)}
			{proposal.rationale && (
				<div class="text-[11px] text-text-muted italic leading-[1.4]">
					{proposal.rationale}
				</div>
			)}
			<div class="mt-1 flex gap-2">
				<button
					class="flex-1 rounded-sm bg-accent px-2.5 py-[5px] font-semibold text-white text-xs transition-opacity duration-150 hover:enabled:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
					onClick={onAccept}
					disabled={isAccepting}
				>
					{isAccepting ? 'Adding…' : 'Accept'}
				</button>
				<button
					class="rounded-sm border border-border-light bg-transparent px-3 py-[5px] text-text-muted text-xs transition-all duration-150 hover:enabled:bg-bg-hover hover:enabled:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
					onClick={onDecline}
					disabled={isAccepting}
				>
					Decline
				</button>
			</div>
		</div>
	);
}
