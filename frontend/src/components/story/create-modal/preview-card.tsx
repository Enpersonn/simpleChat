import { f } from '../../shared/formCls';

export function PreviewCard({
	icon,
	name,
	sub,
	importance,
}: {
	icon: string;
	name: string;
	sub?: string;
	importance?: number;
}) {
	return (
		<div class={f.previewCard}>
			<span class="shrink-0 text-[14px]">{icon}</span>
			<div class="min-w-0 flex-1">
				<div class="overflow-hidden text-ellipsis whitespace-nowrap font-medium text-text-primary text-xs">
					{name}
				</div>
				{sub && (
					<div class="mt-px text-[11px] text-text-muted leading-[1.4]">
						{sub}
					</div>
				)}
			</div>
			{importance !== undefined && (
				<div class="h-0.75 w-7 shrink-0 self-center rounded-full bg-bg-hover">
					<div
						class={
							importance >= 0.8
								? 'h-full rounded-full bg-accent'
								: 'h-full rounded-full bg-text-muted'
						}
						style={{ width: `${importance * 100}%` }}
					/>
				</div>
			)}
		</div>
	);
}
