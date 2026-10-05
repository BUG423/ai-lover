export const MAX_HISTORY_MESSAGES = 9;
export const MAX_HISTORY_CHARACTERS = 18_000;

/** Keep the actual chronological tail within the provider request budget. */
export function recentMessages<T extends { content: string }>(messages: T[]): T[] {
  const retained: T[] = [];
  let characters = 0;
  for (
    let index = messages.length - 1;
    index >= 0 && retained.length < MAX_HISTORY_MESSAGES;
    index--
  ) {
    const message = messages[index];
    if (retained.length && characters + message.content.length > MAX_HISTORY_CHARACTERS) break;
    retained.unshift(message);
    characters += message.content.length;
  }
  return retained;
}
