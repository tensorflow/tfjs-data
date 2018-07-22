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
import * as tf from '@tensorflow/tfjs-core';
import {getTensorsInContainer, isTensorInList} from '@tensorflow/tfjs-core/dist/tensor_util';
import * as seedrandom from 'seedrandom';

import {GrowingRingBuffer} from '../../util/growing_ring_buffer';
import {RingBuffer} from '../../util/ring_buffer';
import {LazyIterator} from '../lazy_iterator';
// tslint:enable:max-line-length

/**
 * Create a `LazyIterator` from an array of items.
 */
export function iteratorFromItems<T>(items: T[]): OrderedLazyIterator<T> {
  return new ArrayIterator(items);
}

/**
 * Create a `LazyIterator` of incrementing integers.
 */
export function iteratorFromIncrementing(start: number):
    OrderedLazyIterator<number> {
  let i = start;
  return iteratorFromFunction(() => ({value: i++, done: false}));
}

/**
 * Create a `LazyIterator` from a function.
 */
export function iteratorFromFunction<T>(func: () => IteratorResult<T>):
    OrderedLazyIterator<T> {
  return new FunctionCallIterator(func);
}

/**
 * Create a `LazyIterator` by concatenating underlying streams, which are
 * themselves provided as a stream.
 *
 * This can also be thought of as a "stream flatten" operation.
 *
 * @param baseIterators A stream of streams to be concatenated.
 */
export function iteratorFromConcatenated<T>(
    baseIterators: OrderedLazyIterator<LazyIterator<T>>):
    OrderedLazyIterator<T> {
  return ChainedIterator.create(baseIterators);
}

/**
 * Create a `LazyIterator` by concatenating streams produced by calling a
 * stream-generating function a given number of times.
 *
 * Since a `LazyIterator` is read-once, it cannot be repeated, but this
 * function can be used to achieve a similar effect:
 *
 *   LazyIterator.ofConcatenatedFunction(() => new MyIterator(), 6);
 *
 * @param iteratorFunc: A function that produces a new stream on each call.
 * @param count: The number of times to call the function.
 */
export function iteratorFromConcatenatedFunction<T>(
    iteratorFunc: () => IteratorResult<LazyIterator<T>>,
    count: number): OrderedLazyIterator<T> {
  return iteratorFromConcatenated(
      imposeStrictOrder(iteratorFromFunction(iteratorFunc).take(count)));
}

export interface OrderedIteratorResult<T> extends IteratorResult<T> {}

export abstract class OrderedLazyIterator<T> extends LazyIterator<T> {
  /**
   * Maps this stream through a 1-to-1 transform.
   *
   * @param predicate A function mapping a stream element to a transformed
   *   element.
   *
   * @returns A `LazyIterator` of transformed elements.
   */
  map<O>(transform: (value: T) => O): OrderedLazyIterator<O> {
    return new AlreadyOrderedIterator(super.map(transform));
  }

  /**
   * Limits this stream to return at most `count` items.
   *
   * @param count The maximum number of items to provide from the stream.  If a
   *   negative or undefined value is given, the entire stream is returned
   *   unaltered.
   */
  take(count: number): OrderedLazyIterator<T> {
    return new AlreadyOrderedIterator(super.take(count));
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
  prefetch(bufferSize: number): OrderedLazyIterator<T> {
    return new AlreadyOrderedIterator(super.prefetch(bufferSize));
  }

  /**
   * Filters this stream according to `predicate`.
   *
   * @param predicate A function mapping a stream element to a boolean or a
   * `Promise` for one.
   *
   * @returns A `LazyIterator` of elements for which the predicate was true.
   */
  filter(predicate: (value: T) => boolean): OrderedLazyIterator<T> {
    return new FilterIterator(this, predicate);
  }

  /**
   * Maps this stream through a 1-to-many transform.
   *
   * @param predicate A function mapping a stream element to an array of
   *   transformed elements.
   *
   * @returns A `DataStream` of transformed elements.
   */
  flatmap<O>(transform: (value: T) => O[]): OrderedLazyIterator<O> {
    return new FlatmapIterator(this, transform);
  }

  /**
   * Groups elements into batches.
   *
   * @param batchSize The number of elements desired per batch.
   * @param smallLastBatch Whether to emit the final batch when it has fewer
   *   than batchSize elements. Default true.
   * @returns A `LazyIterator` of batches of elements, represented as arrays
   *   of the original element type.
   */
  batch(batchSize: number, smallLastBatch = true): OrderedLazyIterator<T[]> {
    return new BatchIterator(this, batchSize, smallLastBatch);
  }

  /**
   * Concatenate this `LazyIterator` with another.
   *
   * @param iterator A `LazyIterator` to be concatenated onto this one.
   * @returns A `LazyIterator`.
   */
  concatenate(iterator: LazyIterator<T>): OrderedLazyIterator<T> {
    return ChainedIterator.create(
        imposeStrictOrder(iteratorFromItems([this, iterator])));
  }

  /**
   * Skips the first `count` items in this stream.
   *
   * @param count The number of items to skip.  If a negative or undefined value
   *   is given, the entire stream is returned unaltered.
   */
  skip(count: number): OrderedLazyIterator<T> {
    if (count < 0 || count == null) {
      return this;
    }
    return new SkipIterator(this, count);
  }

  // TODO(soergel): deep sharded shuffle, where supported

  /**
   * Randomly shuffles the elements of this stream.
   *
   * @param bufferSize: An integer specifying the number of elements from this
   *   stream from which the new stream will sample.
   * @param seed: (Optional.) An integer specifying the random seed that will
   *   be used to create the distribution.
   */
  shuffle(windowSize: number, seed?: string): LazyIterator<T> {
    return new ShuffleIterator(this, windowSize, seed);
  }
}

class AlreadyOrderedIterator<T> extends OrderedLazyIterator<T> {
  constructor(private readonly upstream: LazyIterator<T>) {
    super();
  }
  next() {
    return this.upstream.next();
  }
}

class ArrayIterator<T> extends OrderedLazyIterator<T> {
  private trav = 0;
  constructor(protected items: T[]) {
    super();
  }

