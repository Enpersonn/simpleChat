export class LLMParseError extends Error {
	readonly raw: string;
	constructor(message: string, raw: string) {
		super(message);
		this.raw = raw;
	}
}
