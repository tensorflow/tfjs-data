import {fromPixels, Tensor3D} from '@tensorflow/tfjs-core';

import {RateLimitingIterator} from './rate_limiting_iterator';
import {LazyIterator} from './lazy_iterator';
import {WebcamConfig} from '../types';

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

  summary(){
    return `Endless data stream from webcam`;
  }

  static async create(webcamVideoElement: HTMLVideoElement, webcamConfig:WebcamConfig={}):
      Promise<LazyIterator<Tensor3D>> {

    const stream = new WebcamIterator(webcamVideoElement);
    await stream.setupCameraInput(webcamConfig);
    return new RateLimitingIterator(stream, webcamConfig.frameRate?webcamConfig.frameRate:30);
  }

  private async setupCameraInput(webcamConfig:WebcamConfig): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({video: {
      facingMode: 'user', width:webcamConfig.width, height:webcamConfig.height}});

    // TODO(soergel): polyfills to get the stream
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
    return {value: fromPixels(this.webcamVideoElement), done: false};
  }
}


/**
 * Loads a the camera to be used in the demo
 *
 */
// async function setupCamera() {
//   if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
//     throw new Error(
//         'Browser API navigator.mediaDevices.getUserMedia not available');
//   }

//   const video = document.getElementById('video');
//   video.width = videoWidth;
//   video.height = videoHeight;

//   const mobile = isMobile();
//   const stream = await navigator.mediaDevices.getUserMedia({
//     'audio': false,
//     'video': {
//       facingMode: 'user',
//       width: mobile ? undefined : videoWidth,
//       height: mobile ? undefined : videoHeight,
//     },
//   });
//   video.srcObject = stream;

//   return new Promise((resolve) => {
//     video.onloadedmetadata = () => {
//       resolve(video);
//     };
//   });
// }

// async function loadVideo() {
//   const video = await setupCamera();
//   video.play();

//   return video;
// }

// export async function webcam() {
//   let video;
//   try {
//     video = await loadVideo();
//   } catch (e) {
//     let info = document.getElementById('info');
//     info.textContent = 'this browser does not support video capture,' +
//         'or this device does not have a camera';
//     info.style.display = 'block';
//     throw e;
//   }
// }
