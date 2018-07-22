/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * =============================================================================
 */

// tslint:disable:max-line-length
import {getTensorsInContainer, isTensorInList} from '@tensorflow/tfjs-core/dist/tensor_util';
import {RingBuffer} from '../util/ring_buffer';
// tslint:enable:max-line-length

// Here we implement a simple asynchronous iterator.
// This lets us avoid using either third-party stream libraries or
// recent TypeScript language support requiring polyfills.

/**
 * Create a `LazyIterator` from a function.
 */
export function iteratorFromAsyncFunction<T>(
    func: () => Promise<IteratorResult<T>>): LazyIterator<T> {
  return new AsyncFunctionCallIterator(func);
}

/**
 * An asynchronous iterator, providing lazy access to a potentially unbounded
 * stream of elements.
 *
 * Note that there is no guarantee that elements will be returned in any
 * specific order.  In particular, the arrival of the 'done' signal does not
 * guarantee that the stream is really empty, because any outstanding promises
 * may yet yield elements.
 */
export abstract class LazyIterator<T> {
  // This class implements AsyncIterator<T>, but we have not yet set the
  // TypeScript --downlevelIteration flag to enable that.

  /**
   * Returns a `Promise` for the next element in the stream.
   *
   * When an item can be provided successfully, the return value is
   * `{value:T, done:false}`.
   *
   * Calling next() on a closed stream returns `{value:null, done:true}`.
   */
  abstract async next(): Promise<IteratorResult<T>>;

  /**
   * Collect all remaining elements of a bounded stream into an array.
   * Obviously this will succeed only for small streams that fit in memory.
   * Useful for testing.
   *
   * @param maxItems the maximum number of items to return.  If the stream
   *   terminates, fewer items will be returned.  (default 1000)
   * @param prefetch the size of the prefetch buffer to use when collecting
   *   items.  Some amount of prefetch is important to test parallel streams,
   *   i.e. with multiple Promises outstanding.  Without prefetch, this method
   *   makes purely serial next() calls.
   *
   * @returns A Promise for an array of stream elements, which will resolve
   *   when the stream is exhausted.
   */
  async collect(maxItems = 1000, prefetch = 100): Promise<T[]> {
    const stream = prefetch > 0 ? this.prefetch(prefetch) : this;
    const result: T[] = [];
    let count = 0;
    let x = await stream.next();
    while (!x.done) {
      result.push(x.value);
      count++;
      if (count >= maxItems) {
        return result;
      }
      x = await stream.next();
    }
    return result;
  }

  /**
   * Draw items from the stream until it is exhausted.
   *
   * This can be useful when the stream has side effects but no output.  In
   * that case, calling this function guarantees that the stream will be fully
   * processed.
   */
  async resolveFully(): Promise<void> {
    let x = await this.next();
    while (!x.done) {
      x = await this.next();
    }
  }

  // TODO(soergel): Implement reduce() etc.

  /**
   * Maps this stream through a 1-to-1 transform.
   *
   * @param predicate A function mapping a stream element to a transformed
   *   element.
   *
   * @returns A `LazyIterator` of transformed elements.
   */
  map<O>(transform: (value: T) => O): LazyIterator<O> {
    return new MapIterator(this, transform);
  }

  /**
   * Apply a function to every element of the stream.
   *
   * @param f A function to apply to each stream element.
   */
  async forEach(f: (value: T) => void): Promise<void> {
    return this.map(f).resolveFully();
  }

  /**
   * Limits this stream to return at most `count` items.
   *
   * @param count The maximum number of items to provide from the stream.  If a
   *   negative or undefined value is given, the entire stream is returned
   *   unaltered.
   */
  take(count: number): LazyIterator<T> {
    if (count < 0 || count == null) {
      return this;
    }
    return new TakeIterator(this, count);
  }

  /**
   * Prefetch the first `bufferSize` items in this stream.
   *
   * Note this prefetches Promises, but makes no guarantees about when those
   * Promises resolve.
   *
   * @param bufferSize: An integer specifying the number of elements to be
   *   prefetched.
   */
  prefetch(bufferSize: number): LazyIterator<T> {
    return new PrefetchIterator(this, bufferSize);
  }
}

// ============================================================================
// The following private classes serve to implement the chainable methods
// on LazyIterator.  Unfortunately they can't be placed in separate files, due
// to resulting trouble with circular imports.
// ============================================================================

// Iterators that just extend LazyIterator directly
// ============================================================================

class AsyncFunctionCallIterator<T> extends LazyIterator<T> {
  constructor(protected nextFn: () => Promise<IteratorResult<T>>) {
    super();
  }

  async next(): Promise<IteratorResult<T>> {
    try {
      return this.nextFn();
    } catch (e) {
      // Modify the error message but leave the stack trace intact
      e.message =
          `Error thrown while iterating through a dataset: ${e.message}`;
      throw e;
    }
  }
}

class TakeIterator<T> extends LazyIterator<T> {
  // This state is safe because it is updated atomically (?)
  count = 0;
  constructor(protected upstream: LazyIterator<T>, protected maxCount: number) {
    super();
  }

  async next(): Promise<IteratorResult<T>> {
    if (this.count++ >= this.maxCount) {
      return {value: null, done: true};
    }
    return this.upstream.next();
  }
}

class MapIterator<I, O> extends LazyIterator<O> {
  constructor(
      protected upstream: LazyIterator<I>,
      protected transform: (value: I) => O) {
    super();
  }
  async next(): Promise<IteratorResult<O>> {
    const item = await this.upstream.next();
    if (item.done) {
      return {value: null, done: true};
    }
    const inputTensors = getTensorsInContainer(item.value as {});
    // Careful: the transform may mutate the item in place.
    // that's why we have to remember the input Tensors above, and then
    // below
    // dispose only those that were not passed through to the output.
    // Note too that the transform function is responsible for tidying
    // any
    // intermediate Tensors.  Here we are concerned only about the
    // inputs.
    const mapped = this.transform(item.value);
    const outputTensors = getTensorsInContainer(mapped as {});
    // TODO(soergel) faster intersection
    // TODO(soergel) move to tf.disposeExcept(in, out)?
    for (const t of inputTensors) {
      if (!isTensorInList(t, outputTensors)) {
        t.dispose();
      }
    }
    return {value: mapped, done: false};
  }
}

// Iterators that maintain a ring buffer of pending promises
// ============================================================================

/**
 * A stream that prefetches a given number of items from an upstream source,
 * returning them in FIFO order.
 *
 * Note this prefetches Promises, but makes no guarantees about when those
 * Promises resolve.
 */
export class PrefetchIterator<T> extends LazyIterator<T> {
  // TODO protected
  public buffer: RingBuffer<Promise<IteratorResult<T>>>;

  constructor(
      protected upstream: LazyIterator<T>, protected bufferSize: number) {
    super();
    this.buffer = new RingBuffer<Promise<IteratorResult<T>>>(bufferSize);
  }

  /**
   * Refill the prefetch buffer.  Returns only after the buffer is full.  Since
   * we are buffering Promises without resolving them, we cannot know here
   * whether the upstream source is exhausted; eventually the buffer will be
   * full of promises that resolve to "done".
   */
  protected refill() {
    while (!this.buffer.isFull()) {
      const v = this.upstream.next();
      this.buffer.push(v);
    }
  }

  async next(): Promise<IteratorResult<T>> {
    this.refill();

    // This shift will never throw an error because the buffer is always full
    // after a refill. If the stream is exhausted, the buffer will be full of
    // Promises that will resolve to the end-of-stream signal.
    return this.buffer.shift();
  }
}
