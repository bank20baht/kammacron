/** Replaces every secret (long enough to be one) with a mark. */
export const redact = (text: string, secrets: readonly string[]) =>
  secrets.reduce(
    (acc, secret) => (secret.length >= 8 ? acc.split(secret).join('[redacted]') : acc),
    text,
  )

/**
 * Redaction over a stream: a secret may arrive in two reads, so the end of what came that could
 * be the start of one waits for the next.
 */
export const createRedactor = (secrets: readonly string[]) => {
  const real = secrets.filter((s) => s.length >= 8)
  let held = ''
  const startsASecret = (tail: string) =>
    real.some((s) => s.length > tail.length && s.startsWith(tail))
  return {
    push: (chunk: string) => {
      const text = redact(held + chunk, real)
      const longest = Math.max(0, ...real.map((s) => s.length - 1))
      let keep = Math.min(longest, text.length)
      while (keep > 0 && !startsASecret(text.slice(-keep))) keep--
      held = text.slice(text.length - keep)
      return text.slice(0, text.length - keep)
    },
    end: () => {
      const rest = held
      held = ''
      return rest
    },
  }
}
