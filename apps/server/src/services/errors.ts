/** A refusal a service means: the route answers it as `httpStatus` with `{ code, message }` (not `status`: Elysia answers an error with a `status` field itself, as plain text). */
export class ServiceError extends Error {
  constructor(
    readonly httpStatus: 400 | 403 | 404 | 409 | 422,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ServiceError'
  }
}

export const notFound = (what: string, id: number | string) =>
  new ServiceError(404, 'NOT_FOUND', `${what} ${String(id)} not found`)

export const invalid = (code: string, message: string) => new ServiceError(422, code, message)

export const conflict = (code: string, message: string) => new ServiceError(409, code, message)
