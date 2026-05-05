import type { ComponentPropsWithoutRef } from 'preact/compat';
import { forwardRef } from 'preact/compat';
import { cn } from '@/utils/classes';
import { useFormField } from '../form-field';

const FormDescription = forwardRef<
	HTMLParagraphElement,
	ComponentPropsWithoutRef<'p'>
>(({ class: cls, ...props }, ref) => {
	const { formDescriptionId } = useFormField();

	return (
		<p
			ref={ref}
			id={formDescriptionId}
			class={cn('text-text-muted text-xs', cls)}
			{...props}
		/>
	);
});

export default FormDescription;
