import type { Prettify } from './types';

export type TimingData = { startedAt: Date; endedAt: Date; durationMs: number };
export type Async<T> = Prettify<PromiseSettledResult<T> & { timing: TimingData }>;

// https://stackoverflow.com/a/69164888/2523414
// [TObj] turns off distributive conditional types
export type AsyncSuccessType<TObj> = [TObj] extends [Async<infer TSuccessType> | null]
    ? TSuccessType
    : [TObj] extends [Promise<infer TSuccessType> | null]
      ? TSuccessType
      : [TObj] extends [Async<infer TSuccessType>]
        ? TSuccessType
        : [TObj] extends [Promise<infer TSuccessType>]
          ? TSuccessType
          : [TObj] extends [infer TSuccessType | null]
            ? TSuccessType
            : never;

export function asyncResultGet<T, R>(result: Async<T> | null, getter: (o: T) => R): R | null {
    if (!result) {
        return null;
    }
    if (result.status === 'rejected') {
        return null;
    }
    return getter(result.value);
}

/**
 * Make an async call
 */
export async function promiseTimings<T>(createPromise: () => Promise<T>): Promise<Async<T>> {
    const startedAt = new Date();
    const timings = (startedAt: Date) => {
        const endedAt = new Date();
        const durationMs = endedAt.getTime() - startedAt.getTime();
        return { startedAt, endedAt, durationMs };
    };

    try {
        const result = await createPromise();
        return { status: 'fulfilled', value: result, timing: timings(startedAt) };
    } catch (error) {
        return {
            status: 'rejected',
            reason: error as unknown,
            timing: timings(startedAt),
        };
    }
}
