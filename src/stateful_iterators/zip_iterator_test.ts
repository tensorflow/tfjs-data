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
import {TestIntegerIterator} from '../stateless_iterators/stateless_iterator_test';
import {DataElement, DataElementArray, DataElementObject} from '../types';
import {iteratorFromZipped, ZipMismatchMode} from './zip_iterator';

// tslint:enable:max-line-length

describe('StatefulLazyIterator', () => {
  it('can be created by zipping an array of streams', async done => {
    try {
      const a = new TestIntegerIterator();
      const b = new TestIntegerIterator().map(x => x * 10);
      const c = new TestIntegerIterator().map(x => 'string ' + x);
      const readStream = iteratorFromZipped([a, b, c]);
      const result = await readStream.collectRemaining();
      expect(result.length).toEqual(100);

      // each result has the form [x, x * 10, 'string ' + x]

      for (const e of result) {
        const ee = e as DataElementArray;
        expect(ee[1]).toEqual(ee[0] as number * 10);
        expect(ee[2]).toEqual('string ' + ee[0]);
      }
      done();
    } catch (e) {
      done.fail();
    }
  });

  it('can be created by zipping a dict of streams', async done => {
    try {
      const a = new TestIntegerIterator();
      const b = new TestIntegerIterator().map(x => x * 10);
      const c = new TestIntegerIterator().map(x => 'string ' + x);
      const readStream = iteratorFromZipped({a, b, c});
      const result = await readStream.collectRemaining();
      expect(result.length).toEqual(100);

      // each result has the form {a: x, b: x * 10, c: 'string ' + x}

      for (const e of result) {
        const ee = e as DataElementObject;
        expect(ee['b']).toEqual(ee['a'] as number * 10);
        expect(ee['c']).toEqual('string ' + ee['a']);
      }
      done();
    } catch (e) {
      done.fail();
    }
  });

  it('can be created by zipping a nested structure of streams', async done => {
    try {
      const a = new TestIntegerIterator().map(x => ({'a': x, 'constant': 12}));
      const b = new TestIntegerIterator().map(
          x => ({'b': x * 10, 'array': [x * 100, x * 200]}));
      const c = new TestIntegerIterator().map(x => ({'c': 'string ' + x}));
      const readStream = iteratorFromZipped([a, b, c]);
      const result = await readStream.collectRemaining();
      expect(result.length).toEqual(100);

      // each result has the form
      // [
      //   {a: x, 'constant': 12}
      //   {b: x * 10, 'array': [x * 100, x * 200]},
      //   {c: 'string ' + x}
      // ]

      for (const e of result) {
        const ee = e as DataElementArray;
        const aa = ee[0] as DataElementObject;
        const bb = ee[1] as DataElementObject;
        const cc = ee[2] as DataElementObject;
        expect(aa['constant']).toEqual(12);
        expect(bb['b']).toEqual(aa['a'] as number * 10);
        expect(bb['array']).toEqual([
          aa['a'] as number * 100, aa['a'] as number * 200
        ]);
        expect(cc['c']).toEqual('string ' + aa['a']);
      }
      done();
    } catch (e) {
      done.fail();
    }
  });

  it('zip requires streams of the same length by default', async done => {
    try {
      const a = new TestIntegerIterator(10);
      const b = new TestIntegerIterator(3);
      const c = new TestIntegerIterator(2);
      const readStream = iteratorFromZipped([a, b, c]);
      await readStream.collectRemaining();
      // expected error due to default ZipMismatchMode.FAIL
      done.fail();
    } catch (e) {
      done();
    }
  });

  it('zip can be told to terminate when the shortest stream terminates',
     async done => {
       try {
         const a = new TestIntegerIterator(10);
         const b = new TestIntegerIterator(3);
         const c = new TestIntegerIterator(2);
         const readStream =
             iteratorFromZipped([a, b, c], ZipMismatchMode.SHORTEST);
         const result = await readStream.collectRemaining();
         expect(result.length).toEqual(2);
         done();
       } catch (e) {
         done.fail();
       }
     });

  it('zip can be told to terminate when the longest stream terminates',
     async done => {
       try {
         const a = new TestIntegerIterator(10);
         const b = new TestIntegerIterator(3);
         const c = new TestIntegerIterator(2);
         const readStream =
             iteratorFromZipped([a, b, c], ZipMismatchMode.LONGEST);
         const result = await readStream.collectRemaining();
         expect(result.length).toEqual(10);
         expect(result[9]).toEqual([9, null, null]);
         done();
       } catch (e) {
         done.fail();
       }
     });

  /**
   * This test demonstrates behavior that is intrinsic to the tf.data zip() API,
   * but that may not be what users ultimately want when zipping dicts.
   * This may merit a convenience function (e.g., maybe flatZip()).
   */
  it('zipping DataElement streams requires manual merge', async done => {
    function naiveMerge(xs: DataElement[]): DataElement {
      const result = {};
      for (const x of xs) {
        // For now, we do nothing to detect name collisions here
        Object.assign(result, x);
      }
      return result;
    }

    try {
      const a = new TestIntegerIterator().map(x => ({'a': x}));
      const b = new TestIntegerIterator().map(x => ({'b': x * 10}));
      const c = new TestIntegerIterator().map(x => ({'c': 'string ' + x}));
      const zippedStream = iteratorFromZipped([a, b, c]);
      // At first, each result has the form
      // [{a: x}, {b: x * 10}, {c: 'string ' + x}]

      const readStream =
          zippedStream.map(e => naiveMerge(e as DataElementArray));
      // Now each result has the form {a: x, b: x * 10, c: 'string ' + x}

      const result = await readStream.collectRemaining();
      expect(result.length).toEqual(100);

      for (const e of result) {
        const ee = e as DataElementObject;
        expect(ee['b']).toEqual(ee['a'] as number * 10);
        expect(ee['c']).toEqual('string ' + ee['a']);
      }
      done();
    } catch (e) {
      done.fail();
    }
  });
});
