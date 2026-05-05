export interface PipelineStream {
	pipeline(
		name: string,
		status: 'start' | 'complete' | 'error',
		startedAt?: number,
		data?: object,
	): void;
	done(): void;
	error(err: unknown): void;
}

export interface PipelineContext {
	stream: PipelineStream;
}

export interface StepDef<TCtx> {
	name: string;
	when?: (ctx: TCtx) => boolean;
	failSilently?: boolean;
	run: (ctx: TCtx) => Promise<unknown>;
}

export function step<TCtx>(
	name: string,
	run: (ctx: TCtx) => Promise<unknown>,
	when?: (ctx: TCtx) => boolean,
): StepDef<TCtx> {
	return { name, run, when };
}

export function silentStep<TCtx>(
	name: string,
	run: (ctx: TCtx) => Promise<unknown>,
	when?: (ctx: TCtx) => boolean,
): StepDef<TCtx> {
	return { name, run, when, failSilently: true };
}

export function variantStep<TCtx, TKey extends string>(
	name: string,
	select: (ctx: TCtx) => TKey,
	variants: Partial<Record<TKey, (ctx: TCtx) => Promise<unknown>>>,
): StepDef<TCtx> {
	return {
		name,
		run: async (ctx) => {
			const key = select(ctx);
			const fn = variants[key];
			return fn ? fn(ctx) : undefined;
		},
	};
}

function toPayload(result: unknown): object | undefined {
	if (
		result !== null &&
		typeof result === 'object' &&
		!Array.isArray(result)
	) {
		return result as object;
	}
	return undefined;
}

export function createService<TCtx extends PipelineContext>(
	steps: StepDef<TCtx>[],
) {
	return {
		async run(ctx: TCtx): Promise<void> {
			try {
				for (const s of steps) {
					if (s.when && !s.when(ctx)) continue;
					const startedAt = Date.now();
					ctx.stream.pipeline(s.name, 'start');
					try {
						const result = await s.run(ctx);
						ctx.stream.pipeline(
							s.name,
							'complete',
							startedAt,
							toPayload(result),
						);
					} catch (err) {
						ctx.stream.pipeline(s.name, 'error', startedAt);
						if (!s.failSilently) throw err;
					}
				}
				ctx.stream.done();
			} catch (err) {
				ctx.stream.error(err);
			}
		},
	};
}
