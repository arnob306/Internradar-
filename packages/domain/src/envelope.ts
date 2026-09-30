export interface FieldError {
  readonly field: string;
  readonly message: string;
}

export interface ErrorBody {
  readonly code: string;
  readonly message: string;
  readonly fields?: readonly FieldError[];
}

export interface PageMeta {
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

export interface SuccessEnvelope<T> {
  readonly success: true;
  readonly data: T;
  readonly error: null;
  readonly meta: PageMeta | null;
}

export interface ErrorEnvelope {
  readonly success: false;
  readonly data: null;
  readonly error: ErrorBody;
  readonly meta: null;
}

export type Envelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

export function ok<T>(data: T, meta: PageMeta | null = null): SuccessEnvelope<T> {
  return { success: true, data, error: null, meta };
}

export function fail(
  code: string,
  message: string,
  fields?: readonly FieldError[],
): ErrorEnvelope {
  const error: ErrorBody =
    fields === undefined ? { code, message } : { code, message, fields };
  return { success: false, data: null, error, meta: null };
}
