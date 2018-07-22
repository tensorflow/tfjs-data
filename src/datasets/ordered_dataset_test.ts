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
import {describeWithFlags} from '@tensorflow/tfjs-core/dist/jasmine_util';
import {OrderedLazyIterator} from '../iterators/ordered_iterators/ordered_iterator';
import {DataElementObject} from '../types';
import {datasetFromElements, OrderedDataset} from './ordered_dataset';
// tslint:enable:max-line-length

class TestObjectIterator extends OrderedLazyIterator<{}> {
  data = Array.from({length: 100}, (v, k) => k);
  currentIndex = 0;

  async next(): Promise<IteratorResult<{}>> {
    if (this.currentIndex >= 100) {
      return {value: null, done: true};
    }
    const elementNumber = this.data[this.currentIndex];
    const result = {
      'number': elementNumber,
      'numberArray': [elementNumber, elementNumber ** 2, elementNumber ** 3],
      'Tensor':
          tf.tensor1d([elementNumber, elementNumber ** 2, elementNumber ** 3]),
      'Tensor2': tf.tensor2d(
          [
            elementNumber, elementNumber ** 2, elementNumber ** 3,
            elementNumber ** 4
          ],
          [2, 2]),
      'string': `Item ${elementNumber}`
    };
    this.currentIndex++;
    return {value: result, done: false};
  }
}

export class TestOrderedDataset extends OrderedDataset<DataElementObject> {
  async iterator(): Promise<OrderedLazyIterator<{}>> {
    return new TestObjectIterator();
  }
}

describeWithFlags('OrderedDataset', tf.test_util.CPU_ENVS, () => {
  it('can be concatenated', done => {
    const a = datasetFromElements([{'item': 1}, {'item': 2}, {'item': 3}]);
    const b = datasetFromElements([{'item': 4}, {'item': 5}, {'item': 6}]);
    a.concatenate(b)
        .collectAll()
        .then(result => {
          expect(result).toEqual([
            {'item': 1}, {'item': 2}, {'item': 3}, {'item': 4}, {'item': 5},
            {'item': 6}
          ]);
        })
        .then(done)
        .catch(done.fail);
  });

  it('can be created by concatenating multiple underlying datasets via reduce',
     async done => {
       const a = datasetFromElements([{'item': 1}, {'item': 2}]);
       const b = datasetFromElements([{'item': 3}, {'item': 4}]);
       const c = datasetFromElements([{'item': 5}, {'item': 6}]);
       const concatenated = [a, b, c].reduce((a, b) => a.concatenate(b));
       concatenated.collectAll()
           .then(result => {
             expect(result).toEqual([
               {'item': 1}, {'item': 2}, {'item': 3}, {'item': 4}, {'item': 5},
               {'item': 6}
             ]);
           })
           .then(done)
           .catch(done.fail);
     });

  it('can be repeated a fixed number of times', done => {
    const a = datasetFromElements([{'item': 1}, {'item': 2}, {'item': 3}]);
    a.repeat(4)
        .collectAll()
        .then(result => {
          expect(result).toEqual([
            {'item': 1},
            {'item': 2},
            {'item': 3},
            {'item': 1},
            {'item': 2},
            {'item': 3},
            {'item': 1},
            {'item': 2},
            {'item': 3},
            {'item': 1},
            {'item': 2},
            {'item': 3},
          ]);
        })
        .then(done)
        .catch(done.fail);
  });

  it('can be repeated indefinitely', done => {
    const a = datasetFromElements([{'item': 1}, {'item': 2}, {'item': 3}]);
    a.repeat().take(234).collectAll().then(done).catch(done.fail);
    done();
  });

  it('skip does not leak Tensors', async done => {
    try {
      const ds = new TestOrderedDataset();
      expect(tf.memory().numTensors).toEqual(0);
      const result = await ds.skip(15).collectAll();
      // The test dataset had 100 elements; we skipped 15; 85 remain.
      expect(result.length).toEqual(85);
      // Each element of the test dataset contains 2 Tensors;
      // 85 elements remain, so 2 * 85 = 170 Tensors remain.
      expect(tf.memory().numTensors).toEqual(170);
      done();
    } catch (e) {
      done.fail(e);
    }
  });

  it('filter does not leak Tensors', async done => {
    try {
      const ds = new TestOrderedDataset();
      expect(tf.memory().numTensors).toEqual(0);
      await ds.filter(x => ((x['number'] as number) % 2 === 0)).collectAll();
      // Each element of the test dataset contains 2 Tensors.
      // There were 100 elements, but we filtered out half of them.
      // Thus 50 * 2 = 100 Tensors remain.
      expect(tf.memory().numTensors).toEqual(100);
      done();
    } catch (e) {
      done.fail(e);
    }
  });
});
