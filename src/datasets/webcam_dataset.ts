
import {Tensor3D} from '@tensorflow/tfjs-core';

import {LazyIterator} from '../iterators/lazy_iterator';
import {Dataset} from '../dataset';
import {WebcamConfig} from '../types';
import {WebcamIterator} from '../iterators/webcam_iterator';

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

export class WebcamDataset extends Dataset<Tensor3D> {
  private webcamConfig:WebcamConfig;
  constructor(protected readonly webcamVideoElement: HTMLVideoElement, webcamConfig?: WebcamConfig) {
    super();
    if (!webcamConfig) {
      this.webcamConfig={};
    } else {
      this.webcamConfig=webcamConfig;
    }
  }

  async iterator():
      Promise<LazyIterator<Tensor3D>> {
    return WebcamIterator.create(this.webcamVideoElement, this.webcamConfig);
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
