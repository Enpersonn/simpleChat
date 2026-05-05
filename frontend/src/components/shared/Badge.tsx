import type { ButtonHTMLAttributes } from 'preact';
import { cn } from '@/utils/classes';

type BadgeProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	active: boolean;
};

export const Badge = ({ active, children, ...props }: BadgeProps) => {
	return (
		<button
			type="button"
			class={cn(
				'cursor-pointer rounded-full border border-border bg-bg-tertiary px-2.5 py-1 text-text-muted text-xs transition-all duration-150',
				'hover:border-accent hover:text-text-primary data-[active=true]:border-accent data-[active=true]:bg-accent-dim data-[active=true]:text-accent',
			)}
			data-active={active ? 'true' : undefined}
			{...props}
		>
			{children}
		</button>
	);
};
