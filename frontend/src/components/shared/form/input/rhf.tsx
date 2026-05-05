import { useFormContext } from 'react-hook-form';
import FormField from '../form-field';
import FormItem from '../form-item';
import Input from '.';

type RHFInputProps = Omit<Parameters<typeof Input>[0], 'name'> & {
	name: string;
	label?: string;
	description?: string;
	required?: boolean;
};

export const RHFInput = ({
	name,
	label,
	description,
	required,
	...props
}: RHFInputProps) => {
	const { control } = useFormContext();

	return (
		<FormField
			control={control}
			name={name}
			render={({ field }) => (
				<FormItem label={label} description={description} required={required}>
					<Input {...field} {...props} />
				</FormItem>
			)}
		/>
	);
};

export default RHFInput;
