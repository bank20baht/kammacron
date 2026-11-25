/**
 * The body of a route marked \`idempotent\` (@20baht/elysia-idempotency): its 200 is typed
 * \`Response | Body\`, because a replayed answer is a raw \`Response\` on the server. Over HTTP the
 * client always gets the parsed body, so this only narrows the type (and says so if it ever is not).
 */
export const answer = <T>(value: T): Exclude<T, Response> => {
  if (typeof Response !== 'undefined' && value instanceof Response)
    throw new Error('expected a parsed body')
  return value as Exclude<T, Response>
}
