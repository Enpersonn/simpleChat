import { useFormContext } from 'react-hook-form';
import FormField from '../form-field';
import FormItem from '../form-item';
import TextArea from '.';

type RHFTextAreaProps = Omit<Parameters<typeof TextArea>[0], 'name'> & {
	name: string;
	label?: string;
	description?: string;
	required?: boolean;
};

export const RHFTextArea = ({
	name,
	label,
	description,
	required,
	...props
}: RHFTextAreaProps) => {
	const { control } = useFormContext();

	return (
		<FormField
			control={control}
			name={name}
			render={({ field }) => (
				<FormItem label={label} description={description} required={required}>
					<TextArea {...field} {...props} />
				</FormItem>
			)}
		/>
	);
};

export default RHFTextArea;
