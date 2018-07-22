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
import {GrowingRingBuffer} from '../../util/growing_ring_buffer';
import {RingBuffer} from '../../util/ring_buffer';
import {OrderedIteratorResult, SerialLazyIterator} from '../ordered_iterator';

// tslint:enable:max-line-length

export interface StatefulIteratorResult<T, S> extends OrderedIteratorResult<T> {
  state: S;
}

export abstract class StatefulLazyIterator<T, S> extends SerialLazyIterator<T> {
  protected lastStateful: Promise<StatefulIteratorResult<T, S>>;
  constructor() {
    super();
    this.lastStateful =
        Promise.resolve({value: null, done: false, state: this.initialState()});
  }

  abstract initialState(): S;

  async serialNext(): Promise<OrderedIteratorResult<T>> {
    this.lastStateful = this.statefulNext((await this.lastStateful).state);
    return this.lastStateful;
  }

  abstract async statefulNext(state: S): Promise<StatefulIteratorResult<T, S>>;
}

export interface StatefulPumpResult<S> {
  pumpDidWork: boolean;
  state: S;
}

/**
 * A base class for transforming streams that operate by maintaining an
 * output queue of elements that are ready to return via next().  This is
 * commonly required when the transformation is 1-to-many:  A call to next()
 * may trigger a call to the underlying stream, which will produce many mapped
 * elements of this stream-- of which we need to return only one, so we have to
 * queue the rest.
 */
export abstract class StatefulOneToManyIterator<T, S> extends
    StatefulLazyIterator<T, S> {
  // This bit of non-threaded state is safe because we know the statefulNext
  // calls are strictly sequenced.
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
  protected abstract async statefulPump(state: S):
      Promise<StatefulPumpResult<S>>;

  async statefulNext(state: S): Promise<StatefulIteratorResult<T, S>> {
    // Fetch so that the queue contains at least one item if possible.
    // If the upstream source is exhausted, AND there are no items left in the
    // output queue, then this stream is also exhausted.
    while (this.outputQueue.length() === 0) {
      const {pumpDidWork, state: newState} = await this.statefulPump(state);
      state = newState;
      if (!pumpDidWork) {
        return {value: null, done: true, state};
      }
    }
    return {value: this.outputQueue.shift(), done: false, state};
  }
}
