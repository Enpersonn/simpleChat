import type { ButtonHTMLAttributes } from 'preact';
import type { ReactElement } from 'preact/compat';
import { forwardRef } from 'preact/compat';
import { cn, tw } from '@/utils/classes';
import { Slot } from './Slot';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'gold';
type ButtonSize = 'small' | 'medium' | 'large' | 'icon';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: ButtonVariant;
	size?: ButtonSize;
	asChild?: boolean;
};

export type { ButtonProps, ButtonSize, ButtonVariant };

const variants: Record<ButtonVariant, string> = {
	ghost: tw`text-text-secondary hover:bg-bg-hover hover:text-text-primary`,
	gold: tw`border border-gold-border bg-gold-dim text-gold hover:border-gold hover:text-gold-hover`,
	primary: tw`bg-accent text-text-on-accent hover:bg-accent-hover`,
	secondary: tw`border border-border bg-bg-tertiary text-text-secondary hover:border-accent hover:text-text-primary`,
};

const sizes: Record<ButtonSize, string> = {
	icon: tw`size-8 text-sm`,
	large: tw`h-10 min-w-32 px-4 text-[13px]`,
	medium: tw`h-8 min-w-28 px-4 text-[13px]`,
	small: tw`h-7 min-w-20 px-3 text-[13px]`,
};

const base =
	'flex cursor-pointer items-center justify-center rounded-sm text-center font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50';

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	(
		{
			variant = 'primary',
			size = 'medium',
			class: cls,
			asChild = false,
			type = 'button',
			children,
			...props
		},
		ref,
	) => {
		const cls_ = cn(base, variants[variant], sizes[size], cls);

		if (asChild) {
			return (
				<Slot<HTMLButtonElement> ref={ref} class={cls_} {...props}>
					{children as ReactElement}
				</Slot>
			);
		}

		return (
			<button ref={ref} type={type} class={cls_} {...props}>
				{children}
			</button>
		);
	},
);
