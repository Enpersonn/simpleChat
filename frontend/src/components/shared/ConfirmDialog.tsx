import { createPortal } from 'preact/compat';

interface Props {
	message: string;
	confirmLabel?: string;
	onConfirm: () => void;
	onCancel: () => void;
}

export function ConfirmDialog({
	message,
	confirmLabel = 'Delete',
	onConfirm,
	onCancel,
}: Props) {
	return createPortal(
		<div
			role="none"
			class="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 backdrop-blur-sm"
			onClick={(e) => {
				if (e.target === e.currentTarget) onCancel();
			}}
			onKeyDown={(e) => {
				if (e.key === 'Escape') onCancel();
			}}
		>
			<div class="flex max-h-[calc(100vh-64px)] w-full max-w-[400px] flex-col gap-[18px] overflow-y-auto rounded-lg border border-border-light bg-bg-secondary p-6 shadow-lg">
				<div class="flex items-center justify-between">
					<span class="font-display font-semibold text-[15px] text-text-primary tracking-[0.05em]">
						Confirm
					</span>
					<button
						type="button"
						class="rounded px-[6px] py-[2px] text-[18px] text-text-muted transition-colors duration-150 hover:bg-bg-hover hover:text-text-primary"
						onClick={onCancel}
					>
						✕
					</button>
				</div>
				<p class="text-[13px] text-text-secondary leading-relaxed">
					{message}
				</p>
				<div class="flex justify-end gap-2 pt-1">
					<button
						type="button"
						class="rounded border border-border bg-bg-tertiary px-4 py-2 text-[13px] text-text-secondary transition-all duration-150 hover:border-accent hover:text-text-primary"
						onClick={onCancel}
					>
						Cancel
					</button>
					<button
						type="button"
						class="rounded bg-error px-5 py-2 font-medium text-[13px] text-text-on-accent transition-colors duration-150 hover:opacity-85"
						onClick={onConfirm}
					>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>,
		document.body,
	);
}
