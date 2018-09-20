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
import fetch, {Headers as PolyfillHeaders, Request as PolyfillRequest} from 'node-fetch';
import {FileChunkIterator, FileChunkIteratorOptions} from './file_chunk_iterator';

/**
 * Provide a stream of chunks from a URL.
 *
 * Note this class first downloads the entire file into memory before providing
 * the first element from the stream.  This is because the Fetch API does not
 * yet reliably provide a reader stream for the response body.
 */
export async function urlChunkIterator(
    url: RequestInfo, fileOptions: FileChunkIteratorOptions = {}) {
  let newUrl: string|PolyfillRequest;
  if (typeof url !== 'string') {
    // Construct PolyfillRequest with headers.
    newUrl = new PolyfillRequest(url.toString());
    const headers = new PolyfillHeaders();
    (url as Request).headers.forEach((value: string, key: string) => {
      headers.set(key, value);
    });
    newUrl.headers = headers;
  } else {
    newUrl = url as string;
  }
  const response = await fetch(newUrl);
  if (response.ok) {
    const arrayBuffer = await response.buffer();
    return new FileChunkIterator(arrayBuffer, fileOptions);
  } else {
    throw new Error(response.statusText);
  }
}
