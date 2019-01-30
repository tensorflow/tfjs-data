import {LazyIterator} from "./lazy_iterator";


export class RateLimitingIterator<T> extends LazyIterator<T> {
  private lastPromised: number;
  private readonly minimumMilliseconds: number;

  constructor(
      protected readonly upstream: LazyIterator<T>,
      protected readonly maxItemsPerSec: number) {
    super();
    this.minimumMilliseconds = 1000 / this.maxItemsPerSec;
  }
  summary() {
    return `${this.upstream.summary()} -> RateLimiting`;
  }

  async next(): Promise<IteratorResult<T>> {
    const waitMS = (this.lastPromised + this.minimumMilliseconds) - Date.now();
    if (waitMS > 0) {
      await new Promise(resolve => setTimeout(resolve, waitMS));
    }
    this.lastPromised = Date.now();
    return this.upstream.next();
  }
}
