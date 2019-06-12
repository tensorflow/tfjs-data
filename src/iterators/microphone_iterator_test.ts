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

import {tensor2d, tensor3d, test_util} from '@tensorflow/tfjs-core';
import * as tfd from '../index';
import {describeBrowserEnvs, setupFakeAudeoStream} from '../util/test_utils';

describeBrowserEnvs('MicrophoneIterator', () => {
  beforeEach(() => {
    setupFakeAudeoStream();
  });

  it('gets tensor with default shape with no config', async () => {
    const microphoneIterator = await tfd.microphone();
    const result = await microphoneIterator.next();
    expect(result.done).toBeFalsy();
    // tslint:disable-next-line:no-any
    expect((result.value as any).spectrogram.shape).toEqual([43, 1024, 1]);
  });

  it('throws error when sample rate is not available', async done => {
    try {
      await tfd.microphone({sampleRateHz: 48000});
      done.fail();
    } catch (e) {
      expect(e.message).toEqual(
          'Mismatch in sampling rate: Expected: 48000; Actual: 44100');
      done();
    }
  });

  it('gets sample rate', async () => {
    const microphoneIterator = await tfd.microphone({sampleRateHz: 44100});
    expect(microphoneIterator.getSampleRate()).toEqual(44100);
  });

  it('uses available sample rate on device when it is not provided',
     async () => {
       const microphoneIterator = await tfd.microphone();
       expect(microphoneIterator.getSampleRate()).toEqual(44100);
     });

  it('gets tensor in correct shape with fftSize', async () => {
    const microphoneIterator = await tfd.microphone({fftSize: 2048});
    const result = await microphoneIterator.next();
    expect(result.done).toBeFalsy();
    // tslint:disable-next-line:no-any
    expect((result.value as any).spectrogram.shape).toEqual([43, 2048, 1]);
  });

  it('throws error with invalid fftSize', async done => {
    try {
      await tfd.microphone({fftSize: 1000});
      done.fail();
    } catch (e) {
      expect(e.message).toEqual(
          'Invalid fftSize: it must be a power of 2 between 2 to 4 and ' +
          '2 to 14, but got 1000');
      done();
    }
  });

  it('gets tensor in correct shape with columnTruncateLength', async () => {
    const microphoneIterator =
        await tfd.microphone({columnTruncateLength: 232});
    const result = await microphoneIterator.next();
    expect(result.done).toBeFalsy();
    // tslint:disable-next-line:no-any
    expect((result.value as any).spectrogram.shape).toEqual([43, 232, 1]);
  });

  it('gets tensor in correct shape with numFramesPerSpectrogram', async () => {
    const microphoneIterator =
        await tfd.microphone({numFramesPerSpectrogram: 10});
    const result = await microphoneIterator.next();
    expect(result.done).toBeFalsy();
    // tslint:disable-next-line:no-any
    expect((result.value as any).spectrogram.shape).toEqual([10, 1024, 1]);
  });

  it('gets tensor in correct shape with full spectrogram config', async () => {
    const microphoneIterator = await tfd.microphone({
      sampleRateHz: 44100,
      fftSize: 1024,
      numFramesPerSpectrogram: 10,
      columnTruncateLength: 100
    });
    const result = await microphoneIterator.next();
    expect(result.done).toBeFalsy();
    // tslint:disable-next-line:no-any
    expect((result.value as any).spectrogram.shape).toEqual([10, 100, 1]);
  });

  it('provides both spectrogram and waveform', async () => {
    const microphoneIterator =
        await tfd.microphone({includeSpectrogram: true, includeWaveform: true});
    const result = await microphoneIterator.next();
    expect(result.done).toBeFalsy();
    // tslint:disable-next-line:no-any
    expect((result.value as any).spectrogram.shape).toEqual([43, 1024, 1]);
    // tslint:disable-next-line:no-any
    expect((result.value as any).waveform.shape).toEqual([44032, 1]);
  });

  it('stops and restarts microphone', async () => {
    const microphoneIterator = await tfd.microphone();
    const result1 = await microphoneIterator.next();
    expect(result1.done).toBeFalsy();
    // tslint:disable-next-line:no-any
    expect((result1.value as any).spectrogram.shape).toEqual([43, 1024, 1]);
    microphoneIterator.stop();
    const result2 = await microphoneIterator.next();
    expect(result2.done).toBeTruthy();
    expect(result2.value).toBeNull();
    microphoneIterator.start();
    expect(result1.done).toBeFalsy();
    // tslint:disable-next-line:no-any
    expect((result1.value as any).spectrogram.shape).toEqual([43, 1024, 1]);
  });

  it('gets spectrogram and waveform tensor with correct value', async () => {
    const microphoneIterator = await tfd.microphone({
      numFramesPerSpectrogram: 1,
      fftSize: 16,
      includeSpectrogram: true,
      includeWaveform: true
    });
    const result = await microphoneIterator.next();
    expect(result.done).toBeFalsy();
    // tslint:disable-next-line:no-any
    const value = result.value as any;
    expect(value.spectrogram.shape).toEqual([1, 16, 1]);
    value.spectrogram.print();
    test_util.expectArraysClose(
        await value.spectrogram.array(),
        await tensor3d([[
          [0], [1], [2], [3], [4], [5], [6], [7], [8], [9], [10], [11], [12],
          [13], [14], [15]
        ]]).array());
    expect(value.waveform.shape).toEqual([16, 1]);
    test_util.expectArraysClose(
        await value.waveform.array(),
        await tensor2d([
          [-16], [-17], [-18], [-19], [-20], [-21], [-22], [-23], [-24], [-25],
          [-26], [-27], [-28], [-29], [-30], [-31]
        ]).array());
  });
});
