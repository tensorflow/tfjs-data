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

import {ChunkIteratorOptions} from '../types';

import {ByteChunkIterator} from './byte_chunk_iterator';

/**
 * Provide a stream of chunks from an Uint8Array.
 * @param uint8Array The source Uint8Array.
 * @param options Optional settings controlling Uint8Array reading.
 * @returns a lazy Iterator of Uint8Arrays containing sequential chunks of the
 *   input Uint8Array.
 */
export class Uint8ArrayChunkIterator extends ByteChunkIterator {
  offset: number;
  chunkSize: number;
  constructor(
      protected uint8Array: Uint8Array,
      protected options: ChunkIteratorOptions = {}) {
    super();
    this.offset = options.offset || 0;
    // default 1MB chunk has tolerable perf on large inputs
    this.chunkSize = options.chunkSize || 1024 * 1024;
  }

  summary() {
    return `Uint8ArrayChunks ${this.uint8Array}`;
  }
  async next(): Promise<IteratorResult<Uint8Array>> {
    if (this.offset >= this.uint8Array.byteLength) {
      return {value: null, done: true};
    }
    const chunk = new Promise<Uint8Array>((resolve, reject) => {
      const end = this.offset + this.chunkSize;
      // Note if end > this.uint8Array.byteLength, we just get a small last
      // chunk.
      resolve(new Uint8Array(this.uint8Array.slice(this.offset, end)));
      this.offset = end;
    });
    return {value: (await chunk), done: false};
  }
}
