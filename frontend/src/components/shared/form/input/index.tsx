import type { ComponentPropsWithoutRef } from 'preact/compat';
import { forwardRef } from 'preact/compat';
import { cn } from '@/utils/classes';

export const Input = forwardRef<
	HTMLInputElement,
	Omit<ComponentPropsWithoutRef<'input'>, 'size'>
>(({ class: cls, disabled, ...props }, ref) => {
	return (
		<input
			ref={ref}
			class={cn(
				'w-full rounded-sm border border-border bg-bg-tertiary px-2.5 py-2 text-[13px] text-text-primary transition-colors duration-150 placeholder:text-text-muted focus:border-accent focus:outline-none',
				disabled && 'cursor-not-allowed opacity-50',
				cls,
			)}
			disabled={disabled}
			{...props}
		/>
	);
});

export default Input;
