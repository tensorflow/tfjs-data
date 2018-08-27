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

import {zip} from '../../src/dataset';
import {CSVDataset, CsvHeaderConfig} from '../../src/datasets/csv_dataset';
import {URLDataSource} from '../../src/sources/url_data_source';

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
async function loadCsv(filename: string) {
  const url = `${BASE_URL}${filename}`;

  console.log(`  * Downloading data from: ${url}`);

  const source = new URLDataSource(url);

  const dataset =
      await CSVDataset.create(source, CsvHeaderConfig.READ_FIRST_LINE);
  return dataset.map((row: {[key: string]: string}) => {
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

  async loadData() {
    const trainFeaturesDataset = await loadCsv(TRAIN_FEATURES_FN);
    const trainTargetDataset = await loadCsv(TRAIN_TARGET_FN);
    const testFeaturesDataset = await loadCsv(TEST_FEATURES_FN);
    const testTargetDataset = await loadCsv(TEST_TARGET_FN);

    // TODO(kangyizhang): Remove usage of iterator.collect() when
    // model.fitDataset(dataset) is available.
    const trainIter = await zip([trainFeaturesDataset, trainTargetDataset])
                          .shuffle(1000)
                          .iterator();
    const trainData = await trainIter.collect() as number[][][];
    const testIter = await zip([testFeaturesDataset, testTargetDataset])
                         .shuffle(1000)
                         .iterator();
    const testData = await testIter.collect() as number[][][];

    this.trainFeatures = await this.extractData(trainData, true);
    this.trainTarget = await this.extractData(trainData, false);
    this.testFeatures = await this.extractData(testData, true);
    this.testTarget = await this.extractData(testData, false);
  }

  /**
   * Extract feature or target data as number[][] from shuffled data.
   */
  async extractData(data: Array<Array<{}>>, isFeature: boolean) {
    return data.map((row: number[][]) => {
      if (isFeature) {
        return row[0];
      } else {
        return row[1];
      }
    });
  }
}
