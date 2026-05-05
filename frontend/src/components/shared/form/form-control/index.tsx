import { forwardRef } from 'preact/compat';
import { Slot } from '../../Slot';
import { useFormField } from '../form-field';

type FormControlProps = {
	children: Parameters<typeof Slot>[0]['children'];
	class?: string;
};

const FormControl = forwardRef<HTMLElement, FormControlProps>(
	({ children, class: cls }, ref) => {
		const { error, formItemId, formDescriptionId, formMessageId } =
			useFormField();

		return (
			<Slot
				ref={ref}
				id={formItemId}
				aria-describedby={
					error
						? `${formDescriptionId} ${formMessageId}`
						: formDescriptionId
				}
				aria-invalid={!!error || undefined}
				class={cls}
			>
				{children}
			</Slot>
		);
	},
);

export default FormControl;
