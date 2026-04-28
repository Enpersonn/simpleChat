export function sanitizeTextForParsing(
  text: string,
  characterNames?: string[],
): string {
  let result = text.trim();
  result = result.replace(/\n{3,}/g, "\n\n");
  result = result.replace(/<[^>]+>/g, "");
  if (characterNames?.length) {
    result = `[Known characters: ${characterNames.join(", ")}]\n\n${result}`;
  }
  return result;
}
