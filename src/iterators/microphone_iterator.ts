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

import {ENV, Tensor, tensor, Tensor3D, util} from '@tensorflow/tfjs-core';
import {MicrophoneConfig} from '../types';
import {LazyIterator} from './lazy_iterator';

/**
 * Provide a stream of audio tensors from microphone audio stream. Only works in
 * browser environment.
 */
export class MicrophoneIterator extends LazyIterator<Tensor> {
  private isClosed = false;
  private stream: MediaStream;
  private fftSize: number;
  private sampleRateHz: number;
  private frameDurationMillis: number;
  private columnTruncateLength: number;
  private overlapFactor: number;
  private freqDataQueue: Float32Array[];
  private freqData: Float32Array;
  private numFrames: number;
  private tracker: Tracker;
  private suppressionTimeMillis: number;
  // tslint:disable-next-line:no-any
  private frameIntervalTask: any;
  private analyser: AnalyserNode;
  private spectrogramCallback: SpectrogramCallback;
  private audioContext: AudioContext;
  // private startTimeOfLastSpectro: number;
  // private endTimeOfLastSpectro: number;

  private constructor(protected readonly microphoneConfig: MicrophoneConfig) {
    super();
    this.fftSize = microphoneConfig.fftSize || 1024;
    this.sampleRateHz = microphoneConfig.sampleRate || 44100;
    this.frameDurationMillis = this.fftSize / this.sampleRateHz * 1e3;
    this.columnTruncateLength =
        microphoneConfig.columnTruncateLength || this.fftSize;
    this.overlapFactor = microphoneConfig.overlapFactor || 0.5;
    this.numFrames = microphoneConfig.numFramesPerSpectrogram || 42;
    this.suppressionTimeMillis = microphoneConfig.suppressionTimeMillis;
    this.spectrogramCallback = microphoneConfig.spectrogramCallback;
  }

  summary() {
    return `microphone`;
  }

  // Construct a MicrophoneIterator and start it's audio stream.
  static async create(microphoneConfig: MicrophoneConfig = {}) {
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
      this.stream = await navigator.mediaDevices.getUserMedia(
          {audio: true /*this.microphoneConfig*/, video: false});
    } catch (e) {
      throw new Error(
          `Error thrown while initializing video stream: ${e.message}`);
    }

    if (!this.stream) {
      throw new Error('Could not obtain audio from microphone.');
    }

    // tslint:disable-next-line:no-any
    this.audioContext = new (window as any).AudioContext() ||
        // tslint:disable-next-line:no-any
        (window as any).webkitAudioContext;
    if (this.audioContext.sampleRate !== this.sampleRateHz) {
      console.warn(
          `Mismatch in sampling rate: ` +
          `Expected: ${this.sampleRateHz}; ` +
          `Actual: ${this.audioContext.sampleRate}`);
    }

    const audioElement = document.createElement('audio');
    try {
      audioElement.srcObject = this.stream;
    } catch (error) {
      console.log(error);
      audioElement.src = window.URL.createObjectURL(this.stream);
    }
    audioElement.play();

    const streamSource = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = this.fftSize * 2;
    this.analyser.smoothingTimeConstant = 0.0;
    streamSource.connect(this.analyser);
    // Reset the queue.
    this.freqDataQueue = [];
    this.freqData = new Float32Array(this.fftSize);

    const period =
        Math.max(1, Math.round(this.numFrames * (1 - this.overlapFactor)));
    this.tracker = new Tracker(
        period,
        Math.round(this.suppressionTimeMillis / this.frameDurationMillis));
    if (this.spectrogramCallback) {
      this.frameIntervalTask = setInterval(
          this.onAudioFrame.bind(this), this.fftSize / this.sampleRateHz * 1e3);
    }

    // this.analyser.getFloatFrequencyData(this.freqData);

