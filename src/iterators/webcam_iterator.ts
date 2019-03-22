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

import {browser, ENV, image, Tensor, tensor1d, Tensor3D, TensorLike} from '@tensorflow/tfjs-core';
import {assert} from '@tensorflow/tfjs-core/dist/util';
import {WebcamConfig} from '../types';
import {LazyIterator} from './lazy_iterator';

/**
 * Provide a stream of image tensors from webcam video stream. Only works in
 * browser environment.
 */
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

  // Construct a WebcamIterator and start it's video stream.
  static async create(
      webcamVideoElement?: HTMLVideoElement, webcamConfig: WebcamConfig = {}) {
    if (ENV.get('IS_NODE')) {
      throw new Error(
          'tf.data.webcam is only supported in browser environment.');
    }

    if (!webcamVideoElement) {
      // If webcam video element is not provided, create a hidden video element
      // with provided width and height.
      webcamVideoElement = document.createElement('video');
      if (!webcamConfig.width || !webcamConfig.height) {
        throw new Error(
            'Please provide webcam video element, or width and height to ' +
            'create a hidden video element.');
      }
      webcamVideoElement.width = webcamConfig.width;
      webcamVideoElement.height = webcamConfig.height;
    }
    const webcamIterator = new WebcamIterator(webcamVideoElement, webcamConfig);
    // Call async function to initialize the video stream.
    await webcamIterator.start();
    return webcamIterator;
  }

  // Async function to start video stream.
  async start(): Promise<void> {
    if (this.webcamConfig.facingMode) {
      assert(
          (this.webcamConfig.facingMode === 'user') ||
              (this.webcamConfig.facingMode === 'environment'),
          () =>
              `Invalid wecam facing model: ${this.webcamConfig.facingMode}. ` +
              `Please provide 'user' or 'environment'`);
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
    // Start to the webcam video stream
    this.webcamVideoElement.play();

    this.isClosed = false;

    return new Promise<void>(resolve => {
      // Add event listener to make sure the webcam has been fully initialized.
      this.webcamVideoElement.oncanplaythrough = () => {
        resolve();
      };
    });
  }

  async next(): Promise<IteratorResult<Tensor3D>> {
    if (this.isClosed) {
      return {value: null, done: true};
    }

    const img = browser.fromPixels(this.webcamVideoElement);
    if (this.webcamConfig.cropAndResizeConfig) {
      try {
        // Expand image dimension because tf.image.cropAndResize is expecting
        // a batch. So does cropBox and boxInt.
        const croppedImg = image.cropAndResize(
            img.toFloat().expandDims(0),
            this.webcamConfig.cropAndResizeConfig.cropBox instanceof Tensor ?
                this.webcamConfig.cropAndResizeConfig.cropBox.expandDims(0) :
                [this.webcamConfig.cropAndResizeConfig.cropBox] as TensorLike,
            tensor1d([0], 'int32'),
            this.webcamConfig.cropAndResizeConfig.cropSize,
            this.webcamConfig.cropAndResizeConfig.cropMethod,
            this.webcamConfig.cropAndResizeConfig.extrapolationValue);
        const shape = croppedImg.shape;
        // Extract image from batch cropping.
        return {
          value: croppedImg.reshape(shape.slice(1) as [number, number, number]),
          done: false
        };
      } catch (e) {
        throw new Error(`Error thrown cropping the video: ${e.message}`);
      }
    } else {
      return {value: img, done: false};
    }
  }

  async capture(): Promise<Tensor3D> {
    return (await this.next()).value;
  }

  // Stop the video stream and pause webcam iterator.
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

  // Override toArray() function to prevent collecting.
  toArray(): Promise<Tensor3D[]> {
    throw new Error('Can not convert infinite video stream to array.');
  }
}
