import {
  simpleFetch,
  SimpleFetchRequestOptions,
  SimpleFetchResponse,
} from "@keplr-wallet/simple-fetch";
import { retry } from "@keplr-wallet/common";

// simpleFetch with 1 retry on failure (500ms delay).
// Background tx-executor의 모든 RPC/LCD 호출에 사용.
export function fetchWithRetry<T>(
  baseURL: string,
  options?: SimpleFetchRequestOptions
): Promise<SimpleFetchResponse<T>>;
export function fetchWithRetry<T>(
  baseURL: string,
  url?: string,
  options?: SimpleFetchRequestOptions
): Promise<SimpleFetchResponse<T>>;
export function fetchWithRetry<T>(
  baseURL: string,
  urlOrOptions?: string | SimpleFetchRequestOptions,
  options?: SimpleFetchRequestOptions
): Promise<SimpleFetchResponse<T>> {
  return retry(() => simpleFetch<T>(baseURL, urlOrOptions as string, options), {
    maxRetries: 1,
    waitMsAfterError: 500,
  });
}
