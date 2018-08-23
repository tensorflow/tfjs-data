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
 * =============================================================================
 */

import {CSVDataset, CsvHeaderConfig} from '../../../src/datasets/csv_dataset';
import {URLDataSource} from '../../../src/sources/url_data_source';

// Boston Housing data constants:
const BASE_URL =
    'https://storage.googleapis.com/tfjs-examples/multivariate-linear-regression/data/';

const TRAIN_FEATURES_FN = 'train-data.csv';
const TRAIN_TARGET_FN = 'train-target.csv';
const TEST_FEATURES_FN = 'test-data.csv';
const TEST_TARGET_FN = 'test-target.csv';

/**
 * Downloads and returns the csv.
 */
export const loadCsv = async(filename: string): Promise<{}> => {
  return new Promise(resolve => {
    const url = `${BASE_URL}${filename}`;

    console.log(`  * Downloading data from: ${url}`);

    const dataset = getCSVData(url);
    resolve(dataset);
  });
};


async function getCSVData(url: string) {
  const source = new URLDataSource(url);
  const dataset =
      await CSVDataset.create(source, CsvHeaderConfig.READ_FIRST_LINE);
  const result = await dataset.collectAll();
  return result.map((row: {[key: string]: number}) => {
    return Object.keys(row).sort().map(key => Number(row[key]));
  });
}

/** Helper class to handle loading training and test data. */
export class BostonHousingDataset {
  trainFeatures: number[][];
  trainTarget: number[][];
  testFeatures: number[][];
  testTarget: number[][];

  constructor() {
    // Arrays to hold the data.
    this.trainFeatures = null;
    this.trainTarget = null;
    this.testFeatures = null;
    this.testTarget = null;
  }

  get numFeatures() {
    // If numFetures is accessed before the data is loaded, raise an error.
    if (this.trainFeatures == null) {
      throw new Error('\'loadData()\' must be called before numFeatures');
    }
    return this.trainFeatures[0].length;
  }

  /** Loads training and test data. */
  async loadData() {
    [this.trainFeatures, this.trainTarget, this.testFeatures, this.testTarget] =
        await Promise.all([
          loadCsv(TRAIN_FEATURES_FN), loadCsv(TRAIN_TARGET_FN),
          loadCsv(TEST_FEATURES_FN), loadCsv(TEST_TARGET_FN)
        ]) as [number[][], number[][], number[][], number[][]];
    this.shuffle(this.trainFeatures, this.trainTarget);
    this.shuffle(this.testFeatures, this.testTarget);
  }

  /**
   * Shuffles data and target (maintaining alignment) using Fisher-Yates
   * algorithm.flab
   */
  shuffle(data: number[][], target: number[][]): void {
    let counter = data.length;
    let temp: number|number[];
    let index = 0;
    while (counter > 0) {
      index = (Math.random() * counter) | 0;
      counter--;
      // data:
      temp = data[counter];
      data[counter] = data[index];
      data[index] = temp;
      // target:
      temp = target[counter];
      target[counter] = target[index];
      target[index] = temp;
    }
  }
}
