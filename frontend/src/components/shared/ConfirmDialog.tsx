import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from './Dialog.js';

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
	return (
		<Dialog defaultOpen={true} onClose={onCancel}>
			<DialogContent class="w-[400px]">
				<DialogHeader>
					<DialogTitle>Confirm</DialogTitle>
					<DialogClose />
				</DialogHeader>
				<p class="text-[13px] text-text-secondary leading-relaxed">
					{message}
				</p>
				<DialogFooter>
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
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
