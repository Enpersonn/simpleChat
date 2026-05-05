import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import {
	Controller,
	type ControllerProps,
	type FieldPath,
	type FieldValues,
	useFormContext,
} from 'react-hook-form';

type FormFieldContextValue<
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
	name: TName;
};

export const FormFieldContext = createContext<FormFieldContextValue>(
	{} as FormFieldContextValue,
);

const FormField = <
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
	...props
}: ControllerProps<TFieldValues, TName>) => {
	return (
		<FormFieldContext.Provider value={{ name: props.name }}>
			<Controller {...props} />
		</FormFieldContext.Provider>
	);
};

type FormItemContextValue = {
	id: string;
	required?: boolean;
};

export const FormItemContext = createContext<FormItemContextValue>(
	{} as FormItemContextValue,
);

export const useFormField = () => {
	const fieldContext = useContext(FormFieldContext);
	const itemContext = useContext(FormItemContext);
	const { getFieldState, formState } = useFormContext();

	if (!fieldContext.name) {
		throw new Error('useFormField must be used within <FormField>');
	}

	const fieldState = getFieldState(fieldContext.name, formState);
	const { id, ...itemCtx } = itemContext;

	return {
		formDescriptionId: `${id}-description`,
		formItemId: `${id}-input`,
		formMessageId: `${id}-message`,
		id,
		name: fieldContext.name,
		...itemCtx,
		...fieldState,
	};
};

export default FormField;
