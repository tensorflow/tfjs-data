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

import * as tfd from '../../src/index';

// Boston Housing data constants:
const BASE_URL =
    'https://storage.googleapis.com/tfjs-examples/multivariate-linear-regression/data/';

const TRAIN_FEATURES_FILENAME = 'train-data.csv';
const TRAIN_TARGET_FILENAME = 'train-target.csv';
const TEST_FEATURES_FILENAME = 'test-data.csv';
const TEST_TARGET_FILENAME = 'test-target.csv';

/** Helper class to handle loading training and test data. */
export class BostonHousingDataset {
  trainDataset: tfd.data.Dataset<tfd.data.DataElement> = null;
  testDataset: tfd.data.Dataset<tfd.data.DataElement> = null;
  numFeatures: number = null;

  private constructor() {}

  static async create() {
    const result = new BostonHousingDataset();
    await result.loadData();
    return result;
  }

  /**
   * Downloads, converts and shuffles the data.
   */
  private async loadData() {
    const fileUrls = [
      `${BASE_URL}${TRAIN_FEATURES_FILENAME}`,
      `${BASE_URL}${TRAIN_TARGET_FILENAME}`,
      `${BASE_URL}${TEST_FEATURES_FILENAME}`,
      `${BASE_URL}${TEST_TARGET_FILENAME}`
    ];
    console.log('* Downloading data *');
    const csvDatasets = fileUrls.map(url => tfd.data.csv(url));

    // Sets number of features so it can be used in the model.
    this.numFeatures = (await csvDatasets[0].getColumnNames()).length;

    // Reduces the object-type data to an array of numbers.
    const convertedDatasets = csvDatasets.map(
        (dataset) => dataset.map((row: {[key: string]: number}) => {
          return Object.keys(row).sort().map(key => row[key]);
        }));

    const trainFeaturesDataset = convertedDatasets[0];
    const trainTargetDataset = convertedDatasets[1];
    const testFeaturesDataset = convertedDatasets[2];
    const testTargetDataset = convertedDatasets[3];

    this.trainDataset =
        tfd.data
            .zip({features: trainFeaturesDataset, target: trainTargetDataset})
            .shuffle(1000);
    this.testDataset =
        tfd.data.zip({features: testFeaturesDataset, target: testTargetDataset})
            .shuffle(1000);
  }
}
