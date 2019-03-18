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

import {browser, image, Tensor1D, tensor2d, Tensor3D} from '@tensorflow/tfjs-core';
import {assert} from '@tensorflow/tfjs-core/dist/util';
import {WebcamConfig} from '../types';
import {LazyIterator} from './lazy_iterator';

export class WebcamIterator extends LazyIterator<Tensor3D> {
  private isClosed = true;
  private stream: MediaStream;

  private constructor(
      protected readonly webcamVideoElement: HTMLVideoElement,
      protected readonly webcamConfig: WebcamConfig) {
    super();
  }

  summary() {
    return `Endless data stream from webcam`;
  }

  static async create(
      webcamVideoElement?: HTMLVideoElement, webcamConfig: WebcamConfig = {}) {
    if (!webcamVideoElement) {
      // If webcam video element is not provided, create a hidden video element.
      webcamVideoElement = document.createElement('video');
      if (!webcamConfig.width || !webcamConfig.height) {
        throw new Error(
            'Please provide webcam video element, or resize width and height.');
      }
      webcamVideoElement.width = webcamConfig.width;
      webcamVideoElement.height = webcamConfig.height;
    }
    const webcamIterator = new WebcamIterator(webcamVideoElement, webcamConfig);
    await webcamIterator.start();
    return webcamIterator;
  }

  async start(): Promise<void> {
    if (this.webcamConfig.facingMode) {
      assert(
          (this.webcamConfig.facingMode === 'user') ||
              (this.webcamConfig.facingMode === 'environment'),
          () => 'Invalid wecam facing model: ' + this.webcamConfig.facingMode);
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: this.webcamConfig.deviceId,
          facingMode: this.webcamConfig.facingMode ?
              this.webcamConfig.facingMode :
              'user',
          width: this.webcamVideoElement.width,
          height: this.webcamVideoElement.height
        }
      });
    } catch (e) {
      // Modify the error message but leave the stack trace intact
      throw new Error(
          `Error thrown while initializing video stream: ${e.message}`);
    }

    if (!this.stream) {
      throw new Error('Could not obtain video from webcam.');
    }

    // Older browsers may not have srcObject
    try {
      this.webcamVideoElement.srcObject = this.stream;
    } catch (error) {
      console.log(error);
      this.webcamVideoElement.src = window.URL.createObjectURL(this.stream);
    }
    // Start to play the webcam video
    this.webcamVideoElement.play();
    this.isClosed = false;

    return new Promise<void>(resolve => {
      this.webcamVideoElement.addEventListener('canplay', () => {
        resolve();
      });
    });
  }

  async next(): Promise<IteratorResult<Tensor3D>> {
    if (this.isClosed) {
      return {value: null, done: true};
    }
    const img = browser.fromPixels(this.webcamVideoElement);

    if (this.webcamConfig.centerCropSize && this.webcamConfig.cropBox) {
      (this.webcamConfig.cropBox as Tensor1D).expandDims(0).print();
      (this.webcamConfig.cropBoxInd as Tensor1D).print();
      console.log(this.webcamConfig.centerCropSize);
      const croppedImg = image.cropAndResize(
          img.toFloat().expandDims(0),
          // (this.webcamConfig.cropBox as Tensor1D).expandDims(0),
          tensor2d([1, 1, 0, 0], [1, 4]), this.webcamConfig.cropBoxInd,
          this.webcamConfig.centerCropSize, 'nearest', 0);
      croppedImg.print();
      const shape = croppedImg.shape;
      return {
        value: croppedImg.reshape(shape.slice(1) as [number, number, number]),
        done: false
      };
    } else {
      return {value: img, done: false};
    }
  }

  async capture(): Promise<Tensor3D> {
    return (await this.next()).value;
  }

  stop(): void {
    const tracks = this.stream.getTracks();

    tracks.forEach(track => track.stop());

    try {
      this.webcamVideoElement.srcObject = null;
    } catch (error) {
      console.log(error);
      this.webcamVideoElement.src = null;
    }
    this.isClosed = true;
  }

  toArray(): Promise<Tensor3D[]> {
    throw new Error('Can not convert infinite video stream to array.');
  }
}
