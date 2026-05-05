import type { ComponentChildren } from 'preact';
import { createContext } from 'preact';
import { createPortal, type ReactElement } from 'preact/compat';
import { useContext, useState } from 'preact/hooks';
import { cn } from '@/utils/classes';
import { Slot } from './Slot';

type DialogCtx = { open: boolean; onOpen: () => void; onClose: () => void };
const DialogContext = createContext<DialogCtx>({
	onClose: () => {},
	onOpen: () => {},
	open: false,
});

export const useDialog = () => useContext(DialogContext);

type DialogProps = {
	children: ComponentChildren;
	defaultOpen?: boolean;
	onClose?: () => void;
	onOpen?: () => void;
};

export const Dialog = ({
	children,
	defaultOpen = false,
	onClose: onCloseProp,
	onOpen: onOpenProp,
}: DialogProps) => {
	const [open, setOpen] = useState(defaultOpen);

	const handleOpen = () => {
		setOpen(true);
		onOpenProp?.();
	};
	const handleClose = () => {
		setOpen(false);
		onCloseProp?.();
	};

	return (
		<DialogContext.Provider
			value={{ onClose: handleClose, onOpen: handleOpen, open }}
		>
			{children}
		</DialogContext.Provider>
	);
};

type TriggerProps = {
	children: ReactElement;
	asChild?: boolean;
};

export const DialogTrigger = ({ children, asChild = false }: TriggerProps) => {
	const { onOpen } = useContext(DialogContext);
	if (asChild) {
		return <Slot onClick={onOpen}>{children}</Slot>;
	}
	return (
		<button type="button" onClick={onOpen}>
			{children}
		</button>
	);
};

type BaseProps = {
	children: ComponentChildren;
	class?: string;
};

export const DialogContent = ({ children, class: cls }: BaseProps) => {
	const { open, onClose } = useContext(DialogContext);
	if (!open) return null;
	return createPortal(
		<div
			role="none"
			class="fixed inset-0 z-100 flex items-center justify-center bg-black/65 backdrop-blur-sm"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
			onKeyDown={(e) => {
				if (e.key === 'Escape') onClose();
			}}
		>
			<div
				class={cn(
					'flex max-h-[calc(100vh-64px)] max-w-[calc(100vw-32px)] flex-col gap-[18px] overflow-y-auto rounded-lg border border-border-light bg-bg-secondary p-6 shadow-lg',
					cls,
				)}
			>
				{children}
			</div>
		</div>,
		document.body,
	);
};

export const DialogHeader = ({ children, class: cls }: BaseProps) => (
	<div class={cn('flex shrink-0 items-center justify-between', cls)}>
		{children}
	</div>
);

export const DialogTitle = ({ children, class: cls }: BaseProps) => (
	<h2
		class={cn(
			'font-display font-semibold text-[15px] text-text-primary tracking-wider',
			cls,
		)}
	>
		{children}
	</h2>
);

export const DialogClose = ({ class: cls }: { class?: string }) => {
	const { onClose } = useContext(DialogContext);
	return (
		<button
			type="button"
			class={cn(
				'rounded-sm px-1.5 py-0.5 text-[18px] text-text-muted transition-colors duration-150 hover:bg-bg-hover hover:text-text-primary',
				cls,
			)}
			onClick={onClose}
		>
			✕
		</button>
	);
};

export const DialogFooter = ({ children, class: cls }: BaseProps) => (
	<div class={cn('flex shrink-0 justify-end gap-2 pt-1', cls)}>
		{children}
	</div>
);
