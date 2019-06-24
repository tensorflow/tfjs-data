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

import {ENV, util} from '@tensorflow/tfjs-core';
import {urlChunkIterator} from './url_chunk_iterator';


const TEST_STRING = 'abcdefghijklmnopqrstuvwxyz';

// node-fetch requires absolute url syntax even though the response is mocked.
const URL = 'http://google.com/';

describe('URLChunkIterator', () => {
  beforeAll(() => {
    spyOn(util, 'fetch').and.callFake((path: string) => {
      if (ENV.get('IS_BROWSER')) {
        return new Response(TEST_STRING);
      } else {
        return {
          ok: true,
          text: () => {
            return TEST_STRING;
          }
        };
      }
    });
  });

  it('Reads the entire file and then closes the stream', async () => {
    const readIterator = await urlChunkIterator(URL, {chunkSize: 10});
    const result = await readIterator.toArrayForTest();
    expect(result.length).toEqual(3);
    const totalBytes = result.map(x => x.length).reduce((a, b) => a + b);
    expect(totalBytes).toEqual(26);
  });

  it('Reads chunks in order', async () => {
    const readIterator = await urlChunkIterator(URL, {chunkSize: 10});

    const result = await readIterator.toArrayForTest();
    expect(result[0][0]).toEqual('a'.charCodeAt(0));
    expect(result[1][0]).toEqual('k'.charCodeAt(0));
    expect(result[2][0]).toEqual('u'.charCodeAt(0));
  });

  it('Reads chunks of expected sizes', async () => {
    const readIterator = await urlChunkIterator(URL, {chunkSize: 10});

    const result = await readIterator.toArrayForTest();
    expect(result[0].length).toEqual(10);
    expect(result[1].length).toEqual(10);
    expect(result[2].length).toEqual(6);
  });
});
