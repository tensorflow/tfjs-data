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
import {FileChunkIterator, FileChunkIteratorOptions} from './file_chunk_iterator';

/**
 * Provide a stream of chunks from a URL.
 *
 * Note this class first downloads the entire file into memory before providing
 * the first element from the stream.  This is because the Fetch API does not
 * yet reliably provide a reader stream for the response body.
 */
export async function urlChunkIterator(
    url: RequestInfo, options: FileChunkIteratorOptions = {}) {
  const response = (typeof url) === 'string' ?
      await util.fetch(url as string) :
      await util.fetch(
          (url as Request).url, getRequestInitFromRequest(url as Request));
  if (response.ok) {
    let blob;
    if (ENV.get('IS_BROWSER')) {
      blob = await response.blob();
    } else {
      // TODO(kangyizhang): the text has already been decoded in the response,
      // try to remove the work of byte_chunk_iterator
      blob = Buffer.from(await response.text());
    }
    return new FileChunkIterator(blob, options);
  } else {
    throw new Error(response.statusText);
  }
}

// Generate RequestInit from Request to match tf.util.fetch signature.
const getRequestInitFromRequest = (request: Request) => {
  const init = {
    method: request.method,
    headers: request.headers,
    body: request.body,
    mode: request.mode,
    credentials: request.credentials,
    cache: request.cache,
    redirect: request.redirect,
    referrer: request.referrer,
    integrity: request.integrity,
  };
  return init;
};
