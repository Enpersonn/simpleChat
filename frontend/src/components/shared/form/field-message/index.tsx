import type { ComponentPropsWithoutRef } from 'preact/compat';
import { forwardRef } from 'preact/compat';
import { cn } from '@/utils/classes';
import { useFormField } from '../form-field';

export const FieldMessage = forwardRef<
	HTMLParagraphElement,
	ComponentPropsWithoutRef<'p'>
>(({ class: cls, children, ...props }, ref) => {
	const { error, formMessageId } = useFormField();
	const body = error ? String(error.message) : children;

	if (!body) return null;

	return (
		<p
			ref={ref}
			id={formMessageId}
			class={cn('text-error text-xs', cls)}
			aria-live="polite"
			aria-atomic="true"
			{...props}
		>
			{body}
		</p>
	);
});
