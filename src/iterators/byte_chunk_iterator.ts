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

import {ENV} from '@tensorflow/tfjs-core';
import * as utf from 'utf8';
import {LazyIterator, OneToManyIterator} from './lazy_iterator';
import {StringIterator} from './string_iterator';

// tslint:disable-next-line:no-any
let decoder:any;
if (ENV.get('IS_BROWSER')) {
  decoder = new TextDecoder('utf-8');
} else {
  // tslint:disable-next-line:no-require-imports
  const { StringDecoder } = require('string_decoder');
  decoder = new StringDecoder('utf8');
}

export abstract class ByteChunkIterator extends LazyIterator<Uint8Array> {
  /**
   * Decode a stream of UTF8-encoded byte arrays to a stream of strings.
   *
   * The byte arrays producetd from the ByteChunkIterator on which this is
   * called will be interpreted as concatenated.  No assumptions are made about
   * the boundaries of the incoming chunks, so a multi-byte UTF8 encoding of a
   * character may span the boundary between chunks.  This naturally happens,
   * for instance, when reading fixed-size byte arrays from a file.
   */
  decodeUTF8(): StringIterator {
    return new Utf8Iterator(this);
  }
}

// ============================================================================
// The following private classes serve to implement the chainable methods
// on ByteChunkIterator.  Unfortunately they can't be placed in separate files,
// due to resulting trouble with circular imports.
// ============================================================================

// We wanted multiple inheritance, e.g.
//   class Utf8Iterator extends QueueIterator<string>, StringIterator
// but the TypeScript mixin approach is a bit hacky, so we take this adapter
// approach instead.

class Utf8Iterator extends StringIterator {
  private impl: Utf8IteratorImpl;

  constructor(protected upstream: LazyIterator<Uint8Array>) {
    super();
    this.impl = new Utf8IteratorImpl(upstream);
  }

  summary() {
    return this.impl.summary();
  }

  async next() {
    return this.impl.next();
  }
}

/**
 * Decode a stream of UTF8-encoded byte arrays to a stream of strings.
 *
 * This is tricky because the incoming byte array boundaries may disrupt a
 * multi-byte UTF8 character. Thus any incomplete character data at the end of
 * a chunk must be carried over and prepended to the next chunk before
 * decoding.
 *
 * In the context of an input pipeline for machine learning, UTF8 decoding is
 * needed to parse text files containing training examples or prediction
 * requests (e.g., formatted as CSV or JSON).  We cannot use the built-in
 * decoding provided by FileReader.readAsText() because here we are in a
 * streaming context, which FileReader does not support.
 *
 * @param upstream A `LazyIterator` of `Uint8Arrays` containing UTF8-encoded
 *   text, which should be interpreted as concatenated.  No assumptions are
 *   made about the boundaries of the incoming chunks, so a multi-byte UTF8
 *   encoding of a character may span the boundary between chunks.  This
 *   naturally happens, for instance, when reading fixed-size byte arrays from a
 *   file.
 */
class Utf8IteratorImpl extends OneToManyIterator<string> {
  // An array of the full required width of the split character, if any.
  // partial: Uint8Array = new Uint8Array([]);
  // The number of bytes of that array that are populated so far.
  partialBytesValid = 0;

  constructor(protected readonly upstream: LazyIterator<Uint8Array>) {
    super();
  }
  summary() {
    return `${this.upstream.summary()} -> Utf8`;
  }

  async pump(): Promise<boolean> {
    const chunkResult = await this.upstream.next();
    let chunk;
    if (chunkResult.done) {
        return false;
    } else {
      chunk = chunkResult.value;
    }

    let bulk: string;
    if (ENV.get('IS_BROWSER')) {
      bulk = decoder.decode(
      chunk, {stream:true});
    } else {
      console.log(chunk);
      const b = Buffer.from(chunk.buffer);
      console.log(b);
      bulk = decoder
        .end(b);
      console.log(bulk);
      console.log(utf.decode(String.fromCharCode.apply(null, chunk)));
    }
      this.outputQueue.push(bulk);
    return true;
  }
}
