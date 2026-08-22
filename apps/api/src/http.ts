import { ApiErrorSchema, type ApiErrorCode } from '@arc/api-contract/auth';

export function errorBody(code: ApiErrorCode, message: string) {
    return ApiErrorSchema.parse({ error: { code, message } });
}
