import { useFormContext } from 'react-hook-form';
import FormField from '../form-field';
import FormItem from '../form-item';
import { TagBox, type TagBoxProps } from '.';

type RHFTagBoxProps = TagBoxProps & {
	name: string;
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
					<TagBox {...field} {...props} />
				</FormItem>
			)}
		/>
	);
};

export default RHFTagBox;
