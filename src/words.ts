/** Word count of one message. An empty string counts as one, matching `"".split(/\s+/)`. */
export function countWords(text: string): number {
  return text.split(/\s+/).length;
}

/** Word count of the live context. This is the only copy of that number. */
export function countContextWords(messages: string[]): number {
  return messages.reduce((sum, message) => sum + countWords(message), 0);
}
