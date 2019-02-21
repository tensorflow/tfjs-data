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
 *
 * =============================================================================
 */

import {util} from '@tensorflow/tfjs-core';
import {iteratorFromItems} from './lazy_iterator';
import {RateLimitingIterator} from './rate_limiting_iterator';

describe('RateLimitingIterator', () => {
  fit('fetches a stream completely (stream size < buffer size)', async () => {
    const items = [];
    for(let i = 0;i<100;i++){
      items.push(i);
    }
    const arrayIterator = iteratorFromItems(items);
    const rateLimitingIterator =
        new RateLimitingIterator(arrayIterator, 10);
    const startTime = util.now();
    for(let i=0;i<11;i++){
      await rateLimitingIterator.next();
    }
    const endTime = util.now();
    // The rateLimitingIterator should return at most 10 items in 1000
    // millisecond. So pulling 11 items should take more than 1000 millisecond.
    expect(endTime - startTime).toBeGreaterThan(1000);
  });
});
