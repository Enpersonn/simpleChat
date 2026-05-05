import type { TargetedMouseEvent } from 'preact';
import { type Dispatch, type StateUpdater, useState } from 'preact/hooks';
import { Badge } from '../../Badge';
import { Button } from '../../Button';
import { f } from '../../formCls';
import Input from '../input';

export type TagBoxProps = {
	options?: string[];
	selected: string[];
	setSelected: Dispatch<StateUpdater<string[]>>;
};

export const TagBox = ({ options, selected, setSelected }: TagBoxProps) => {
	const customeOptions = selected.filter((x) => !options?.includes(x));
	const [customOption, setCustomOption] = useState('');

	const toggle = (e: TargetedMouseEvent<HTMLButtonElement>) => {
		const value = e.currentTarget.value;

		setSelected((current) =>
			current.includes(value)
				? current.filter((x) => x !== value)
				: [...current, value],
		);
	};

	const addCustomTag = () => {
		const trimmed = customOption.trim();

		if (trimmed && !selected.includes(trimmed)) {
			setSelected((current) => [...current, trimmed]);
		}

		setCustomOption('');
	};

	return (
		<div class={f.field}>
			<div class={f.tagGroup}>
				{options?.map((x) => (
					<Badge
						key={x}
						active={selected.includes(x)}
						value={x}
						onClick={toggle}
					>
						{x}
					</Badge>
				))}
				{customeOptions.map((x) => (
					<Badge key={x} value={x} active onClick={toggle}>
						{x}
						<span class={f.tagRemove}>×</span>
					</Badge>
				))}
			</div>
			<div class={f.tagAddRow}>
				<Input
					placeholder="Add genre…"
					value={customOption}
					onInput={(e) =>
						setCustomOption((e.target as HTMLInputElement).value)
					}
					onKeyDown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							addCustomTag();
						}
					}}
				/>
				<Button
					variant="secondary"
					size="icon"
					onClick={() => addCustomTag()}
				>
					+
				</Button>
			</div>
		</div>
	);
};
