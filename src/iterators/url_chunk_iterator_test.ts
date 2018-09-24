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

import * as fetchMock from 'fetch-mock';
// import fetch from 'node-fetch';
// global.fetch = require('node-fetch');

import {urlChunkIterator} from './url_chunk_iterator';

const testString = 'abcdefghijklmnopqrstuvwxyz';


const url = 'mock_url';
// const url = 'http://httpbin.org/get';
fetchMock.get('*', testString);
// fetchMock.get('*', {ok: false, buffer: Buffer.from(testString)});

// fetchMock.mock('*', {
//   ok: true,
//   blob: () => {
//     return new Blob([testString]);
//   },
//   buffer: Buffer.from(testString)
// });

describe('URLChunkIterator', () => {
  fit('Reads the entire file and then closes the stream', async () => {
    // fetchMock.get('*', {ok: false, buffer: Buffer.from(testString)});
    // const res = await fetch(url);
    // console.log(await res.ok);
    // fetchMock.reset();


    const readIterator = await urlChunkIterator(url, {chunkSize: 10});
    const result = await readIterator.collect();
    expect(result.length).toEqual(3);
    const totalBytes = result.map(x => x.length).reduce((a, b) => a + b);
    expect(totalBytes).toEqual(26);
  });

  it('Reads chunks in order', async () => {
    const readIterator = await urlChunkIterator(url, {chunkSize: 10});

    const result = await readIterator.collect();
    expect(result[0][0]).toEqual('a'.charCodeAt(0));
    expect(result[1][0]).toEqual('k'.charCodeAt(0));
    expect(result[2][0]).toEqual('u'.charCodeAt(0));
  });

  it('Reads chunks of expected sizes', async () => {
    const readIterator = await urlChunkIterator(url, {chunkSize: 10});

    const result = await readIterator.collect();
    expect(result[0].length).toEqual(10);
    expect(result[1].length).toEqual(10);
    expect(result[2].length).toEqual(6);
  });
});

fetchMock.reset();
