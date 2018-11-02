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

import * as tf from '@tensorflow/tfjs';
import {assert} from '@tensorflow/tfjs-core/dist/util';
import {DataElement, Dataset} from '@tensorflow/tfjs-data';

import {BostonHousingDataset} from './data';
// TODO(kangyi, soergel): Remove this once we have a public statistics API.
import {computeDatasetStatistics, DatasetStatistics} from './stats';
import * as ui from './ui';

// Some hyperparameters for model training.
const NUM_EPOCHS = 250;

const BATCH_SIZE = 40;

//  Total number of steps (batches of samples) before declaring one epoch
//  finished and starting the next epoch. It should typically be equal to the
//  number of samples of the dataset divided by the batch size, so that
//  `fitDataset()` call can utilize the entire dataset. In this example the
//  train dataset has 285 samples, and batchSize is 40, so batchesPerEpoch
//  should is rounding up 285/40 to the closest integer 8.
const BATCHES_PER_EPOCH = 8;

// Total number of batches of samples to draw from `validationData` for
// validation purpose before stopping at the end of every epoch. In this example
// the validation dataset has 50 samples and batch size is 40, so
// validationBatches is rounding up 50/40 to the closest integer 2.
const VALIDATION_BATCHES = 2;

// Number of batches to draw from the dataset object before ending
// `evaluationDataset`. In this example the test dataset has 175 samples and
// batch size is 40, so evaluateBatches is rounding up 175/40 to the closest
// integer 5.
const EVALUATE_BATCHES = 5;

const LEARNING_RATE = 0.01;

interface PreparedData {
  trainData: Dataset<DataElement>;
  validationData: Dataset<DataElement>;
  testData: Dataset<DataElement>;
}

const preparedData: PreparedData = {
  trainData: null,
  validationData: null,
  testData: null
};

let bostonData: BostonHousingDataset;
let featureStats: DatasetStatistics;
let targetStats: DatasetStatistics;

// Converts loaded data into tensors and creates normalized versions of the
// features.
export async function loadDataAndNormalize() {
  // TODO(kangyizhang): Statistics should be generated from trainDataset
  // directly. Update following codes after
  // https://github.com/tensorflow/tfjs-data/issues/32 is resolved.

  // Gets mean and standard deviation of data.
  // row[0] is feature data.
  featureStats = await computeDatasetStatistics(
      bostonData.trainDataset.map((row: Array<{key: number}>) => row[0]));
  // TODO(kangyizhang): Remove this once statistics support nested object.
  // row[1] is target data.
  targetStats = await computeDatasetStatistics(
      bostonData.trainDataset.map((row: Array<{key: number}>) => row[1]));

  // Normalizes data.
  preparedData.trainData =
      bostonData.trainDataset.map(normalizeFeatures).batch(BATCH_SIZE).repeat();
  preparedData.validationData =
      bostonData.validationDataset.map(normalizeFeatures)
          .batch(BATCH_SIZE)
          .repeat();
  preparedData.testData =
      bostonData.testDataset.map(normalizeFeatures).batch(BATCH_SIZE).repeat();
}

/**
 * Normalizes features with statistics and returns a new object.
 */
// TODO(kangyizhang, bileschi): Replace these with preprocessing layers once
// they are available.
function normalizeFeatures(row: number[][]) {
  const features = row[0];
  const normalizedFeatures: number[] = [];
  features.forEach(
      (value, index) => normalizedFeatures.push(
          (value - featureStats[index].mean) / featureStats[index].stddev));
  return [normalizedFeatures, row[1]];
}

/**
 * Builds and returns Linear Regression Model.
 *
 * @returns {tf.Sequential} The linear regression model.
 */
export const linearRegressionModel = (): tf.Sequential => {
  const model = tf.sequential();
  model.add(tf.layers.dense({inputShape: [bostonData.numFeatures], units: 1}));

  return model;
};

/**
 * Builds and returns Multi Layer Perceptron Regression Model
 * with 2 hidden layers, each with 10 units activated by sigmoid.
 *
 * @returns {tf.Sequential} The multi layer perceptron regression model.
 */
export const multiLayerPerceptronRegressionModel = (): tf.Sequential => {
  const model = tf.sequential();
  model.add(tf.layers.dense({
    inputShape: [bostonData.numFeatures],
    units: 50,
    activation: 'sigmoid'
  }));
  model.add(tf.layers.dense({units: 50, activation: 'sigmoid'}));
  model.add(tf.layers.dense({units: 1}));

  return model;
};

/**
 * Compiles `model` and trains it using the train data and runs model against
 * test data. Issues a callback to update the UI after each epcoh.
 *
 * @param {tf.Sequential} model Model to be trained.
 */
export const run = async (model: tf.Sequential) => {
  await ui.updateStatus('Compiling model...');
  model.compile(
      {optimizer: tf.train.sgd(LEARNING_RATE), loss: 'meanSquaredError'});

  let trainLoss: number;
  let valLoss: number;

  await ui.updateStatus('Starting training process...');
  await model.fitDataset(preparedData.trainData, {
    epochs: NUM_EPOCHS,
    batchesPerEpoch: BATCHES_PER_EPOCH,
    validationData: preparedData.validationData,
    validationBatches: VALIDATION_BATCHES,
    callbacks: {
      onEpochEnd: async (epoch: number, logs) => {
        await ui.updateStatus(`Epoch ${epoch + 1} of ${NUM_EPOCHS} completed.`);
        trainLoss = logs.loss;
        valLoss = logs.val_loss;
        await ui.plotData(epoch, trainLoss, valLoss);
      }
    }
  });

  await ui.updateStatus('Running on test data...');
  const result =
      (await model.evaluateDataset(
          preparedData.testData, {batches: EVALUATE_BATCHES})) as tf.Tensor;
  const testLoss = result.dataSync()[0];
  await ui.updateStatus(
      `Final train-set loss: ${trainLoss.toFixed(4)}\n` +
      `Final validation-set loss: ${valLoss.toFixed(4)}\n` +
      `Test-set loss: ${testLoss.toFixed(4)}`);
};

export const computeBaseline = async () => {
  const trainMean = targetStats[0].mean;

  const testIter = await bostonData.testDataset.iterator();
  let testSquareError = 0;
  let testCount = 0;
  while (true) {
    const row: {done: boolean, value: number[]} =
        (await testIter.next()) as {done: boolean, value: number[]};
    if (row.done) {
      break;
    }
    testSquareError += Math.pow(row.value[1] - trainMean, 2);
    testCount++;
  }
  assert(testCount !== 0, 'No test data found!');
  const baseline = testSquareError / testCount;
  const baselineMsg =
      `Baseline loss (meanSquaredError) is ${baseline.toFixed(2)}`;
  ui.updateBaselineStatus(baselineMsg);
};

document.addEventListener('DOMContentLoaded', async () => {
  bostonData = await BostonHousingDataset.create();
  ui.updateStatus('Data loaded, converting to tensors');
  await loadDataAndNormalize();
  ui.updateStatus(
      'Data is now available as tensors.\n' +
      'Click a train button to begin.');
  ui.updateBaselineStatus('Estimating baseline loss');
  computeBaseline();
  await ui.setup();
}, false);
