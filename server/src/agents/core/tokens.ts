/**
 * A rough token count.
 *
 * Hebrew tokenises closer to two characters a token than the four English does, and
 * under-counting is how a budget quietly stops being one. Dividing by two is the
 * conservative direction: it spends less, not more.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2);
}
