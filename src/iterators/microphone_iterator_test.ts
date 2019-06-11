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

  it('gets tensor with correct shape with fftSize', async () => {
    const microphoneIterator = await tfd.microphone({fftSize: 2048});
    const result = await microphoneIterator.next();
    expect(result.done).toBeFalsy();
    // tslint:disable-next-line:no-any
    expect((result.value as any).spectrogram.shape).toEqual([43, 2048, 1]);
  });

  it('gets tensor with correct shape with columnTruncateLength', async () => {
    const microphoneIterator =
        await tfd.microphone({columnTruncateLength: 232});
    const result = await microphoneIterator.next();
    expect(result.done).toBeFalsy();
    // tslint:disable-next-line:no-any
    expect((result.value as any).spectrogram.shape).toEqual([43, 232, 1]);
  });

  it('gets tensor with correct shape with numFramesPerSpectrogram',
     async () => {
       const microphoneIterator =
           await tfd.microphone({numFramesPerSpectrogram: 10});
       const result = await microphoneIterator.next();
       expect(result.done).toBeFalsy();
       // tslint:disable-next-line:no-any
       expect((result.value as any).spectrogram.shape).toEqual([10, 1024, 1]);
     });

  it('gets tensor with correct shape with full spectrogram config',
     async () => {
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
    expect((result.value as any).waveform.shape).toEqual([44032, 1]);
  });
});
