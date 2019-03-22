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

import {tensor1d, test_util} from '@tensorflow/tfjs-core';
import {describeWithFlags} from '@tensorflow/tfjs-core/dist/jasmine_util';
import {WebcamIterator} from './webcam_iterator';

let stream: MediaStream;

const setupFakeMediaStream = () => {
  const width = 500;
  const height = 500;
  const canvasElement = document.createElement('canvas');
  const ctx = canvasElement.getContext('2d');
  ctx.fillStyle = 'rgb(1, 2, 3)';
  ctx.fillRect(0, 0, width, height);
  // tslint:disable-next-line:no-any
  stream = (canvasElement as any).captureStream(60);
  navigator.mediaDevices.getUserMedia = async () => {
    return stream;
  };
};

describeWithFlags('WebcamIterator', test_util.BROWSER_ENVS, () => {
  beforeEach(() => {
    setupFakeMediaStream();
  });

  it('creates webcamIterator with html element', async () => {
    const videoElement = document.createElement('video');
    videoElement.width = 100;
    videoElement.height = 200;

    const webcamIterator = await WebcamIterator.create(videoElement);
    const result = await webcamIterator.next();
    expect(result.done).toBeFalsy();
    expect(result.value.shape).toEqual([200, 100, 3]);
  });

  it('creates webcamIterator with html element and capture', async () => {
    const videoElement = document.createElement('video');
    videoElement.width = 100;
    videoElement.height = 200;

    const webcamIterator = await WebcamIterator.create(videoElement);
    const result = await webcamIterator.capture();
    expect(result.shape).toEqual([200, 100, 3]);
  });

  it('creates webcamIterator with no html element', async () => {
    const webcamIterator =
        await WebcamIterator.create(null, {width: 100, height: 200});
    const result = await webcamIterator.next();
    expect(result.done).toBeFalsy();
    expect(result.value.shape).toEqual([200, 100, 3]);
  });

  it('creates webcamIterator with no html element and capture', async () => {
    const webcamIterator =
        await WebcamIterator.create(null, {width: 100, height: 200});
    const result = await webcamIterator.capture();
    expect(result.shape).toEqual([200, 100, 3]);
  });

  it('resize with html element', async () => {
    const videoElement = document.createElement('video');
    videoElement.width = 300;
    videoElement.height = 300;

    const webcamIterator = await WebcamIterator.create(videoElement, {
      cropAndResizeConfig: {
        cropSize: [100, 200],
        cropBox: tensor1d([0, 0, 0.5, 1]),
      }
    });
    const result = await webcamIterator.next();
    expect(result.done).toBeFalsy();
    expect(result.value.shape).toEqual([100, 200, 3]);
  });

  it('resize with no html element', async () => {
    const webcamIterator =
        await WebcamIterator.create(null, {width: 100, height: 200});
    const result = await webcamIterator.next();
    expect(result.done).toBeFalsy();
    expect(result.value.shape).toEqual([200, 100, 3]);
  });

  it('webcamIterator could stop', async () => {
    const videoElement = document.createElement('video');
    videoElement.width = 100;
    videoElement.height = 100;

    const webcamIterator = await WebcamIterator.create(videoElement);
    const result1 = await webcamIterator.next();
    expect(result1.done).toBeFalsy();
    expect(result1.value.shape).toEqual([100, 100, 3]);

    await webcamIterator.stop();
    const result2 = await webcamIterator.next();
    expect(result2.done).toBeTruthy();
    expect(result2.value).toBeNull();
  });

  it('webcamIterator could restart', async () => {
    const videoElement = document.createElement('video');
    videoElement.width = 100;
    videoElement.height = 100;

    const webcamIterator = await WebcamIterator.create(videoElement);
    const result1 = await webcamIterator.next();
    expect(result1.done).toBeFalsy();
    expect(result1.value.shape).toEqual([100, 100, 3]);

    await webcamIterator.stop();
    const result2 = await webcamIterator.next();
    expect(result2.done).toBeTruthy();
    expect(result2.value).toBeNull();

    // Reset fake media stream after stopped the stream.
    setupFakeMediaStream();

    await webcamIterator.start();
    const result3 = await webcamIterator.next();
    expect(result3.done).toBeFalsy();
    expect(result3.value.shape).toEqual([100, 100, 3]);
  });
});
