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
import * as utf8 from 'utf8';

import {applyMixins} from '../../util/mixins';
import {OrderedLazyIterator, SerialLazyIterator} from '../ordered_iterators/ordered_iterator';

import {StatefulOneToManyIterator, StatefulPumpResult} from './stateful_iterator';
import {StringChunkIterator} from './string_iterator';

// tslint:enable:max-line-length

export abstract class ByteChunkIterator extends SerialLazyIterator<Uint8Array> {
  /**
   * Decode a stream of UTF8-encoded byte arrays to a stream of strings.
   *
   * The byte arrays producetd from the ByteChunkIterator on which this is
   * called will be interpreted as concatenated.  No assumptions are made about
   * the boundaries of the incoming chunks, so a multi-byte UTF8 encoding of a
   * character may span the boundary between chunks.  This naturally happens,
   * for instance, when reading fixed-size byte arrays from a file.
   */
  decodeUTF8(): StringChunkIterator {
    return new Utf8Iterator(this);
  }
}

// ============================================================================
// The following private classes serve to implement the chainable methods
// on ByteChunkIterator.  Unfortunately they can't be placed in separate files,
// due to resulting trouble with circular imports.
// ============================================================================

interface Utf8IteratorState {
  // An array of the full required width of the split character, if any.
  readonly partial: Uint8Array;
  // The number of bytes of that array that are populated so far.
  readonly partialBytesValid: number;
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
class Utf8Iterator extends StatefulOneToManyIterator<string, Utf8IteratorState>
    implements StringChunkIterator {
  constructor(protected readonly upstream: OrderedLazyIterator<Uint8Array>) {
    super();
  }

  initialState() {
    return {partial: new Uint8Array([]), partialBytesValid: 0};
  }

  async statefulPump(state: Utf8IteratorState):
      Promise<StatefulPumpResult<Utf8IteratorState>> {
    const chunkResult = await this.upstream.next();
    let chunk;
    if (chunkResult.done) {
      if (state.partial.length === 0) {
        return {pumpDidWork: false, state};
      }
      // Pretend that the pump succeeded in order to emit the small last batch.
      // The next pump() call will actually fail.
      chunk = new Uint8Array([]);
    } else {
      chunk = chunkResult.value;
    }
    const partialBytesRemaining =
        state.partial.length - state.partialBytesValid;
    let nextIndex = partialBytesRemaining;
    let okUpToIndex = nextIndex;
    let splitUtfWidth = 0;

    while (nextIndex < chunk.length) {
      okUpToIndex = nextIndex;
      splitUtfWidth = utfWidth(chunk[nextIndex]);
      nextIndex = okUpToIndex + splitUtfWidth;
    }
    if (nextIndex === chunk.length) {
      okUpToIndex = nextIndex;
    }

    // decode most of the chunk without copying it first
    const bulk: string = utf8.decode(String.fromCharCode.apply(
        null, chunk.slice(partialBytesRemaining, okUpToIndex)));

    if (partialBytesRemaining > 0) {
      // Reassemble the split character
      state.partial.set(
          chunk.slice(0, partialBytesRemaining), state.partialBytesValid);
      // Too bad about the string concat.
      const reassembled: string =
          utf8.decode(String.fromCharCode.apply(null, state.partial));
      this.outputQueue.push(reassembled + bulk);
    } else {
      this.outputQueue.push(bulk);
    }

    let newState: Utf8IteratorState;
    if (okUpToIndex === chunk.length) {
      newState = this.initialState();
    } else {
      // prepare the next split character
      const partial = new Uint8Array(new ArrayBuffer(splitUtfWidth));
      partial.set(chunk.slice(okUpToIndex), 0);
      const partialBytesValid = chunk.length - okUpToIndex;
      newState = {partial, partialBytesValid};
    }

    return {pumpDidWork: true, state: newState};
  }

  // StringChunkIterator
  split: (separator: string) => StringChunkIterator;
}

applyMixins(Utf8Iterator, [StringChunkIterator]);

function utfWidth(firstByte: number): number {
  if (firstByte >= 252) {
    return 6;
  } else if (firstByte >= 248) {
    return 5;
  } else if (firstByte >= 240) {
    return 4;
  } else if (firstByte >= 224) {
    return 3;
  } else if (firstByte >= 192) {
    return 2;
  } else {
    return 1;
  }
}
