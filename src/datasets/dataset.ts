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

import {iteratorFromAsyncFunction, LazyIterator} from '../iterators/lazy_iterator';
import {imposeStrictOrder, iteratorFromConcatenated} from '../iterators/ordered_iterators/ordered_iterator';
import {DataElement} from '../types';
// tslint:enable:max-line-length

// TODO(soergel): consider vectorized operations within the pipeline.

/**
 * Represents a potentially large set of elements.
 *
 * A `Dataset` can be used to represent an input pipeline as a
 * collection of elements (maps from string keys to values) and a "logical
 * plan" of transformations that act on those elements.
 *
 * A `Dataset` provides a stream of unbatched examples, and its transformations
 * are applied one example at a time.  Batching produces a BatchDataset, and so
 * must come last in the pipeline because there are (so far) no batch-enabled
 * transformations.
 */
export abstract class Dataset<T extends DataElement> {
  /*
   * Provide a new stream of elements.  Note this will also start new streams
   * from any underlying `Dataset`s.
   *
   * CAUTION: Any Tensors contained within the elements returned from
   * this stream *must* be manually disposed to avoid a GPU memory leak.
   * The tf.tidy() approach cannot be used in a asynchronous context.
   */
  abstract async iterator(): Promise<LazyIterator<T>>;

  // TODO(soergel): Make Datasets report whether repeated iterator() calls
  // produce the same result (e.g., reading from a file) or different results
  // (e.g., from the webcam).  Currently we don't make this distinction but it
  // could be important for the user to know.
  // abstract isDeterministic(): boolean;

  /**
   * Maps this dataset through a 1-to-1 transform.
   *
   * @param transform A function mapping a dataset element to a transformed
   *   dataset element.
   *
   * @returns A `Dataset` of transformed elements.
   */
  map<O extends DataElement>(transform: (value: T) => O): Dataset<O> {
    const base = this;
    return datasetFromIteratorFn(async () => {
      return (await base.iterator()).map(x => tf.tidy(() => transform(x)));
    });
  }

  /**
   * Repeats this dataset `count` times.
   *
   * NOTE: If this dataset is a function of global state (e.g. a random number
   * generator), then different repetitions may produce different elements.
   *
   * @param count: (Optional.) An integer, representing the number of times
   *   the dataset should be repeated. The default behavior (if `count` is
   *   `undefined` or negative) is for the dataset be repeated indefinitely.
   * @returns A `Dataset`.
   */
  repeat(count?: number): Dataset<T> {
    const base = this;
    return datasetFromIteratorFn(async () => {
      const iteratorIterator = iteratorFromAsyncFunction(
          async () => ({value: await base.iterator(), done: false}));
      return iteratorFromConcatenated(
          imposeStrictOrder(iteratorIterator.take(count)));
    });
  }

  /**
   * Creates a `Dataset` with at most `count` elements from this dataset.
   *
   * @param count: The number of elements of this dataset that should be taken
   *   to form the new dataset.  If `count` is `undefined` or negative, or if
   *   `count` is greater than the size of this dataset, the new dataset will
   *   contain all elements of this dataset.
   * @returns A `Dataset`.
   */
  take(count: number): Dataset<T> {
    const base = this;
    return datasetFromIteratorFn(
        async () => (await base.iterator()).take(count));
  }

  /**
   *  Creates a `Dataset` that prefetches elements from this Dataset.
   *
   * @param bufferSize: An integer specifying the number of elements to be
   *   prefetched.
   * @returns A `Dataset`.
   */
  prefetch(bufferSize: number): Dataset<T> {
    const base = this;
    return datasetFromIteratorFn(
        async () => (await base.iterator()).prefetch(bufferSize));
  }

  /**
   * Collect all elements of this dataset into an array.
   * Obviously this will succeed only for small datasets that fit in memory.
   * Useful for testing.
   *
   * @returns A Promise for an array of elements, which will resolve
   *   when a new stream has been obtained and fully consumed.
   */
  async collectAll() {
    return (await this.iterator()).collectRemaining();
  }

  /**
   * Apply a function to every element of the dataset.
   *
   * After the function is applied to a dataset element, any Tensors contained
   * within that element are disposed.
   *
   * @param f A function to apply to each dataset element.
   * @returns A `Promise` that resolves after all elements have been processed.
   */
  async forEach(f: (input: T) => void): Promise<void> {
    return (await this.iterator()).forEach(f);
  }

  /* TODO(soergel): for parity with tf.data:
  Dataset.flat_map()
  Dataset.dense_to_sparse_batch()
  Dataset.group_by_window()
  Dataset.padded_batch()
  */
}

/**
 * Create a `Dataset` defined by a provided iterator() function.
 */
export function datasetFromIteratorFn<T extends DataElement>(
    iteratorFn: () => Promise<LazyIterator<T>>): Dataset<T> {
  return new class extends Dataset<T> {
    /*
     * Provide a new stream of elements.  Note this will also start new streams
     * from any underlying `Dataset`s.
     */
    async iterator(): Promise<LazyIterator<T>> {
      return iteratorFn();
    }
  }
  ();
}
