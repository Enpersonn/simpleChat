export function sanitizeTextForParsing(
	text: string,
	characterNames?: string[],
): string {
	let result = text.trim();
	result = result.replace(/\n{3,}/g, '\n\n');
	result = result.replace(/<[^>]+>/g, '');
	if (characterNames?.length) {
		result = `[Known characters: ${characterNames.join(', ')}]\n\n${result}`;
	}
	return result;
}

export function chunkText(
	text: string,
	maxChars = 3000,
	overlapChars = 300,
): string[] {
	if (!text.trim()) return [];

	// Pass 1: split on —Section Name— marker lines (em-dash format used in story text)
	const parts = text.split(/(^—[^\n—]+—[ \t]*$)/m);
	const sections: string[] = [];
	let current = parts[0] ?? '';
	for (let i = 1; i < parts.length; i++) {
		if (i % 2 === 1) {
			if (current.trim()) sections.push(current.trim());
			current = parts[i];
		} else {
			current += '\n' + parts[i];
		}
	}
	if (current.trim()) sections.push(current.trim());

	// Fallback: no markers found — treat whole text as one section
	if (sections.length === 0) sections.push(text.trim());

	// Pass 2: sub-split sections that exceed maxChars at paragraph boundaries
	const rawChunks: string[] = [];
	for (const section of sections) {
		if (section.length <= maxChars) {
			rawChunks.push(section);
			continue;
		}
		const paragraphs = section.split(/\n\n+/);
		let acc = '';
		for (const para of paragraphs) {
			const joined = acc ? `${acc}\n\n${para}` : para;
			if (joined.length > maxChars && acc) {
				rawChunks.push(acc);
				acc = para;
			} else {
				acc = joined;
			}
		}
		if (acc) rawChunks.push(acc);
	}

	// Pass 3: inject overlap from previous chunk for boundary continuity
	return rawChunks.map((chunk, i) => {
		if (i === 0 || !overlapChars) return chunk;
		const tail = rawChunks[i - 1].slice(-overlapChars);
		return `[Prior context — do not re-extract events from this section]\n${tail}\n\n${chunk}`;
	});
}
