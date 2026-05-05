import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Template literal tag function for Tailwind CSS classes.
 * This function is primarily used to help IDE plugins identify strings as Tailwind classes.
 * It processes template literals and combines them with additional class values.
 *
 * @param {TemplateStringsArray} strings - The static parts of the template literal
 * @param {...ClassValue[]} args - Dynamic values to be interpolated between the static parts
 * @returns {string} Combined class string processed through clsx
 *
 * @example
 * const classes = tw`bg-red-500 ${isActive && 'text-white'} p-4`;
 */
export const tw = (strings: TemplateStringsArray, ...args: ClassValue[]) => {
	return cn(
		strings.map((str, i) => [str, args[i]].filter(Boolean).join(' ')),
	);
};

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
