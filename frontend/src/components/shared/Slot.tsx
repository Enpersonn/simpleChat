import React from 'preact/compat';
import { cn } from '@/utils/classes';

type SlotProps<T extends HTMLElement = HTMLElement> =
	React.HTMLAttributes<T> & {
		children: React.ReactElement<{ className?: string; class?: string }>;
	};

function SlotInner<T extends HTMLElement>(
	{ children, className, class: cls, ...props }: SlotProps<T>,
	ref: React.Ref<T>,
) {
	if (!React.isValidElement(children)) return null;

	return React.cloneElement(children, {
		...props,
		className: cn(
			children.props.className,
			children.props.class,
			className,
			cls,
		),
		...(ref ? { ref } : {}),
	});
}

export const Slot = React.forwardRef(SlotInner) as <
	T extends HTMLElement = HTMLElement,
>(
	props: SlotProps<T> & { ref?: React.Ref<T> },
) => React.ReactElement | null;

(Slot as { displayName?: string }).displayName = 'Slot';
