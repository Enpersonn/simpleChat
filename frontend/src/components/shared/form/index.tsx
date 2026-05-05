import type { ComponentChildren } from 'preact';
import type {
	FieldValues,
	SubmitHandler,
	UseFormReturn,
} from 'react-hook-form';
import { FormProvider } from 'react-hook-form';
import { cn } from '@/utils/classes';

type FormProps<T extends FieldValues> = {
	class?: string;
	children: ComponentChildren;
	form: UseFormReturn<T>;
	onSubmit: SubmitHandler<T>;
};

export function Form<T extends FieldValues>({
	class: cls,
	children,
	form,
	onSubmit,
}: FormProps<T>) {
	return (
		<FormProvider {...form}>
			<form
				class={cn('flex flex-col gap-4', cls)}
				onSubmit={form.handleSubmit(onSubmit)}
			>
				{children}
			</form>
		</FormProvider>
	);
}

export { FieldMessage } from './field-message';
export { default as FormControl } from './form-control';
export { default as FormDescription } from './form-description';
export { default as FormField, useFormField } from './form-field';
export { default as FormItem } from './form-item';
export { default as Input } from './input';
export { default as RHFInput } from './input/rhf';
export { default as Label } from './label';
export { default as TextArea } from './text-area';
export { default as RHFTextArea } from './text-area/rhf';
export type {
	FormInputProps,
	FormProps,
	InputProps,
	TextAreaProps,
} from './types';
