import { chunk, get, isString } from 'lodash';
import type { Prettify } from './types';

export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function splitPromiseResultsByStatus<T>(results: PromiseSettledResult<T>[]) {
    const rejected = results
        .filter(
            (result): result is Prettify<Exclude<typeof result, PromiseFulfilledResult<unknown>>> =>
                result.status === 'rejected'
        )
        .map(result => result.reason);
    const fulfilled = results
        .filter(
            (result): result is Prettify<Exclude<typeof result, PromiseRejectedResult>> => result.status === 'fulfilled'
        )
        .map(result => result.value);
    return { fulfilled, rejected };
}

export type RunMode = { type: 'parallel' } | { type: 'sequential' } | { type: 'parallel-batched'; batchSize: number };

export function runWithMode<T, R>(mode: RunMode, items: T[], process: (item: T) => Promise<R>) {
    return mode.type === 'parallel'
        ? runParallel(items, process)
        : mode.type === 'sequential'
          ? runSequentially(items, process)
          : runParallelBatches(items, mode.batchSize, process);
}

export async function runSequentially<T, R>(
    items: T[],
    process: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
    const results: PromiseSettledResult<R>[] = [];
    for (const item of items) {
        try {
            const result = await process(item);
            results.push({ status: 'fulfilled', value: result });
        } catch (error) {
            results.push({ status: 'rejected', reason: error });
        }
    }
    return results;
}

export async function runParallel<T, R>(
    items: T[],
    process: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
    return Promise.allSettled(items.map(process));
}

export async function runParallelBatches<T, R>(
    items: T[],
    batchSize: number,
    process: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
    if (batchSize <= 0) {
        throw new Error('Batch size must be greater than 0');
    }
    const batches = chunk(items, batchSize);
    let results: PromiseSettledResult<R>[] = [];

    for (const batch of batches) {
        const batchResults = await runParallel(batch, process);
        results = results.concat(batchResults);
    }
    return results;
}

// copy-pasted from node_modules/viem/src/utils/promise/withRetry.ts and node_modules/viem/src/utils/wait.ts
export async function wait(time: number) {
    return new Promise(res => setTimeout(res, time));
}

export function withRetry<TData>(
    fn: () => Promise<TData>,
    {
        delay: delay_ = 100,
        retryCount = 2,
        shouldRetry = () => true,
    }: {
        // The delay (in ms) between retries.
        delay?: ((config: { count: number; error: Error }) => number) | number;
        // The max number of times to retry.
        retryCount?: number;
        // Whether or not to retry when an error is thrown.
        shouldRetry?: ({
            count,
            error,
        }: {
            count: number;
            error: Error;
        }) => Promise<boolean> | boolean;
    } = {}
) {
    return new Promise<TData>((resolve, reject) => {
        const attemptRetry = async ({ count = 0 } = {}) => {
            const retry = async ({ error }: { error: Error }) => {
                const delay = typeof delay_ === 'function' ? delay_({ count, error }) : delay_;
                if (delay) await wait(delay);
                attemptRetry({ count: count + 1 });
            };

            try {
                const data = await fn();
                resolve(data);
            } catch (err) {
                if (count < retryCount && (await shouldRetry({ count, error: err as Error })))
                    return retry({ error: err as Error });
                reject(err);
            }
        };
        attemptRetry();
    });
}

export class ConnectionTimeoutError extends Error {
    constructor(
        public readonly timeoutMs: number,
        public readonly previousError?: unknown
    ) {
        super(`Timeout after ${timeoutMs}ms`);
    }
}

export function withTimeout<TRes>(fn: () => Promise<TRes>, timeoutMs: number) {
    return new Promise<TRes>((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new ConnectionTimeoutError(timeoutMs));
        }, timeoutMs);
        fn()
            .then(res => {
                clearTimeout(timeout);
                resolve(res);
            })
            .catch(error => {
                clearTimeout(timeout);
                reject(error);
            });
    });
}

export function isConnectionTimeoutError(err: unknown) {
    if (err instanceof ConnectionTimeoutError) {
        return true;
    }
    const msg = get(err, 'message', '');
    if (isString(msg) && msg.toLocaleLowerCase().includes('connection terminated')) {
        return true;
    }
    return false;
}
