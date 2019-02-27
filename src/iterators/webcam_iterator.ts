import {browser, Tensor3D} from '@tensorflow/tfjs-core';
import {assert} from '@tensorflow/tfjs-core/dist/util';
import {WebcamConfig} from '../types';
import {LazyIterator} from './lazy_iterator';
import {RateLimitingIterator} from './rate_limiting_iterator';


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

export class WebcamIterator extends LazyIterator<Tensor3D> {
  private constructor(protected readonly webcamVideoElement: HTMLVideoElement) {
    super();
  }

  summary() {
    return `Endless data stream from webcam`;
  }

  static async create(
      webcamVideoElement: HTMLVideoElement,
      webcamConfig: WebcamConfig = {}): Promise<LazyIterator<Tensor3D>> {
    const stream = new WebcamIterator(webcamVideoElement);
    await stream.setupCameraInput(webcamConfig);
    return new RateLimitingIterator(
        stream, webcamConfig.frameRate ? webcamConfig.frameRate : 30);
  }

  private async setupCameraInput(webcamConfig: WebcamConfig): Promise<void> {
    if (webcamConfig.facingMode) {
      assert(
          (webcamConfig.facingMode === 'user') ||
              (webcamConfig.facingMode === 'environment'),
          'Invalid wecam facing model: ' + webcamConfig.facingMode);
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: webcamConfig.deviceId,
          facingMode: webcamConfig.facingMode ? webcamConfig.facingMode :
                                                'user',
          width: this.webcamVideoElement.width,
          height: this.webcamVideoElement.height
        }
      });
    } catch (e) {
      // Modify the error message but leave the stack trace intact
      e.message = `Error thrown while initialing video stream: ${e.message}`;
      throw e;
    }

    if (!stream) {
      throw new Error('Could not obtain video from webcam.');
    }

    // Older browsers may not have srcObject
    try {
      this.webcamVideoElement.srcObject = stream;
    } catch (error) {
      console.log(error);
      this.webcamVideoElement.src = window.URL.createObjectURL(stream);
    }

    return await new Promise<void>(resolve => {
      this.webcamVideoElement.addEventListener('loadeddata', () => {
        resolve();
      });
    });
  }

  async next(): Promise<IteratorResult<Tensor3D>> {
    return {value: browser.fromPixels(this.webcamVideoElement), done: false};
  }
}
