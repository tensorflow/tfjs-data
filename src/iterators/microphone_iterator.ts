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
  private columnTruncateLength: number;
  private freqData: Float32Array;
  private numFrames: number;
  private analyser: AnalyserNode;
  private audioContext: AudioContext;
  private sampleRateHz: number;

  private constructor(protected readonly microphoneConfig: MicrophoneConfig) {
    super();
    this.fftSize = microphoneConfig.fftSize || 1024;
    this.columnTruncateLength =
        microphoneConfig.columnTruncateLength || this.fftSize;
    this.numFrames = microphoneConfig.numFramesPerSpectrogram || 43;
    this.sampleRateHz = microphoneConfig.sampleRateHz || 44100;
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

    // Call async function to initialize the audio stream.
    await microphoneIterator.start();

    return microphoneIterator;
  }

  // Async function to start the audio stream and FFT.
  async start(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia(
          {audio: true, video: false});
    } catch (e) {
      throw new Error(
          `Error thrown while initializing video stream: ${e.message}`);
    }

    if (!this.stream) {
      throw new Error('Could not obtain audio from microphone.');
    }

    this.audioContext = new (window as any).AudioContext() ||
        // tslint:disable-next-line:no-any
        (window as any).webkitAudioContext;

    const streamSource = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = this.fftSize * 2;
    this.analyser.smoothingTimeConstant = 0.0;
    streamSource.connect(this.analyser);
    this.freqData = new Float32Array(this.fftSize);
    return;
  }

  async next(): Promise<IteratorResult<Tensor>> {
    if (this.isClosed) {
      return {value: null, done: true};
    }

    let resultTensor: Tensor;

    const freqDataQueue = await this.getSpectrogram();
    const freqData = flattenQueue(freqDataQueue);
    resultTensor = getInputTensorFromFrequencyData(
        freqData, [1, this.numFrames, this.columnTruncateLength, 1]);

    return {value: resultTensor, done: false};
  }

  private async getSpectrogram(): Promise<Float32Array[]> {
    const freqDataQueue: Float32Array[] = [];
    let currentFrames = 0;
    return new Promise(resolve => {
      const intervalID = setInterval(() => {
        this.analyser.getFloatFrequencyData(this.freqData);
        if (this.freqData[0] === -Infinity) {
          resolve();
        }
        freqDataQueue.push(this.freqData.slice(0, this.columnTruncateLength));

        if (++currentFrames === this.numFrames) {
          clearInterval(intervalID);
          resolve(freqDataQueue);
        }
      }, this.fftSize / this.sampleRateHz * 1e3);
    })
  }

  // Stop the audio stream and pause the MicroPhone iterator.
  stop(): void {
    this.isClosed = true;
    this.analyser.disconnect();
    this.audioContext.close();
    if (this.stream != null && this.stream.getTracks().length > 0) {
      this.stream.getTracks()[0].stop();
    }
  }

  // Override toArray() function to prevent collecting.
  toArray(): Promise<Tensor3D[]> {
    throw new Error('Can not convert infinite audio stream to array.');
  }
}

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
