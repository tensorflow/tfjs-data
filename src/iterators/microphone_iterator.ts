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
  private columnTruncateLength: number;
  private freqDataQueue: Float32Array[];
  private freqData: Float32Array;
  private numFrames: number;
  // tslint:disable-next-line:no-any
  private frameIntervalTask: any;
  private analyser: AnalyserNode;
  private audioContext: AudioContext;
  // private startTimeOfLastSpectro: number;
  // private endTimeOfLastSpectro: number;

  private constructor(protected readonly microphoneConfig: MicrophoneConfig) {
    super();
    this.fftSize = microphoneConfig.fftSize || 1024;
    this.sampleRateHz = microphoneConfig.sampleRate || 44100;
    this.columnTruncateLength =
        microphoneConfig.columnTruncateLength || this.fftSize;
    this.numFrames = microphoneConfig.numFramesPerSpectrogram || 42;
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

    this.analyser.getFloatFrequencyData(this.freqData);

    return new Promise<void>(resolve => {
      // Add event listener to make sure the microphone has been fully
      // initialized.
      audioElement.onloadedmetadata = () => {
        console.log('onloadedmetadata');
        resolve();
      };
    });
  }

  async next(): Promise<IteratorResult<Tensor>> {
    if (this.isClosed) {
      return {value: null, done: true};
    }

    let resultTensor: Tensor;

    this.analyser.getFloatFrequencyData(this.freqData);
    if (this.freqData[0] === -Infinity) {
      return {value: null, done: false};
    }

    this.freqDataQueue.push(this.freqData.slice(0, this.columnTruncateLength));
    if (this.freqDataQueue.length > this.numFrames) {
      // Drop the oldest frame (least recent).
      this.freqDataQueue.shift();
    }
    const freqData = flattenQueue(this.freqDataQueue);
    resultTensor = getInputTensorFromFrequencyData(
        freqData, [1, this.numFrames, this.columnTruncateLength, 1]);
    return {value: resultTensor, done: false};
  }

  // Stop the video stream and pause webcam iterator.
  stop(): void {
    this.isClosed = true;
    clearInterval(this.frameIntervalTask);
    this.frameIntervalTask = null;
    this.analyser.disconnect();
    this.audioContext.close();
    if (this.stream != null && this.stream.getTracks().length > 0) {
      // const tracks = this.stream.getTracks();
      // tracks.forEach(track => track.stop());
      this.stream.getTracks()[0].stop();
    }
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
