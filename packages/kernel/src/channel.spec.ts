import { setTimeout as wait } from "node:timers/promises";
import { inspect } from "util";
import { describe, expect, test } from "vitest";
import { Channel } from "./channel";

describe("channel", () => {
  test.concurrent("convey message (receiver is faster)", async () => {
    const [tx, chIter] = Channel.make<number>();

    let n = 0;
    const i = setInterval(() => {
      if (n >= 10) {
        tx.close();
        clearInterval(i);
        return;
      }
      tx.send(n);
      n++;
    }, 100);

    const res = [];
    for await (const d of chIter) {
      res.push(d);
    }

    expect(res).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test.concurrent("convey message (sender is faster)", async () => {
    const [tx, chIter] = Channel.make<number>();

    let n = 0;
    const i = setInterval(() => {
      if (n >= 10) {
        tx.close();
        clearInterval(i);
        return;
      }
      tx.send(n);
      n++;
    }, 0);

    const res = [];
    for await (const d of chIter) {
      res.push(d);
      await wait(100);
    }

    expect(res).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test.concurrent("convey error and it interrupts receiver", async () => {
    const [tx, chIter] = Channel.make<number>();

    let n = 0;
    const i = setInterval(() => {
      if (n === 5) {
        tx.error("rejects 5!");
        return;
      }
      if (n >= 10) {
        tx.close();
        clearInterval(i);
        return;
      }
      tx.send(n);
      n++;
    }, 0);

    await expect(async () => {
      const res = [];
      for await (const d of chIter) {
        res.push(d);
      }
      return res;
    }).rejects.toThrow("rejects 5!");
  });

  test.concurrent("can't be iterated multiple times", async () => {
    const [tx, chIter] = Channel.make<number>();

    let n = 0;
    const i = setInterval(() => {
      if (n >= 10) {
        tx.close();
        clearInterval(i);
        return;
      }
      tx.send(n);
      n++;
    }, 100);

    const res = [];
    const iterate = async (iter: AsyncIterable<number>) => {
      for await (const n of iter) {
        res.push(n);
      }
    };
    await expect(async () => {
      await Promise.all([iterate(chIter), iterate(chIter)]);
    }).rejects.toThrow("Iterating a single channel in multiple location is not allowed");
  });

  test.concurrent("backpressure", async () => {
    const [tx, chIter] = Channel.make<number>({ highWaterMark: 3 });

    for (const n of [0, 1, 2, 3]) {
      tx.send(n);
    }
    tx.close();

    // check if `wait` is pending
    const wait1 = tx.waitUntilDrained();
    const wait2 = tx.waitUntilDrained();
    [wait1, wait2].forEach((w) => {
      expect(inspect(w).includes("pending")).toBe(true);
    });

    const res = [];

    // drain first item -> sendQ is now drained enough
    const iterBody = chIter[Symbol.asyncIterator]();
    const fst = await iterBody.next();
    res.push(fst.value);

    // check if `wait` have been resolved
    [wait1, wait2].forEach((w) => {
      expect(inspect(w).includes("pending")).toBe(false);
    });
    await expect(Promise.all([wait1, wait2])).resolves.toEqual([undefined, undefined]);

    // drain remaining items
    while (true) {
      const { done, value } = await iterBody.next();
      if (done) {
        break;
      }
      res.push(value);
    }

    expect(res).toEqual([0, 1, 2, 3]);
  });
});
