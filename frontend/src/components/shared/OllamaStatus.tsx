interface Props {
	healthy: boolean | null;
}

export function OllamaStatus({ healthy }: Props) {
	const title =
		healthy === true
			? 'Ollama connected'
			: healthy === false
				? 'Ollama unreachable'
				: 'Checking…';

	const dotColor =
		healthy === true
			? 'bg-success'
			: healthy === false
				? 'bg-error'
				: 'bg-text-muted';

	return (
		<span
			class={`inline-block h-1.75 w-1.75 shrink-0 rounded-full ${dotColor}`}
			data-healthy={healthy === null ? 'null' : String(healthy)}
			title={title}
		/>
	);
}
