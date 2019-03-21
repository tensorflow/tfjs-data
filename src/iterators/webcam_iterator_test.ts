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

import {/*browser, */ tensor1d, test_util} from '@tensorflow/tfjs-core';
import {describeWithFlags} from '@tensorflow/tfjs-core/dist/jasmine_util';
import {WebcamIterator} from './webcam_iterator';

// let stream: MediaStream;

describeWithFlags('WebcamIterator', test_util.BROWSER_ENVS, () => {
  // beforeEach(async () => {
  //   const width = 500;
  //   const height = 500;
  //   if (!stream) {
  //     // const imageElement = document.createElement('img');
  //     // imageElement.id = 'img';
  //     // imageElement.src = 'image.jpeg';
  //     // const canvasElement =
  //     //     Object.assign(document.createElement('canvas'), {width,
  //     height}); const canvasElement = document.createElement('canvas');
  //     canvasElement.id = 'canvas';
  //     document.body.appendChild(canvasElement);

  //     // const element = document.getElementById('canvas') as
  //     HTMLCanvasElement; const ctx = canvasElement.getContext('2d');
  //     // ctx.drawImage(imageElement, 0, 0, width, height);

  //     // setInterval(() => {
  //     // ctx.beginPath();
  //     // ctx.strokeStyle = 'green';
  //     ctx.fillStyle = 'rgb(120, 140, 160)';
  //     // count += 1;
  //     ctx.fillRect(0, 0, width, height);
  //     // ctx.strokeRect(0, 0, width, height);
  //     // ctx.stroke();
  //     // }, 100);

  //     // tslint:disable-next-line:no-any
  //     stream = (canvasElement as any).captureStream(60);
  //   }
  //   navigator.mediaDevices.getUserMedia = async () => {
  //     return stream;
  //   };
  // });

  it('creates webcamIterator with html element', async () => {
    // const videoElement = document.createElement('video');
    // videoElement.width = 5;
    // videoElement.height = 5;

    // videoElement.srcObject = stream;
    // videoElement.play();

    // // await new Promise(resolve => {
    // //   setTimeout(() => {
    // //     resolve();
    // //   }, 1000);
    // // });

    // // tslint:disable-next-line:no-any
    // const t = browser.fromPixels(videoElement);
    // t.print();
    const width = 500;
    const height = 500;
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
    const stream = (canvasElement as any).captureStream(60);
    console.log(11111, (stream as MediaStream).active);
    navigator.mediaDevices.getUserMedia = async () => {
      return stream;
    };

    const videoElement = document.createElement('video');
    videoElement.width = 100;
    videoElement.height = 100;

    const webcamIterator = await WebcamIterator.create(videoElement);
    const result = await webcamIterator.next();
    // expect(result.value.shape).toEqual([100, 100, 3]);
    result.value.print();
  });

  it('creates webcamIterator with html element and capture', async () => {
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
    const result = await webcamIterator.next();
    expect(result.value.shape).toEqual([300, 300, 3]);
  });

  it('creates webcamIterator with no html element and capture', async () => {
    const webcamIterator =
        await WebcamIterator.create(null, {width: 300, height: 300});
    const result = await webcamIterator.capture();
    expect(result.shape).toEqual([300, 300, 3]);
  });

  it('resize with html element', async () => {
    const videoElement = document.createElement('video');
    videoElement.width = 300;
    videoElement.height = 300;

    const webcamIterator = await WebcamIterator.create(videoElement, {
      width: 100,
      height: 200,
      centerCropSize: [100, 200],
      cropBox: tensor1d([50, 50, 150, 250]),
      cropBoxInd: tensor1d([0], 'int32'),
    });
    const result = await webcamIterator.next();
    expect(result.value.shape).toEqual([100, 200, 3]);
  });

  it('resize with no html element', async () => {
    const webcamIterator = await WebcamIterator.create(null, {
      width: 100,
      height: 200,
      centerCropSize: [100, 200],
      cropBox: tensor1d([50, 50, 150, 250]),
      cropBoxInd: tensor1d([0], 'int32'),
    });
    const result = await webcamIterator.capture();
    expect(result.shape).toEqual([100, 200, 3]);
  });
});
