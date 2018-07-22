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

import {iteratorFromFunction} from '../iterators/ordered_iterator';
import {DatasetContainer} from '../iterators/stateful/zip_iterator';

import {datasetFromElements, datasetFromOrderedIteratorFn} from './ordered_dataset';
import {zip} from './zip_dataset';

// tslint:enable:max-line-length

describeWithFlags('Zip OrderedDataset', tf.test_util.CPU_ENVS, () => {
  it('can be created by zipping an array of datasets with primitive elements',
     async () => {
       const a = datasetFromElements([1, 2, 3]);
       const b = datasetFromElements([4, 5, 6]);
       const result = await zip([a, b]).collectAll();
       expect(result).toEqual([[1, 4], [2, 5], [3, 6]]);
     });

  it('can be created by zipping an array of datasets with object elements',
     async () => {
       const a = datasetFromElements([{a: 1}, {a: 2}, {a: 3}]);
       const b = datasetFromElements([{b: 4}, {b: 5}, {b: 6}]);
       const result = await zip([a, b]).collectAll();
       expect(result).toEqual(
           [[{a: 1}, {b: 4}], [{a: 2}, {b: 5}], [{a: 3}, {b: 6}]]);
     });

  it('can be created by zipping a dict of datasets', async () => {
    const a = datasetFromElements([{a: 1}, {a: 2}, {a: 3}]);
    const b = datasetFromElements([{b: 4}, {b: 5}, {b: 6}]);
    const result = await zip({c: a, d: b}).collectAll();
    expect(result).toEqual([
      {c: {a: 1}, d: {b: 4}}, {c: {a: 2}, d: {b: 5}}, {c: {a: 3}, d: {b: 6}}
    ]);
  });

  it('can be created by zipping a nested structure of datasets', async () => {
    const a = datasetFromElements([1, 2, 3]);
    const b = datasetFromElements([4, 5, 6]);
    const c = datasetFromElements([7, 8, 9]);
    const d = datasetFromElements([10, 11, 12]);
    const result = await zip({a, bcd: [b, {c, d}]}).collectAll();

    expect(result).toEqual([
      {a: 1, bcd: [4, {c: 7, d: 10}]},
      {a: 2, bcd: [5, {c: 8, d: 11}]},
      {a: 3, bcd: [6, {c: 9, d: 12}]},
    ]);
  });

  it('can be created by zipping datasets of different sizes', async () => {
    const a = datasetFromElements([1, 2]);
    const b = datasetFromElements([3, 4, 5, 6]);
    const result = await zip([a, b]).collectAll();
    expect(result).toEqual([[1, 3], [2, 4]]);
  });

  it('zipping a native string throws an error', async done => {
    try {
      // tslint:disable-next-line:no-any no-construct
      await zip('test' as any);
      done.fail();
    } catch (e) {
      expect(e.message).toEqual(
          'The argument to zip() must be an object or array.');
      done();
    }
  });

  it('zipping a string object throws a meaningful error', async done => {
    try {
      // tslint:disable-next-line:no-any no-construct
      await zip(new String('test') as any).iterator();
      done.fail();
    } catch (e) {
      // This error is not specific to the error case arising from
      //   typeof(new String('test')) === 'object'
      // Instead this error is thrown because the leaves of the structure are
      // the letters t, e, s, and t, as well a number for the length.
      // I think it's a fine error message for this situation anyway.
      expect(e.message).toEqual(
          'Leaves of the structure passed to zip() must be Datasets, ' +
          'not primitives.');
      done();
    }
  });

  it('zipping a structure with repeated elements works', async () => {
    const a = datasetFromElements([1, 2, 3]);
    const b = datasetFromElements([4, 5, 6]);
    const c = datasetFromElements([7, 8, 9]);
    const d = datasetFromElements([10, 11, 12]);
    const result = await zip({a, abacd: [a, b, {a, c, d}]}).collectAll();

    expect(result).toEqual([
      {a: 1, abacd: [1, 4, {a: 1, c: 7, d: 10}]},
      {a: 2, abacd: [2, 5, {a: 2, c: 8, d: 11}]},
      {a: 3, abacd: [3, 6, {a: 3, c: 9, d: 12}]},
    ]);
  });

  it('zipping a structure with cycles throws an error', async done => {
    try {
      // tslint:disable-next-line:no-any
      const a = datasetFromElements([1, 2, 3]);
      const b = datasetFromElements([4, 5, 6]);
      const c: DatasetContainer = [datasetFromElements([7, 8, 9])];
      const abc: DatasetContainer = [a, b, c];
      c.push(abc);
      await zip({a, abc}).iterator();
      done.fail();
    } catch (e) {
      expect(e.message).toEqual('Circular references are not supported.');
      done();
    }
  });

  it('zip propagates errors thrown when iterating constituent datasets',
     async done => {
       try {
         let count = 0;
         const a = datasetFromOrderedIteratorFn(
             async () => iteratorFromFunction(() => {
               if (count > 2) {
                 throw new Error('propagate me!');
               }
               return {value: count++, done: false};
             }));
         const b = datasetFromElements([3, 4, 5, 6]);
         // tslint:disable-next-line:no-any
         await zip([a, b]).collectAll();
         done.fail();
       } catch (e) {
         expect(e.message).toEqual(
             'Error thrown while iterating through a dataset: propagate me!');
         done();
       }
     });
});
