/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
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
 * =============================================================================
 */

import * as tf from '@tensorflow/tfjs-core';
import {describeWithFlags} from '@tensorflow/tfjs-core/dist/jasmine_util';
import {fromFunction, generator} from './readers';

describeWithFlags('readers', tf.test_util.ALL_ENVS, () => {
  it('generate dataset from function', async () => {
    let i = -1;
    const func = () =>
        ++i < 5 ? {value: i, done: false} : {value: null, done: true};
    const ds = fromFunction(func);
    const result = await ds.toArray();
    expect(result).toEqual([0, 1, 2, 3, 4]);
  });

  it('generate dataset from JavaScript generator', async () => {
    function* dataGenerator() {
      const numElements = 5;
      let index = 0;
      while (index < numElements) {
        const x = index;
        index++;
        yield x;
      }
    }
    const ds = generator(dataGenerator);
    const result = await ds.toArray();
    expect(result).toEqual([0, 1, 2, 3, 4]);
  });

  it('generate dataset from JavaScript iterator', async () => {
    function makeIterator() {
      let iterationCount = 0;

      const iterator = {
        next: () => {
          let result;
          if (iterationCount < 5) {
            result = {value: iterationCount, done: false};
            iterationCount++;
            return result;
          }
          return {value: iterationCount, done: true};
        }
      };
      return iterator;
    }
    const iter = makeIterator();
    const ds = generator(iter);
    const result = await ds.toArray();
    expect(result).toEqual([0, 1, 2, 3, 4]);
  });
});
