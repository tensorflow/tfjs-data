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
import * as seedrandom from 'seedrandom';

import {iteratorFromItems, OrderedLazyIterator} from '../iterators/ordered_iterators/ordered_iterator';
import {BatchArray, DataElement, DatasetBatch, ElementArray, TabularRecord} from '../types';

import {Dataset, datasetFromIteratorFn} from './dataset';

// tslint:enable:max-line-length

export abstract class OrderedDataset<T extends DataElement> extends Dataset<T> {
  /*
   * Provide a new stream of elements.  Note this will also start new streams
   * from any underlying `Dataset`s.
   *
   * CAUTION: Any Tensors contained within the elements returned from
   * this stream *must* be manually disposed to avoid a GPU memory leak.
   * The tf.tidy() approach cannot be used in a asynchronous context.
   */
  abstract async iterator(): Promise<OrderedLazyIterator<T>>;

  /**
   * Filters this dataset according to `predicate`.
   *
   * @param predicate A function mapping a dataset element to a boolean or a
   * `Promise` for one.
   *
   * @returns A `Dataset` of elements for which the predicate was true.
   */
  filter(filterer: (value: T) => boolean): OrderedDataset<T> {
    const base = this;
    return datasetFromOrderedIteratorFn(async () => {
      return (await base.iterator()).filter(x => tf.tidy(() => filterer(x)));
    });
  }

  /**
   * Concatenates this `Dataset` with another.
   *
   * @param dataset A `Dataset` to be concatenated onto this one.
   * @returns A `Dataset`.
   */
  concatenate(dataset: OrderedDataset<T>): OrderedDataset<T> {
    const base = this;
    return datasetFromOrderedIteratorFn(
        async () =>
            (await base.iterator()).concatenate(await dataset.iterator()));
  }

  /**
   * Creates a `Dataset` that skips `count` elements from this dataset.
   *
   * @param count: The number of elements of this dataset that should be skipped
   *   to form the new dataset.  If `count` is greater than the size of this
   *   dataset, the new dataset will contain no elements.  If `count`
   *   is `undefined` or negative, skips the entire dataset.
   *
   * @returns A `Dataset`.
   */
  skip(count: number): OrderedDataset<T> {
    const base = this;
    return datasetFromOrderedIteratorFn(
        async () => (await base.iterator()).skip(count));
  }

  // TODO(soergel): deep sharded shuffle, where supported

  /**
   * Randomly shuffles the elements of this dataset.
   *
   * @param bufferSize: An integer specifying the number of elements from this
   *   dataset from which the new dataset will sample.
   * @param seed: (Optional.) An integer specifying the random seed that will
   *   be used to create the distribution.
   * @param reshuffleEachIteration: (Optional.) A boolean, which if true
   *   indicates that the dataset should be pseudorandomly reshuffled each time
   *   it is iterated over. (Defaults to `true`.)
   * @returns A `Dataset`.
   */
  shuffle(bufferSize: number, seed?: string, reshuffleEachIteration = true):
      Dataset<T> {
    const base = this;
    const random = seedrandom.alea(seed || performance.now().toString());
    return datasetFromIteratorFn(async () => {
      let seed2 = random.int32();
      if (reshuffleEachIteration) {
        seed2 += random.int32();
      }
      return (await base.iterator()).shuffle(bufferSize, seed2.toString());
    });
  }

  /**
   * Groups elements into batches and arranges their values in columnar form.
   *
   * It is assumed that each of the incoming dataset elements has the same set
   * of keys.  For each key, the resulting BatchDataset provides a BatchElement
   * collecting all of the incoming values for that key.  Incoming strings are
   * grouped into a string[].  Incoming Tensors are grouped into a new Tensor
   * where the 0'th axis is the batch dimension.  These columnar representations
   * for each key can be zipped together to reconstruct the original
   * dataset elements.
   *
   * @param batchSize The number of elements desired per batch.
   * @param smallLastBatch Whether to emit the final batch when it has fewer
   *   than batchSize elements. Default true.
   * @returns A `BatchDataset`, from which a stream of batches can be obtained.
   */
  batch(batchSize: number, smallLastBatch = true): BatchDataset {
    return new BatchDataset(this, batchSize, smallLastBatch);
  }
}

/**
 * Create a `Dataset` defined by a provided iterator() function.
 */
