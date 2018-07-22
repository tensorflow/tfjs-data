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

// inspired by https://github.com/maxogden/filereader-stream

// tslint:disable:max-line-length

import {applyMixins} from '../../util/mixins';

import {ByteChunkIterator} from './byte_chunk_iterator';
import {StatefulIteratorResult, StatefulLazyIterator} from './stateful_iterator';
import {StringChunkIterator} from './string_iterator';

// tslint:enable:max-line-length

export interface FileChunkIteratorOptions {
  /** The byte offset at which to begin reading the File or Blob. Default 0. */
  offset?: number;
  /** The number of bytes to read at a time. Default 1MB. */
  chunkSize?: number;
}

export interface FileChunkIteratorState {
  readonly offset: number;
}
/**
 * Provide a stream of chunks from a File or Blob.
 * @param file The source File or Blob.
 * @param options Optional settings controlling file reading.
 * @returns a lazy Iterator of Uint8Arrays containing sequential chunks of the
 *   input file.
 */
export class FileChunkIterator extends
    StatefulLazyIterator<Uint8Array, FileChunkIteratorState> implements
        ByteChunkIterator {
  readonly chunkSize: number;

  constructor(
      protected file: File|Blob,
      protected options: FileChunkIteratorOptions = {}) {
    super();
    // default 1MB chunk has tolerable perf on large files
    this.chunkSize = options.chunkSize || 1024 * 1024;

    // override here because the super() call didn't have access to options.
    this.lastStateful = Promise.resolve({
      value: null,
      done: false,
      state: {offset: options.offset ? options.offset : 0}
    });
  }

  initialState() {
    return {offset: 0};
  }

  async statefulNext(state: FileChunkIteratorState):
      Promise<StatefulIteratorResult<Uint8Array, FileChunkIteratorState>> {
    if (state.offset >= this.file.size) {
      return {value: null, done: true, state};
    }
    const start = state.offset;
    const end = start + this.chunkSize;

    const chunk = new Promise<Uint8Array>((resolve, reject) => {
      // TODO(soergel): is this a performance issue?
      const fileReader = new FileReader();
      fileReader.onload = (event) => {
        let data = fileReader.result;
        // Not sure we can trust the return type of
        // FileReader.readAsArrayBuffer See e.g.
        // https://github.com/node-file-api/FileReader/issues/2
        if (data instanceof ArrayBuffer) {
          data = new Uint8Array(data);
        }
        if (!(data instanceof Uint8Array)) {
          return reject(new TypeError('FileReader returned unknown type.'));
        }
        resolve(data);
      };
      fileReader.onabort = (event) => {
        return reject(new Error('Aborted'));
      };
      fileReader.onerror = (event) => {
        return reject(new Error(event.type));
      };
      // TODO(soergel): better handle onabort, onerror
      // Note if end > this.file.size, we just get a small last chunk.
      const slice = this.file.slice(start, end);
      // We can't use readAsText here (even if we know the file is text)
      // because the slice boundary may fall within a multi-byte character.
      fileReader.readAsArrayBuffer(slice);
    });
    const x = await chunk;
    return {value: x, done: false, state: {offset: end}};
  }

  // ByteChunkIterator
  decodeUTF8: () => StringChunkIterator;
}
applyMixins(FileChunkIterator, [ByteChunkIterator]);
