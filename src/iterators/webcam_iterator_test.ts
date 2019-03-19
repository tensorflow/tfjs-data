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

// let stream: MediaStream;
// let count = 2;

describeWithFlags('WebcamIterator', WEBGL_ENVS, () => {
  beforeAll(async () => {
    const width = 500;
    const height = 500;
    // if (!stream) {
    // const imageElement = document.createElement('img');
    // imageElement.id = 'img';
    // imageElement.src = 'image.jpeg';
    // const canvasElement =
    //     Object.assign(document.createElement('canvas'), {width, height});
    const canvasElement = document.createElement('canvas');
    canvasElement.id = 'canvas';
    document.body.appendChild(canvasElement);

    // const element = document.getElementById('canvas') as HTMLCanvasElement;
    const ctx = canvasElement.getContext('2d');
    // ctx.drawImage(imageElement, 0, 0, width, height);

    // setInterval(() => {
    // ctx.beginPath();
    // ctx.strokeStyle = 'green';
    ctx.fillStyle = 'rgb(120, 140, 160)';
    // count += 1;
    ctx.fillRect(0, 0, width, height);
    // ctx.strokeRect(0, 0, width, height);
    // ctx.stroke();
    // }, 100);

    // tslint:disable-next-line:no-any
    const stream = (canvasElement as any).captureStream();
    navigator.mediaDevices.getUserMedia = async () => {
      return stream;
    };
    // }
  });

  it('creates webcamIterator', async () => {
    const videoElement = document.createElement('video');
    videoElement.width = 100;
    videoElement.height = 100;

    const webcamIterator = await WebcamIterator.create(videoElement);
    const result = await webcamIterator.capture();
    expect(result.shape).toEqual([100, 100, 3]);
    result.print();
  });

  it('creates webcamIterator with no html element', async () => {
    const webcamIterator =
        await WebcamIterator.create(null, {width: 300, height: 300});
    const result = await webcamIterator.capture();
    expect(result.shape).toEqual([300, 300, 3]);

    // const element = document.getElementById('canvas') as HTMLCanvasElement;
  });
});