export function datasetFromOrderedIteratorFn<T extends DataElement>(
    iteratorFn: () => Promise<OrderedLazyIterator<T>>): OrderedDataset<T> {
  return new class extends OrderedDataset<T> {
    /*
     * Provide a new stream of elements.  Note this will also start new streams
     * from any underlying `Dataset`s.
     */
    async iterator(): Promise<OrderedLazyIterator<T>> {
      return iteratorFn();
    }
  }
  ();
}

/**
 * Create a `Dataset` from an array of elements.
 */
export function datasetFromElements<T extends DataElement>(items: T[]):
    OrderedDataset<T> {
  return datasetFromOrderedIteratorFn(async () => iteratorFromItems(items));
}

// TODO(soergel): refactor to remove BatchDataset class, but retain columnar
// batching functionality.

/**
 * Represents a potentially large set of elements, grouped into batches.
 *
 * There are currently no batch-oriented data transformations.  Any desired
 * transformations should be applied to a `Dataset` so that they are
 * computed one example at a time.  The transformed data can then be batched
 * as the final step via `Dataset.batch()`.
 *
 * @param base: An underlying row-oriented `Dataset` to group into batches.
 * @param batchSize: The desired number of examples per batch.
 * @param smallLastBatch: Whether to emit a final batch with fewer than
 *   batchSize elements.  (Default true).
 */
export class BatchDataset {
  constructor(
      protected base: OrderedDataset<DataElement>, protected batchSize: number,
      protected smallLastBatch = true) {}

  /*
   * Provide a new stream of batches.  Note this will also start new streams
   * from any underlying `Dataset`s or 'BatchDataset's.
   */
  async iterator(): Promise<OrderedLazyIterator<DatasetBatch>> {
    const batchesAsArrays =
        (await this.base.iterator()).batch(this.batchSize, this.smallLastBatch);
    return batchesAsArrays.map(makeDatasetBatch);
  }
}

/**
 * Constructs a DatasetBatch from a list of TabularRecords.
 */
function makeDatasetBatch(elements: TabularRecord[]): DatasetBatch {
  const rotated: {[key: string]: (ElementArray[]|string[])} = {};

  // Assume that the first element is representative.
  // We do end up enforcing Tensor shape consistency below, but not
  // cleanly.
  // TODO(soergel) validate against a schema, allow missing keys, etc.
  // etc.
  const firstElement: TabularRecord = elements[0];
  const keys = Object.keys(firstElement);
  keys.forEach(key => {
    rotated[key] = [];
  });

  for (const e of elements) {
    keys.forEach(key => {
      const value = e[key];
      (rotated[key] as ElementArray[]).push(value);
    });
  }

  const result: {[key: string]: (BatchArray|string[])} = {};
  keys.forEach(key => {
    // this sanity check should always pass
    if (rotated[key].length !== elements.length) {
      throw new Error(
          `Batching failed to get a '${key}' value for each element.`);
    }
    if (typeof rotated[key][0] === 'string') {
      result[key] = rotated[key] as string[];
    } else {
      result[key] =
          batchConcat(rotated[key] as Array<number|number[]|tf.Tensor>);
    }
  });
  elements.forEach(tf.dispose);

  return result;
}

/**
 * Assembles a list of same-shaped numbers, number arrays, or Tensors
 * into a single new Tensor where axis 0 is the batch dimension.
 */
function batchConcat(arrays: Array<number|number[]|tf.Tensor>): tf.Tensor {
  // Should we use GPU-enabled concat ops in deeplearn's math.ts?
  // Probably not; the GPU roundtrip is not worth it for a trivial
  // operation.
  const [elementShape, ] = shapeAndValues(arrays[0]);
  const batchShape = [arrays.length].concat(elementShape);
  const resultVals = new Float32Array(batchShape.reduce((x, y) => x * y));

  let offset = 0;
  for (const a of arrays) {
    const [aShape, aVals] = shapeAndValues(a);
    if (!tf.util.arraysEqual(aShape, elementShape)) {
      throw new Error('Elements must have the same shape to be batched');
    }
    resultVals.set(aVals, offset);
    offset += aVals.length;
  }
  const result = tf.Tensor.make(batchShape, {values: resultVals});
  return result;
}

function shapeAndValues(array: number|number[]|tf.Tensor):
    [number[], number[]|Float32Array|Int32Array|Uint8Array] {
  if (array instanceof tf.Tensor) {
    return [array.shape, array.dataSync()];
  } else if (Array.isArray(array)) {
    return [[array.length], array];
  } else {
    return [[], [array]];
  }
}
