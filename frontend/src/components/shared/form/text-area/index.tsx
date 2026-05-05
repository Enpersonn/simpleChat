import type { ComponentPropsWithoutRef } from 'preact/compat';
import { forwardRef } from 'preact/compat';
import { cn } from '@/utils/classes';

const TextArea = forwardRef<
	HTMLTextAreaElement,
	Omit<ComponentPropsWithoutRef<'textarea'>, 'rows'>
>(({ class: cls, disabled, ...props }, ref) => {
	return (
		<textarea
			ref={ref}
			class={cn(
				'w-full resize-y rounded-sm border border-border bg-bg-tertiary px-[10px] py-2 text-[13px] text-text-primary leading-normal transition-colors duration-150 placeholder:text-text-muted focus:border-accent focus:outline-none',
				disabled && 'cursor-not-allowed opacity-50',
				cls,
			)}
			disabled={disabled}
			{...props}
		/>
	);
});

export default TextArea;
