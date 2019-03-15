/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
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

import {describeWithFlags} from '@tensorflow/tfjs-core/dist/jasmine_util';
import {WEBGL_ENVS} from '@tensorflow/tfjs-core/dist/test_util';
import {WebcamIterator} from './webcam_iterator';

// const trackFactories = {
//   // Share a single context between tests to avoid exceeding resource limits
//   // without requiring explicit destruction.
//   audioContext: null,

//   /**
//    * Given a set of requested media types, determine if the user agent is
//    * capable of procedurally generating a suitable media stream.
//    *
//    * @param {object} requested
//    * @param {boolean} [requested.audio] - flag indicating whether the desired
//    *                                      stream should include an audio
//    track
//    * @param {boolean} [requested.video] - flag indicating whether the desired
//    *                                      stream should include a video track
//    *
//    * @returns {boolean}
//    */
//   canCreate(requested: {audio: boolean, video: boolean}) {
//     const supported = {
//       audio: !!window.MediaStreamAudioDestinationNode,
//       video: !!HTMLCanvasElement.prototype.captureStream
//     };

//     return (!requested.audio || supported.audio) &&
//         (!requested.video || supported.video);
//   },

//   audio() {
//     const ctx = trackFactories.audioContext =
//         trackFactories.audioContext || new AudioContext();
//     const oscillator = ctx.createOscillator();
//     const dst = oscillator.connect(ctx.createMediaStreamDestination());
//     oscillator.start();
//     return dst.stream.getAudioTracks()[0];
//   },

//   video({width = 640, height = 480} = {}) {
//     const canvas =
//         Object.assign(document.createElement('canvas'), {width, height});
//     const ctx = canvas.getContext('2d');
//     const stream = canvas.captureStream();

//     let count = 0;
//     setInterval(() => {
//       ctx.fillStyle =
//           `rgb(${count % 255}, ${count * count % 255}, ${count % 255})`;
//       count += 1;

//       ctx.fillRect(0, 0, width, height);
//     }, 100);

//     if (document.body) {
//       document.body.appendChild(canvas);
//     } else {
//       document.addEventListener('DOMContentLoaded', () => {
//         document.body.appendChild(canvas);
//       });
//     }

//     return stream.getVideoTracks()[0];
//   }
// };

describeWithFlags('WebcamIterator', WEBGL_ENVS, () => {
  fit('creates webcamIterator', async () => {
    const videoElement = document.createElement('video');
    videoElement.width = 100;
    videoElement.height = 100;

    // navigator.mediaDevices.getUserMedia = async () => {
    //   // await new Promise(resolve => setTimeout(() => {
    //   //                     videoElement.dispatchEvent(
    //   //                         new Event('loadedmetadata'));
    //   //                     resolve();
    //   //                   }, 2000));
    //   // tslint:disable-next-line:no-any
    //   return (canvas as any).captureStream();
    //   // const stream = new MediaStream([new MediaStreamTrack()]);
    //   // // stream.addTrack(new MediaStreamTrack());
    //   // return stream;
    // };

    // await new Promise(resolve => setTimeout(resolve, 2000));
    const webcamIterator = await WebcamIterator.create(videoElement);
    const result = await webcamIterator.capture();
    expect(result.shape).toEqual([100, 100, 3]);
    // console.log(result);
  });

  fit('creates webcamIterator with no html element', async () => {
    // const image = document.createElement('img');
    // image.src = 'image.jpeg';
    // const canvas = document.createElement('canvas');
    // const ctx = canvas.getContext('2d');
    // ctx.drawImage(image, 0, 0);

    // navigator.mediaDevices.getUserMedia = async () => {
    //   // await new Promise(resolve => setTimeout(() => {
    //   //                     videoElement.dispatchEvent(
    //   //                         new Event('loadedmetadata'));
    //   //                     resolve();
    //   //                   }, 2000));
    //   // tslint:disable-next-line:no-any
    //   return (canvas as any).captureStream();
    //   // const stream = new MediaStream([new MediaStreamTrack()]);
    //   // // stream.addTrack(new MediaStreamTrack());
    //   // return stream;
    // };
    const webcamIterator =
        await WebcamIterator.create(null, {width: 300, height: 300});
    const result = await webcamIterator.capture();
    // console.log(result.shape);
    expect(result.shape).toEqual([300, 300, 3]);
  });
});
