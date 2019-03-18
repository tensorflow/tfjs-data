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

let stream: MediaStream;

describeWithFlags('WebcamIterator', WEBGL_ENVS, () => {
  beforeEach(async () => {
    if (!stream) {
      const canvasElement = Object.assign(
          document.createElement('canvas'), {width: 640, height: 480});
      // const canvasElement = document.createElement('canvas');
      // document.body.appendChild(canvasElement);
      const ctx = canvasElement.getContext('2d');
      // tslint:disable-next-line:no-any
      stream = (canvasElement as any).captureStream();

      let count = 0;
      setInterval(() => {
        ctx.fillStyle =
            `rgb(${count % 255}, ${count * count % 255}, ${count % 255})`;
        count += 1;
        ctx.fillRect(0, 0, 640, 480);
      }, 100);

      navigator.mediaDevices.getUserMedia = async () => {
        return stream;
      };
    }
  });

  it('creates webcamIterator', async () => {
    const videoElement = document.createElement('video');
    videoElement.width = 100;
    videoElement.height = 100;

    const webcamIterator = await WebcamIterator.create(videoElement);
    const result = await webcamIterator.capture();
    expect(result.shape).toEqual([100, 100, 3]);
  });

  it('creates webcamIterator with no html element', async () => {
    const webcamIterator =
        await WebcamIterator.create(null, {width: 300, height: 300});
    const result = await webcamIterator.capture();
    expect(result.shape).toEqual([300, 300, 3]);
  });
});
