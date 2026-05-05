import { useController, useFormContext } from 'react-hook-form';
import FormField from '../form-field';
import FormItem from '../form-item';
import { TagBox } from '.';

type RHFTagBoxProps = {
	name: string;
	options?: string[];
	label?: string;
	description?: string;
	required?: boolean;
};

export const RHFTagBox = ({
	name,
	label,
	description,
	required,
	...props
}: RHFTagBoxProps) => {
	const { control } = useFormContext();

	return (
		<FormField
			control={control}
			name={name}
			render={({ field }) => (
				<FormItem
					label={label}
					description={description}
					required={required}
				>
					<TagBox
						{...props}
						selected={field.value || []}
						setSelected={field.onChange}
					/>
				</FormItem>
			)}
		/>
	);
};

export default RHFTagBox;
