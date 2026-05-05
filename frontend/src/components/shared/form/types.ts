import type { ComponentChildren } from 'preact';
import type { ComponentPropsWithoutRef } from 'preact/compat';
import type {
	DefaultValues,
	FieldValues,
	SubmitHandler,
} from 'react-hook-form';

type FormProps<TFieldValues extends FieldValues> = {
	class?: string;
	children: ComponentChildren;
	defaultValues: DefaultValues<TFieldValues>;
	onSubmit: SubmitHandler<TFieldValues>;
};

type FormInputProps = {
	name: string;
	label?: string;
	description?: string;
};

type TextAreaProps = Omit<ComponentPropsWithoutRef<'textarea'>, 'rows'> &
	FormInputProps;

type InputProps = Omit<ComponentPropsWithoutRef<'input'>, 'size'> &
	FormInputProps;

export type { FormInputProps, FormProps, InputProps, TextAreaProps };
