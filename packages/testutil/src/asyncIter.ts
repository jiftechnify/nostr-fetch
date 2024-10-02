/**
 * Collects items from an async iterator into an array until the first error is thrown.
 */
export const collectAsyncIterUntilThrow = async <T>(iter: AsyncIterable<T>): Promise<T[]> => {
  const res: T[] = [];
  try {
    for await (const t of iter) {
      res.push(t);
    }
  } catch (err) {
    console.error(err);
    return res;
  }
  return res;
};
