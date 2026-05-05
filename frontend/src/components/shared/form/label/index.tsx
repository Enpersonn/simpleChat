import type { ComponentPropsWithoutRef } from 'preact/compat';
import { forwardRef } from 'preact/compat';
import { cn } from '@/utils/classes';
import { useFormField } from '../form-field';

const Label = forwardRef<HTMLLabelElement, ComponentPropsWithoutRef<'label'>>(
	({ class: cls, children, ...props }, ref) => {
		const { invalid, formItemId, required } = useFormField();

		return (
			<label
				ref={ref}
				for={formItemId}
				class={cn(
					'font-semibold text-[11px] text-text-muted uppercase tracking-[0.06em]',
					invalid && 'text-error',
					cls,
				)}
				{...props}
			>
				{children}
				{required && <span class="ml-0.5 text-error">*</span>}
			</label>
		);
	},
);

export default Label;
