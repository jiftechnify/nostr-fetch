import { setTimeout as wait } from "node:timers/promises";
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

    expect(async () => {
      const res = [];
      for await (const d of chIter) {
        res.push(d);
      }
      return res;
    }).rejects.toThrowError("rejects 5!");
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
    expect(async () => {
      await Promise.all([iterate(chIter), iterate(chIter)]);
    }).rejects.toThrowError("Iterating a single channel in multiple location is not allowed");
  });
});
