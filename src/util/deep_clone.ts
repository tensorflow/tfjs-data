
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

// tslint:disable:no-any

import * as tf from '@tensorflow/tfjs-core';
import {deepMap, DeepMapResult} from './deep_map';

function cloneIfTensor(input: any): DeepMapResult {
  if (input instanceof tf.Tensor) {
    return {value: input.clone(), recurse: false};
  } else {
    return {value: input, recurse: true};
  }
}

export function deepClone(input: any) {
  return deepMap(input, cloneIfTensor);
}
