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
import {OrderedDataset} from '../../datasets/ordered_dataset';
import {Container, DataElement, OrderedIteratorContainer} from '../../types';
import {deepMapAndAwaitAll, DeepMapAsyncResult} from '../../util/deep_map';
import {LazyIterator} from '../lazy_iterator';
import {OrderedLazyIterator} from '../ordered_iterator';

import {StatefulIteratorResult, StatefulLazyIterator} from './stateful_iterator';
// tslint:enable:max-line-length

/**
 * A nested structure of Datasets, used as the input to zip().
 */
export type DatasetContainer = Container<OrderedDataset<DataElement>>;

/**
 * Create a `LazyIterator` by zipping together an array, dict, or nested
 * structure of `LazyIterator`s (and perhaps additional constants).
 *
 * The underlying streams must provide elements in a consistent order such that
 * they correspond.
 *
 * Typically, the underlying streams should have the same number of elements.
 * If they do not, the behavior is determined by the `mismatchMode` argument.
 *
 * The nested structure of the `iterators` argument determines the
 * structure of elements in the resulting iterator.
 *
 * @param iterators: An array or object containing LazyIterators at the leaves.
 * @param mismatchMode: Determines what to do when one underlying iterator is
 *   exhausted before the others.  `ZipMismatchMode.FAIL` (the default) causes
 *   an error to be thrown in this case.  `ZipMismatchMode.SHORTEST` causes the
 *   zipped iterator to terminate with the furst underlying streams, so elements
 *   remaining on the longer streams are ignored.  `ZipMismatchMode.LONGEST`
 *   causes the zipped stream to continue, filling in nulls for the exhausted
 *   streams, until all streams are exhausted.
 */
export function iteratorFromZipped(
    iterators: OrderedIteratorContainer,
    mismatchMode: ZipMismatchMode =
        ZipMismatchMode.FAIL): OrderedLazyIterator<DataElement> {
  return new ZipIterator(iterators, mismatchMode);
}

export enum ZipMismatchMode {
  FAIL,      // require zipped streams to have the same length
  SHORTEST,  // terminate zip when the first stream is exhausted
  LONGEST    // use nulls for exhausted streams; use up the longest stream.
}

export interface ZipState {
  count: number;
}

/**
 * Provides a `LazyIterator` that zips together an array, dict, or nested
 * structure of `LazyIterator`s (and perhaps additional constants).
 *
 * The underlying streams must provide elements in a consistent order such that
 * they correspond.
 *
 * Typically, the underlying streams should have the same number of elements.
 * If they do not, the behavior is determined by the `mismatchMode` argument.
 *
 * The nested structure of the `iterators` argument determines the
 * structure of elements in the resulting iterator.
 *
 * Doing this in a concurrency-safe way requires some trickery.  In particular,
 * we want this stream to return the elements from the underlying streams in
 * the correct order according to when next() was called, even if the resulting
 * Promises resolve in a different order.
 *
 * @param iterators: An array or object containing LazyIterators at the leaves.
 * @param mismatchMode: Determines what to do when one underlying iterator is
 *   exhausted before the others.  `ZipMismatchMode.FAIL` (the default) causes
 *   an error to be thrown in this case.  `ZipMismatchMode.SHORTEST` causes the
 *   zipped iterator to terminate with the furst underlying streams, so elements
 *   remaining on the longer streams are ignored.  `ZipMismatchMode.LONGEST`
 *   causes the zipped stream to continue, filling in nulls for the exhausted
 *   streams, until all streams are exhausted.
 */
export class ZipIterator extends StatefulLazyIterator<DataElement, ZipState> {
  constructor(
      protected readonly iterators: OrderedIteratorContainer,
      protected readonly mismatchMode: ZipMismatchMode = ZipMismatchMode.FAIL) {
    super();
  }

  initialState() {
    // we increment the count on return, so this way the first element is 0.
    return {count: -1};
  }

  async statefulNext(state: ZipState):
      Promise<StatefulIteratorResult<DataElement, ZipState>> {
    // Collect underlying iterator "done" signals as a side effect in getNext()
    let numIterators = 0;
    let iteratorsDone = 0;

    function getNext(container: OrderedIteratorContainer): DeepMapAsyncResult {
      if (container instanceof LazyIterator) {
        const result = container.next();
        return {
          value: result.then(x => {
            numIterators++;
            if (x.done) {
              iteratorsDone++;
            }
            return x.value;
          }),
          recurse: false
        };
      } else {
        return {value: null, recurse: true};
      }
    }
    const mapped = await deepMapAndAwaitAll(this.iterators, getNext);
    if (numIterators === iteratorsDone) {
      // The streams have all ended.
      return {value: null, done: true, state: {count: state.count++}};
    }
    if (iteratorsDone > 0) {
      switch (this.mismatchMode) {
        case ZipMismatchMode.FAIL:
          throw new Error(
              'Zipped streams should have the same length. ' +
              `Mismatched at element ${state.count}.`);
        case ZipMismatchMode.SHORTEST:
          return {value: null, done: true, state: {count: state.count++}};
        case ZipMismatchMode.LONGEST:
        default:
          // Continue.  The exhausted streams already produced value: null.
      }
    }

    const result = {value: mapped, done: false, state: {count: state.count++}};
    return result;
  }
}