  async next(): Promise<IteratorResult<T>> {
    if (this.trav >= this.items.length) {
      return {value: null, done: true};
    }
    const result = this.items[this.trav];
    this.trav++;
    return {value: result, done: false};
  }
}

class FunctionCallIterator<T> extends OrderedLazyIterator<T> {
  constructor(protected nextFn: () => IteratorResult<T>) {
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

/******* Serial ********/

export abstract class SerialLazyIterator<T> extends OrderedLazyIterator<T> {
  private lastRead: Promise<OrderedIteratorResult<T>>;

  constructor() {
    super();
    this.lastRead = Promise.resolve({value: null, done: false});
  }

  async next(): Promise<IteratorResult<T>> {
    this.lastRead = this.advance(this.lastRead);
    return this.lastRead;
  }

  private async advance(t: Promise<OrderedIteratorResult<T>>):
      Promise<OrderedIteratorResult<T>> {
    await t;
    return this.serialNext();
  }

  abstract async serialNext(): Promise<OrderedIteratorResult<T>>;
}

export function imposeStrictOrder<T>(upstream: LazyIterator<T>):
    OrderedLazyIterator<T> {
  if (upstream instanceof OrderedLazyIterator) {
    return upstream;
  }
  return new ForceSerialLazyIterator(upstream);
}

class ForceSerialLazyIterator<T> extends SerialLazyIterator<T> {
  constructor(private readonly upstream: LazyIterator<T>) {
    super();
  }

  async serialNext(): Promise<OrderedIteratorResult<T>> {
    const item = await this.upstream.next();
    return item as OrderedIteratorResult<T>;
  }
}

export class SkipIterator<T> extends SerialLazyIterator<T> {
  count = 0;
  constructor(protected upstream: LazyIterator<T>, protected maxCount: number) {
    super();
  }

  async serialNext(): Promise<IteratorResult<T>> {
    // TODO(soergel): consider tradeoffs of reading in parallel, eg. collecting
    // next() promises in an Array and then waiting for Promise.all() of those.
    // Benefit: pseudo-parallel execution.  Drawback: maybe delayed GC.
    while (this.count++ < this.maxCount) {
      const skipped = await this.upstream.next();
      // short-circuit if upstream is already empty
      if (skipped.done) {
        return skipped;
      }
      tf.dispose(skipped.value as {});
    }
    const result = await this.upstream.next();
    return result;
  }
}

class BatchIterator<T> extends SerialLazyIterator<T[]> {
  constructor(
      protected upstream: LazyIterator<T>, protected batchSize: number,
      protected enableSmallLastBatch = true) {
    super();
  }
  async serialNext(): Promise<IteratorResult<T[]>> {
    const batch: T[] = [];
    while (batch.length < this.batchSize) {
      const item = await this.upstream.next();
      if (item.done) {
        if (this.enableSmallLastBatch && batch.length > 0) {
          return {value: batch, done: false};
        }
        return {value: null, done: true};
      }
      batch.push(item.value);
    }
    return {value: batch, done: false};
  }
}

class FilterIterator<T> extends SerialLazyIterator<T> {
  constructor(
      protected upstream: LazyIterator<T>,
      protected predicate: (value: T) => boolean) {
    super();
  }
  async serialNext(): Promise<IteratorResult<T>> {
    while (true) {
      const item = await this.upstream.next();
      if (item.done || this.predicate(item.value)) {
        // go to the end of the line to avoid unexpected shuffling
        return Promise.resolve().then(() => item);
      }
      tf.dispose(item.value as {});
    }
  }
}

// Iterators that maintain a queue of pending items
// ============================================================================

/**
 * A base class for transforming streams that operate by maintaining an
 * output queue of elements that are ready to return via next().  This is
 * commonly required when the transformation is 1-to-many:  A call to next()
 * may trigger a call to the underlying stream, which will produce many mapped
 * elements of this stream-- of which we need to return only one, so we have to
 * queue the rest.
 */
export abstract class OneToManyIterator<T> extends SerialLazyIterator<T> {
  protected outputQueue: RingBuffer<T>;

  constructor() {
    super();
    this.outputQueue = new GrowingRingBuffer<T>();
  }
  /**
   * Read one or more chunks from upstream and process them, possibly reading or
   * writing a carryover, and adding processed items to the output queue.  Note
   * it's possible that no items are added to the queue on a given
   * pump() call, even if the upstream stream is not closed (e.g., because items
   * are filtered).
   *
   * @return `true` if any action was taken, i.e. fetching items from the
   *   upstream source OR adding items to the output queue.  `false` if the
   *   upstream source is exhausted AND nothing was added to the queue (i.e.,
   *   any remaining carryover).
   */
  protected abstract async pump(): Promise<boolean>;

  async serialNext(): Promise<IteratorResult<T>> {
    // Fetch so that the queue contains at least one item if possible.
    // If the upstream source is exhausted, AND there are no items left in the
    // output queue, then this stream is also exhausted.
    while (this.outputQueue.length() === 0) {
      // TODO(soergel): consider parallel reads.
      if (!await this.pump()) {
        return {value: null, done: true};
      }
    }
    return {value: this.outputQueue.shift(), done: false};
  }
}

class FlatmapIterator<I, O> extends OneToManyIterator<O> {
  constructor(
      protected upstream: LazyIterator<I>,
      protected transform: (value: I) => O[]) {
    super();
  }

  async pump(): Promise<boolean> {
    const item = await this.upstream.next();
    if (item.done) {
      return false;
    }
    const inputTensors = getTensorsInContainer(item.value as {});
    // Careful: the transform may mutate the item in place.
    // that's why we have to remember the input Tensors above, and then below
    // dispose only those that were not passed through to the output.
    // Note too that the transform function is responsible for tidying any
    // intermediate Tensors.  Here we are concerned only about the inputs.
    const mappedArray = this.transform(item.value);
    const outputTensors = getTensorsInContainer(mappedArray as {});
    this.outputQueue.pushAll(mappedArray);

    // TODO(soergel) faster intersection, and deduplicate outputTensors
    // TODO(soergel) move to tf.disposeExcept(in, out)?
    for (const t of inputTensors) {
      if (!isTensorInList(t, outputTensors)) {
        t.dispose();
      }
    }

    return true;
  }
}

/**
 * Provides a `LazyIterator` that concatenates a stream of underlying streams.
 *
 * Doing this in a concurrency-safe way requires some trickery.  In particular,
 * we want this stream to return the elements from the underlying streams in
 * the correct order according to when next() was called, even if the resulting
 * Promises resolve in a different order.
 */
export class ChainedIterator<T> extends SerialLazyIterator<T> {
  private iterator: LazyIterator<T> = null;
  private moreIterators: LazyIterator<LazyIterator<T>>;

  static create<T>(iterators: OrderedLazyIterator<LazyIterator<T>>):
      ChainedIterator<T> {
    const c = new ChainedIterator<T>();
    c.moreIterators = iterators;
    return c;
  }

  async serialNext(): Promise<IteratorResult<T>> {
    if (this.iterator == null) {
      const iteratorResult = await this.moreIterators.next();
      if (iteratorResult.done) {
        // No more streams to stream from.
        return {value: null, done: true};
      }
      this.iterator = iteratorResult.value;
    }
    const itemResult = await this.iterator.next();
    if (itemResult.done) {
      this.iterator = null;
      return this.serialNext();
    }
    return itemResult;
  }
}

/**
 * A stream that performs a sliding-window random shuffle on an upstream
 * source. This is like a `PrefetchIterator` except that the items are returned
 * in randomized order.  Mixing naturally improves as the buffer size
 * increases.
 */
export class ShuffleIterator<T> extends SerialLazyIterator<T> {
  private random: seedrandom.prng;
  private upstreamExhausted = false;
  // TODO protected
  public buffer: RingBuffer<Promise<IteratorResult<T>>>;

  constructor(
      protected upstream: LazyIterator<T>, bufferSize: number, seed?: string) {
    super();
    this.random = seedrandom.alea(seed || performance.now().toString());
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

  private randomInt(max: number) {
    return Math.floor(this.random() * max);
  }

  protected chooseIndex(): number {
    return this.randomInt(this.buffer.length());
  }

  async serialNext(): Promise<IteratorResult<T>> {
    if (!this.upstreamExhausted) {
      await this.refill();
    }

    // This loop keeps shrinking the buffer, so eventually either a non-done
    // entry will be found, or the buffer will be empty.
    while (true) {
      if (this.buffer.isEmpty()) {
        return {value: null, done: true};
      }
      const chosenIndex = this.chooseIndex();
      const result = this.buffer.shuffleExcise(chosenIndex);
      if ((await result).done) {
        this.upstreamExhausted = true;
      } else {
        return result;
      }
    }
  }
}
