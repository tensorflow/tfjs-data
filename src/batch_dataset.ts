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

import * as tf from '@tensorflow/tfjs-core';

import {Dataset} from './dataset';
import {iteratorFromConcatenated, LazyIterator} from './iterators/lazy_iterator';
import {DataElement, ElementArray} from './types';

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
      protected base: Dataset<DataElement>, protected batchSize: number,
      protected smallLastBatch = true) {}

  /*
   * Provide a new stream of batches.  Note this will also start new streams
   * from any underlying `Dataset`s or 'BatchDataset's.
   */
  async iterator(): Promise<LazyIterator<DataElement>> {
    const batchesAsArrays =
        (await this.base.iterator()).batch(this.batchSize, this.smallLastBatch);
    return batchesAsArrays.map(makeDatasetBatch);
  }
}

export class ColumnMajorBatchIterator<T, B> extends LazyIterator<B> {
  // Strict Promise execution order:
  // a next() call may not even begin until the previous one completes.
  private lastRead: Promise<IteratorResult<B>>;

  constructor(protected upstream: LazyIterator<T[]>) {
    super();
    this.lastRead = Promise.resolve({value: null, done: false});
  }

  summary() {
    return `${this.upstream.summary()} -> ColumnMajorBatch`;
  }

  async next(): Promise<IteratorResult<B>> {
    // This sets this.lastRead to a new Promise right away, as opposed to
    // saying `await this.lastRead; this.lastRead = this.serialNext();` which
    // would not work because this.nextRead would be updated only after the
    // promise resolves.
    this.lastRead = this.lastRead.then(() => this.serialNext());
    return this.lastRead;
  }

  private async serialNext(): Promise<IteratorResult<B>> {
    const batchesAsArrays = await this.upstream.next();
    if (batchesAsArrays.done) {
      return {done: true, value: null};
    }
    return makeDatasetBatch(batchesAsArrays.value);
  }


  const batch: T[] = [];
  while(batch.length < this.batchSize) {
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
