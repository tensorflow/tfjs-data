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

import {browser, ENV, image, tensor1d, Tensor1D, tensor2d, Tensor2D, Tensor3D, Tensor4D} from '@tensorflow/tfjs-core';
import {assert} from '@tensorflow/tfjs-core/dist/util';
import {MicrophoneConfig} from '../types';
import {LazyIterator} from './lazy_iterator';

/**
 * Provide a stream of audio tensors from microphone audio stream. Only works in
 * browser environment.
 */
export class MicrophoneIterator extends LazyIterator<Tensor3D> {
  private isClosed = true;
  private stream: MediaStream;

  private constructor(protected readonly microphoneConfig: MicrophoneConfig) {
    super();
  }

  summary() {
    return `microphone`;
  }

  // Construct a MicrophoneIterator and start it's audio stream.
  static async create(microphoneConfig: MicrophoneConfig) {
    if (ENV.get('IS_NODE')) {
      throw new Error(
          'tf.data.microphone is only supported in browser environment.');
    }

    const microphoneIterator = new MicrophoneIterator(microphoneConfig);

    // Call async function to initialize the video stream.
    await microphoneIterator.start();

    return microphoneIterator;
  }

  // Async function to start video stream.
  async start(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: this.microphoneConfig.audioTrackConstraints == null ?
            true :
            this.microphoneConfig.audioTrackConstraints,
        video: false
      });
    } catch (e) {
      // Modify the error message but leave the stack trace intact
      e.message = `Error thrown while initializing audio stream: ${e.message}`;
      throw e;
    }

    if (!this.stream) {
      throw new Error('Could not obtain audio from microphone.');
    }

    // tslint:disable-next-line:no-any
    const audioContext =
        new (window as any).AudioContext || (window as any).webkitAudioContext;
    // if (this.audioContext.sampleRate !== this.sampleRateHz) {
    //   console.warn(
    //       `Mismatch in sampling rate: ` +
    //       `Expected: ${this.sampleRateHz}; ` +
    //       `Actual: ${this.audioContext.sampleRate}`);
    // }
    const streamSource = audioContext.createMediaStreamSource(this.stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = this.fftSize * 2;
    analyser.smoothingTimeConstant = 0.0;
    streamSource.connect(analyser);
    // Reset the queue.
    this.freqDataQueue = [];
    this.freqData = new Float32Array(this.fftSize);
    if (this.includeRawAudio) {
      this.timeDataQueue = [];
      this.timeData = new Float32Array(this.fftSize);
    }
    const period =
        Math.max(1, Math.round(this.numFrames * (1 - this.overlapFactor)));
    this.tracker = new Tracker(
        period,
        Math.round(this.suppressionTimeMillis / this.frameDurationMillis));
    this.frameIntervalTask = setInterval(
        this.onAudioFrame.bind(this), this.fftSize / this.sampleRateHz * 1e3);

    // Older browsers may not have srcObject
    try {
      this.webcamVideoElement.srcObject = this.stream;
    } catch (error) {
      console.log(error);
      this.webcamVideoElement.src = window.URL.createObjectURL(this.stream);
    }
    // Start the webcam video stream
    this.webcamVideoElement.play();

    this.isClosed = false;

    return new Promise<void>(resolve => {
      // Add event listener to make sure the webcam has been fully initialized.
      this.webcamVideoElement.onloadedmetadata = () => {
        resolve();
      };
    });
  }


  getAudioContextConstructor(): AudioContext {}

  async next(): Promise<IteratorResult<Tensor3D>> {
    if (this.isClosed) {
      return {value: null, done: true};
    }

    let img;
    try {
      img = browser.fromPixels(this.webcamVideoElement);
    } catch (e) {
      throw new Error(
          `Error thrown converting video to pixels: ${JSON.stringify(e)}`);
    }
    if (this.resize) {
      try {
        return {value: this.cropAndResizeFrame(img), done: false};
      } catch (e) {
        throw new Error(`Error thrown cropping the video: ${e.message}`);
      }
    } else {
      return {value: img, done: false};
    }
  }

  private needToResize() {
    // If resizeWidth and resizeHeight are provided, and different from the
    // width and height of original HTMLVideoElement, then resizing and cropping
    // is required.
    if (this.webcamConfig.resizeWidth && this.webcamConfig.resizeHeight &&
        (this.webcamVideoElement.width !== this.webcamConfig.resizeWidth ||
         this.webcamVideoElement.height !== this.webcamConfig.resizeHeight)) {
      return true;
    }
    return false;
  }

  // Cropping and resizing each frame based on config
  cropAndResizeFrame(img: Tensor3D): Tensor3D {
    const expandedImage: Tensor4D = img.toFloat().expandDims(0);
    let resizedImage;
    resizedImage = image.cropAndResize(
        expandedImage, this.cropBox, this.cropBoxInd, this.cropSize,
        'bilinear');
    // Extract image from batch cropping.
    const shape = resizedImage.shape;
    return resizedImage.reshape(shape.slice(1) as [number, number, number]);
  }

  // Capture one frame from the video stream, and extract the value from
  // iterator.next() result.
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
