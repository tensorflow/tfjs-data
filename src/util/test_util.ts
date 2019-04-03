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

// Provide fake video stream
export function setupFakeVideoStream() {
  console.log('setup fake 1');
  const width = 500;
  const height = 500;
  const canvasElement = document.createElement('canvas');
  const ctx = canvasElement.getContext('2d');
  console.log('setup fake 2');
  ctx.fillStyle = 'rgb(1,2,3)';
  ctx.fillRect(0, 0, width, height);
  console.log('setup fake 3');
  // tslint:disable-next-line:no-any
  const stream = (canvasElement as any).captureStream(60);
  console.log('setup fake 4');
  navigator.mediaDevices.getUserMedia = async () => {
    return stream;
  };
  console.log('setup fake 5');
}
