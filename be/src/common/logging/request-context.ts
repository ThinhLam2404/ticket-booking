import { AsyncLocalStorage } from 'node:async_hooks';

//NOTE - File này lưu requestId hiện tại trong toàn bộ vòng đời xử lý bất đồng bộ của một request.
export type RequestContext = {
  requestId: string;
  actorUserId?: string;
  actorEmail?: string;
  dbQueryCount?: number;
  dbQueryDurationMs?: number;
  dbSlowQueryCount?: number;
};

export type DbQueryMetrics = {
  queryCount: number;
  dbQueryDurationMs: number;
  slowQueryCount: number;
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

export function setCurrentActor(actor: { id?: string; email?: string }): void {
  const context = requestContextStorage.getStore();
  if (!context) return;
  context.actorUserId = actor.id;
  context.actorEmail = actor.email;
}

export function getCurrentActor(): { id?: string; email?: string } {
  const context = requestContextStorage.getStore();
  return { id: context?.actorUserId, email: context?.actorEmail };
}

export function recordDbQuery(durationMs: number, slow: boolean): void {
  const context = requestContextStorage.getStore();
  if (!context) return;

  context.dbQueryCount = (context.dbQueryCount ?? 0) + 1;
  context.dbQueryDurationMs = (context.dbQueryDurationMs ?? 0) + durationMs;
  if (slow) {
    context.dbSlowQueryCount = (context.dbSlowQueryCount ?? 0) + 1;
  }
}

export function getCurrentDbQueryMetrics(): DbQueryMetrics {
  const context = requestContextStorage.getStore();
  return {
    queryCount: context?.dbQueryCount ?? 0,
    dbQueryDurationMs:
      Math.round((context?.dbQueryDurationMs ?? 0) * 100) / 100,
    slowQueryCount: context?.dbSlowQueryCount ?? 0,
  };
}
