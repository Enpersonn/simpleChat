import { f } from '../../shared/formCls';

export function SkeletonBlock({ lines }: { lines: number }) {
	return (
		<div class="flex flex-col gap-1.5">
			{Array.from({ length: lines }).map((_, i) => (
				<div
					key={i}
					class={f.previewSkeleton}
					style={{
						borderRadius: '4px',
						height: i === 0 ? '20px' : '12px',
						width: i === 0 ? '70%' : '45%',
					}}
				/>
			))}
		</div>
	);
}

export function SkeletonCard() {
	return (
		<div
			class={f.previewSkeleton}
			style={{ borderRadius: '4px', height: '38px', marginTop: '6px' }}
		/>
	);
}
