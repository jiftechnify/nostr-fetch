interface Deferred<T> {
  resolve(v: T | PromiseLike<T>): void;
  reject(e?: unknown): void;
}

class Deferred<T> {
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
}

interface ChannelIter<T> {
  [Symbol.asyncIterator](): AsyncIterator<T, void, undefined>;
}

class ChannelCloseSignal extends Error {
  constructor() {
    super("channel closed");
  }
}

export class Channel<T> {
  #sendQ: (() => Promise<T>)[] = [];
  #recvQ: Deferred<T> | undefined;
  #closed = false;

  #iterAlreadyStarted = false;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  static make<T>(): [ChannelSender<T>, ChannelIter<T>] {
    const c = new Channel<T>();
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

  private get isCompleted(): boolean {
    return this.#closed && this.#sendQ.length === 0;
  }

  private recv(): () => Promise<T> {
    if (this.#sendQ.length > 0) {
      return this.#sendQ.shift() as () => Promise<T>;
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
