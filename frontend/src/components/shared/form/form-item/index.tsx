import { forwardRef } from 'preact/compat';
import { useId } from 'preact/hooks';
import { cn } from '@/utils/classes';
import { FieldMessage } from '../field-message';
import FormControl from '../form-control';
import FormDescription from '../form-description';
import { FormItemContext } from '../form-field';
import Label from '../label';

type FormItemProps = {
	class?: string;
	children: Parameters<typeof FormControl>[0]['children'];
	description?: string;
	label?: string;
	required?: boolean;
};

const FormItem = forwardRef<HTMLDivElement, FormItemProps & { class?: string }>(
	({ class: cls, label, description, required, children }, ref) => {
		const id = useId();

		return (
			<FormItemContext.Provider value={{ id, required }}>
				<div ref={ref} class={cn('flex flex-col gap-1.25', cls)}>
					{label && <Label>{label}</Label>}
					<FormControl>{children}</FormControl>
					{description && (
						<FormDescription>{description}</FormDescription>
					)}
					<FieldMessage />
				</div>
			</FormItemContext.Provider>
		);
	},
);

export default FormItem;
