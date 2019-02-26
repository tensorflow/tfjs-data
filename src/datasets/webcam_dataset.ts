
import {Tensor3D} from '@tensorflow/tfjs-core';
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

import {Tensor} from '@tensorflow/tfjs-core';

import {Dataset} from '../dataset';
import {LazyIterator} from '../iterators/lazy_iterator';
import {WebcamIterator} from '../iterators/webcam_iterator';
import {WebcamConfig} from '../types';

export class WebcamDataset extends Dataset<Tensor3D> {
  size = Infinity;

  private webcamConfig: WebcamConfig;

  private iter: LazyIterator<Tensor3D>;

  constructor(
      protected readonly webcamVideoElement: HTMLVideoElement,
      webcamConfig?: WebcamConfig) {
    super();
    if (!webcamConfig) {
      this.webcamConfig = {};
    } else {
      this.webcamConfig = webcamConfig;
    }
  }

  async init() {
    this.iter =
        await WebcamIterator.create(this.webcamVideoElement, this.webcamConfig);
  }

  async iterator(): Promise<LazyIterator<Tensor3D>> {
    return await WebcamIterator.create(
        this.webcamVideoElement, this.webcamConfig);
  }

  async capture(): Promise<Tensor> {
    if (this.iter) {
      return (await this.iter.next()).value;
    } else {
      await this.init();
      return (await this.iter.next()).value;
    }
  }
}
