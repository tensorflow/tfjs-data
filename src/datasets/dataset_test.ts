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
import {LazyIterator} from '../iterators/lazy_iterator';
import {iteratorFromItems, OrderedLazyIterator} from '../iterators/ordered_iterators/ordered_iterator';
import {DataElementObject} from '../types';
import {Dataset} from './dataset';
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

export class TestDataset extends Dataset<DataElementObject> {
  async iterator(): Promise<LazyIterator<{}>> {
    return new TestObjectIterator();
  }
}

describeWithFlags('Dataset', tf.test_util.CPU_ENVS, () => {
  it('can be repeated with state in a closure', done => {
    // This tests a tricky bug having to do with 'this' being set properly.
    // See
    // https://github.com/Microsoft/TypeScript/wiki/%27this%27-in-TypeScript

    class CustomDataset extends Dataset<{}> {
      state = {val: 1};
      async iterator() {
        const result = iteratorFromItems([
          {'item': this.state.val++}, {'item': this.state.val++},
          {'item': this.state.val++}
        ]);
        return result;
      }
    }
    const a = new CustomDataset();
    a.repeat().take(1234).collectAll().then(done).catch(done.fail);
  });

  it('can collect all items into memory', async done => {
    try {
      const ds = new TestDataset();
      const items = await ds.collectAll();
      expect(items.length).toEqual(100);
      // The test dataset has 100 elements, each containing 2 Tensors.
      expect(tf.memory().numTensors).toEqual(200);
      done();
    } catch (e) {
      done.fail(e);
    }
  });

  it('map does not leak Tensors when none are returned', async done => {
    try {
      const ds = new TestDataset();
      expect(tf.memory().numTensors).toEqual(0);
      await ds.map(x => ({'constant': 1})).collectAll();
      // The map operation consumed all of the tensors and emitted none.
      expect(tf.memory().numTensors).toEqual(0);
      done();
    } catch (e) {
      done.fail(e);
    }
  });

  it('map does not lose or leak Tensors when some inputs are passed through',
     async done => {
       try {
         const ds = new TestDataset();
         expect(tf.memory().numTensors).toEqual(0);
         await ds.map(x => ({'Tensor2': x['Tensor2']})).collectAll();
         // Each element of the test dataset contains 2 Tensors.
         // Our map operation retained one of the Tensors and discarded the
         // other. Thus the mapped data contains 100 elements with 1 Tensor
         // each.
         expect(tf.memory().numTensors).toEqual(100);
         done();
       } catch (e) {
         done.fail(e);
       }
     });

  it('map does not leak Tensors when inputs are replaced', async done => {
    try {
      const ds = new TestDataset();
      expect(tf.memory().numTensors).toEqual(0);
      await ds.map(x => ({'a': tf.tensor1d([1, 2, 3])})).collectAll();
      // Each element of the test dataset contains 2 Tensors.
      // Our map operation discarded both Tensors and created one new one.
      // Thus the mapped data contains 100 elements with 1 Tensor each.
      expect(tf.memory().numTensors).toEqual(100);
      done();
    } catch (e) {
      done.fail(e);
    }
  });

  it('forEach does not leak Tensors', async done => {
    try {
      const ds = new TestDataset();
      let count = 0;
      await ds.forEach(element => {
        count++;
        return {};
      });
      // forEach traversed the entire dataset of 100 elements.
      expect(count).toEqual(100);
      // forEach consumed all of the input Tensors.
      expect(tf.memory().numTensors).toEqual(0);
      done();
    } catch (e) {
      done.fail(e);
    }
  });
});