    return new Promise<void>(resolve => {
      // Add event listener to make sure the microphone has been fully
      // initialized.
      audioElement.onloadedmetadata = () => {
        resolve();
      };
    });
  }

  private async onAudioFrame() {
    this.analyser.getFloatFrequencyData(this.freqData);
    if (this.freqData[0] === -Infinity) {
      return;
    }

    this.freqDataQueue.push(this.freqData.slice(0, this.columnTruncateLength));
    if (this.freqDataQueue.length > this.numFrames) {
      // Drop the oldest frame (least recent).
      this.freqDataQueue.shift();
    }
    const shouldFire = this.tracker.tick();
    if (shouldFire) {
      const freqData = flattenQueue(this.freqDataQueue);
      const inputTensor = getInputTensorFromFrequencyData(
          freqData, [1, this.numFrames, this.columnTruncateLength, 1]);
      const shouldRest = await this.spectrogramCallback(inputTensor);
      if (shouldRest) {
        this.tracker.suppress();
      }
      inputTensor.dispose();
    }
  }

  async next(): Promise<IteratorResult<Tensor>> {
    if (this.isClosed) {
      return {value: null, done: true};
    }

    let resultTensor: Tensor;

    this.analyser.getFloatFrequencyData(this.freqData);
    if (this.freqData[0] === -Infinity) {
      console.log(1111);
      return {value: null, done: false};
    }

    this.freqDataQueue.push(this.freqData.slice(0, this.columnTruncateLength));
    if (this.freqDataQueue.length > this.numFrames) {
      // Drop the oldest frame (least recent).
      this.freqDataQueue.shift();
    }
    // const shouldFire = this.tracker.tick();
    this.tracker.tick();
    // if (shouldFire) {
    const freqData = flattenQueue(this.freqDataQueue);
    resultTensor = getInputTensorFromFrequencyData(
        freqData, [1, this.numFrames, this.columnTruncateLength, 1]);
    // const shouldRest = await this.spectrogramCallback(resultTensor);
    // if (shouldRest) {
    //   this.tracker.suppress();
    // }
    console.log(2222);
    return {value: resultTensor, done: false};
    // } else {
    //   console.log(3333);
    //   return {value: null, done: false};
    // }
  }

  // private needToResize() {
  // If resizeWidth and resizeHeight are provided, and different from the
  // width and height of original HTMLVideoElement, then resizing and cropping
  // is required.
  // if (this.webcamConfig.resizeWidth && this.webcamConfig.resizeHeight &&
  //     (this.webcamVideoElement.width !== this.webcamConfig.resizeWidth ||
  //      this.webcamVideoElement.height !==
  //      this.webcamConfig.resizeHeight)) {
  //   return true;
  // }
  // return false;
  // }

  // Cropping and resizing each frame based on config
  // cropAndResizeFrame(img: Tensor3D): Tensor3D {
  // const expandedImage: Tensor4D = img.toFloat().expandDims(0);
  // let resizedImage;
  // resizedImage = image.cropAndResize(
  //     expandedImage, this.cropBox, this.cropBoxInd, this.cropSize,
  //     'bilinear');
  // // Extract image from batch cropping.
  // const shape = resizedImage.shape;
  // return resizedImage.reshape(shape.slice(1) as [number, number, number]);
  // }

  // Capture one frame from the video stream, and extract the value from
  // iterator.next() result.
  // async capture(): Promise<Tensor3D> {
  //   return (await this.next()).value;
  // }

  // Stop the video stream and pause webcam iterator.
  stop(): void {
    this.isClosed = true;

    console.log('stop 1');
    clearInterval(this.frameIntervalTask);
    this.frameIntervalTask = null;
    this.analyser.disconnect();
    console.log('stop 2');
    this.audioContext.close();
    console.log('stop 3');
    if (this.stream != null && this.stream.getTracks().length > 0) {
      const tracks = this.stream.getTracks();
      tracks.forEach(track => track.stop());
    }
    console.log('stop 4');
  }

  // Override toArray() function to prevent collecting.
  toArray(): Promise<Tensor3D[]> {
    throw new Error('Can not convert infinite video stream to array.');
  }
}

export type SpectrogramCallback = (x: Tensor) => Promise<boolean>;

export function flattenQueue(queue: Float32Array[]): Float32Array {
  const frameSize = queue[0].length;
  const freqData = new Float32Array(queue.length * frameSize);
  queue.forEach((data, i) => freqData.set(data, i * frameSize));
  return freqData;
}

export function getInputTensorFromFrequencyData(
    freqData: Float32Array, shape: number[]): Tensor {
  const vals = new Float32Array(util.sizeFromShape(shape));
  // If the data is less than the output shape, the rest is padded with zeros.
  vals.set(freqData, vals.length - freqData.length);
  return tensor(vals, shape);
}

/**
 * A class that manages the firing of events based on periods
 * and suppression time.
 */
export class Tracker {
  readonly period: number;
  readonly suppressionTime: number;

  private counter: number;
  private suppressionOnset: number;

  /**
   * Constructor of Tracker.
   *
   * @param period The event-firing period, in number of frames.
   * @param suppressionPeriod The suppression period, in number of frames.
   */
  constructor(period: number, suppressionPeriod: number) {
    this.period = period;
    this.suppressionTime = suppressionPeriod == null ? 0 : suppressionPeriod;
    this.counter = 0;

    util.assert(
        this.period > 0,
        () => `Expected period to be positive, but got ${this.period}`);
  }

  /**
   * Mark a frame.
   *
   * @returns Whether the event should be fired at the current frame.
   */
  tick(): boolean {
    this.counter++;
    const shouldFire = (this.counter % this.period === 0) &&
        (this.suppressionOnset == null ||
         this.counter - this.suppressionOnset > this.suppressionTime);
    return shouldFire;
  }

  /**
   * Order the beginning of a supression period.
   */
  suppress() {
    this.suppressionOnset = this.counter;
  }
}
