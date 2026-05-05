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
		<div class="bg-bg-tertiary border border-accent rounded p-3.5 flex flex-col gap-1.5">
			<div class="flex items-center gap-2">
				<span
					class={`text-[10px] font-bold tracking-[0.08em] uppercase py-[2px] px-[7px] rounded-full shrink-0 ${BADGE_CLS[proposal.type]}`}
				>
					{TYPE_LABEL[proposal.type]}
				</span>
				<span class="text-[13px] font-semibold text-text-primary overflow-hidden text-ellipsis whitespace-nowrap">
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
							class="text-xs text-text-secondary overflow-hidden text-ellipsis whitespace-nowrap"
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
			<div class="flex gap-2 mt-1">
				<button
					class="flex-1 py-[5px] px-2.5 text-xs font-semibold rounded-sm bg-accent text-white transition-opacity duration-150 hover:enabled:opacity-85 disabled:opacity-50 disabled:cursor-not-allowed"
					onClick={onAccept}
					disabled={isAccepting}
				>
					{isAccepting ? 'Adding…' : 'Accept'}
				</button>
				<button
					class="py-[5px] px-3 text-xs rounded-sm bg-transparent text-text-muted border border-border-light transition-all duration-150 hover:enabled:text-text-primary hover:enabled:bg-bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
					onClick={onDecline}
					disabled={isAccepting}
				>
					Decline
				</button>
			</div>
		</div>
	);
}
