import { AsyncLocalStorage } from 'node:async_hooks';

//NOTE - File này lưu requestId hiện tại trong toàn bộ vòng đời xử lý bất đồng bộ của một request.
export type RequestContext = {
  requestId: string;
};

const requestContextStorage = new AsyncLocalStorage<RequestContext>();
export function runWithRequestContext<T>(
  context: RequestContext,
  callback: () => T,
): T {
  return requestContextStorage.run(context, callback);
}

export function getCurrentRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}
