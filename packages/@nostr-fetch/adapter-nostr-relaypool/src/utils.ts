/**
 * attaches timeout to the `promise`
 */
export const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  msgOnTimeout: string
): Promise<T> => {
  const timeoutAborter = new AbortController();
  const timeout = new Promise<T>((_, reject) => {
    setTimeout(() => reject(Error(msgOnTimeout)), timeoutMs);
    timeoutAborter.signal.addEventListener("abort", () => reject());
  });

  const t = await Promise.race([promise, timeout]);
  timeoutAborter.abort();
  return t;
};
