
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

export abstract class SharedPromiseCache<T> {
  abstract name: string;
  abstract get(index: number): Promise<T>;
  abstract put(index: number, element: Promise<T>): void;
}

class MemoryCache<T> implements SharedPromiseCache<T> {
  private data: Array<Promise<T>> = [];
  constructor(readonly name: string, readonly maxElements: number) {}

  get(index: number): Promise<T> {
    if (index >= this.maxElements) {
      throw new Error(
          `Cache limited to ${this.maxElements} items; can't get ${index}`);
    }
    return this.data[index];
  }

  put(index: number, element: Promise<T>): void {
    if (index >= this.maxElements) {
      throw new Error(
          `Cache limited to ${this.maxElements} items; can't put ${index}`);
    }
    if (this.data[index] != null) {
      throw new Error(`Item ${index} was already cached.`);
    }
    this.data[index] = element;
  }
}

// TODO(soergel): LocalStorage cache, hybrid cache, etc.
// TODO(soergel): Set total size limits instead of # element limits.
// TODO(soergel): Consider using memory pressure via tf.memory() to trigger
// cache eviction

export interface SharedCacheConfig {
  name?: string;
  memoryMaxElements?: number;
  // memoryMaxUsage: number;
  // localStorageMaxElements: number;
  // localStorageMaxUsage: number;
}

let cacheNumber = 0;

export function createSharedPromiseCache<T>(config: SharedCacheConfig = {}):
    SharedPromiseCache<T> {
  const memoryMaxElements =
      config.memoryMaxElements ? config.memoryMaxElements : 100000;
  const name = config.name ? config.name : `Cache ${cacheNumber++}`;
  return new MemoryCache(name, memoryMaxElements);
}
