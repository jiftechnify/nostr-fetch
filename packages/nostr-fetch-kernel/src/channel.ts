export interface Deferred<T> {
  resolve(v: T | PromiseLike<T>): void;
  reject(e?: unknown): void;
}

export class Deferred<T> {
  promise: Promise<T>;
  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = (v) => {
        resolve(v);
      };
      this.reject = (e) => {
        reject(e);
      };
    });
  }
}

interface ChannelSender<T> {
  send(v: T): void;
  error(e: unknown): void;
  close(): void;

  waitUntilDrained(): Promise<void>;
  numBufferedItems(): number;
}

interface ChannelIter<T> {
  [Symbol.asyncIterator](): AsyncIterator<T, void, undefined>;
}

class ChannelCloseSignal extends Error {
  constructor() {
    super("channel closed");
  }
}

type ChannelMakeOptions = {
  highWaterMark?: number | undefined;
};

export class Channel<T> {
  #sendQ: (() => Promise<T>)[] = [];
  #recvQ: Deferred<T> | undefined;
  #closed = false;

  #iterAlreadyStarted = false;

  // backpressure mode related
  #highWaterMark: number;
  #drainWaiter: Deferred<void> | undefined;

  private constructor({ highWaterMark = undefined }: ChannelMakeOptions) {
    this.#highWaterMark = highWaterMark ?? Number.POSITIVE_INFINITY;
  }

  /**
   * Makes an asyncronous channel.
   *
   * Return a pair of a sender endpoint and an iterator which iterate over items sent to the channel.
   *
   * Specifying `highWaterMark` option enables the "backpressure mode".
   * In this mode, a sender can wait until internal queue is free enough.
   */
  static make<T>(options?: ChannelMakeOptions): [ChannelSender<T>, ChannelIter<T>] {
    const c = new Channel<T>(options ?? {});
    return [c as ChannelSender<T>, c as ChannelIter<T>];
  }

  send(v: T) {
    if (this.#recvQ !== undefined) {
      this.#recvQ.resolve(v);
      this.#recvQ = undefined;
      return;
    }
    if (this.#closed) {
      return;
    }
    this.#sendQ.push(() => Promise.resolve(v));
  }

  error(e?: unknown) {
    if (this.#recvQ !== undefined) {
      this.#recvQ.reject(e);
      this.#recvQ = undefined;
      return;
    }
    if (this.#closed) {
      return;
    }
    this.#sendQ.push(() => Promise.reject(e));
  }

  close() {
    if (!this.#closed) {
      this.#closed = true;

      if (this.#recvQ !== undefined) {
        // cancel reception
        this.#recvQ.reject(new ChannelCloseSignal());
        this.#recvQ = undefined;
      }
    }
  }

  waitUntilDrained(): Promise<void> {
    if (this.#drainWaiter !== undefined) {
      return this.#drainWaiter.promise;
    }

    if (this.#sendQ.length <= this.#highWaterMark) {
      return Promise.resolve();
    }
    // sendQ have overflowed -> wait until drained
    this.#drainWaiter = new Deferred();
    return this.#drainWaiter.promise;
  }

  numBufferedItems(): number {
    return this.#sendQ.length;
  }

  private get isCompleted(): boolean {
    return this.#closed && this.#sendQ.length === 0;
  }

  private recv(): () => Promise<T> {
    if (this.#sendQ.length > 0) {
      const next = this.#sendQ.shift() as () => Promise<T>;

      if (this.#drainWaiter !== undefined && this.#sendQ.length <= this.#highWaterMark) {
        // notify to sender that sendQ have been drained enough
        this.#drainWaiter.resolve();
        this.#drainWaiter = undefined;
      }

      return next;
    }
    if (this.#recvQ !== undefined) {
      return () => Promise.reject(Error("Double receive is not allowed"));
    }
    const d = new Deferred<T>();
    this.#recvQ = d;
    return () => d.promise;
  }

  async *[Symbol.asyncIterator]() {
    if (this.#iterAlreadyStarted) {
      throw Error("Iterating a single channel in multiple location is not allowed");
    }

    this.#iterAlreadyStarted = true;
    while (true) {
      try {
        if (this.isCompleted) {
          break;
        }
        yield await this.recv()();
      } catch (err) {
        if (err instanceof ChannelCloseSignal) {
          // closed while awaiting fulfillment of recv queue
          break;
        } else {
          throw err;
        }
      }
    }
  }
}
