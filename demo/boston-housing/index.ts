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
import {Tensor, Tensor2D} from '@tensorflow/tfjs-core';

import {Dataset} from '../../src/dataset';
import {computeDatasetStatistics, NumericColumnStatistics} from '../../src/statistics';
import {TabularRecord} from '../../src/types';

import {BostonHousingDataset} from './data';
import * as ui from './ui';

// Some hyperparameters for model training.
const NUM_EPOCHS = 250;
const BATCH_SIZE = 40;
const LEARNING_RATE = 0.01;

interface Tensors {
  trainFeatures: Tensor2D;
  trainTarget: Tensor2D;
  testFeatures: Tensor2D;
  testTarget: Tensor2D;
}

const tensors: Tensors = {
  trainFeatures: null,
  trainTarget: null,
  testFeatures: null,
  testTarget: null
};

let bostonData: BostonHousingDataset;

// TODO(kangyizhang): Remove this function when model.fitDataset(dataset) is
//  available. This work should be done by dataset class itself.

// Converts loaded data into tensors and creates normalized versions of the
// features.
export async function arraysToTensors() {
  // Gets mean and standard deviation of data.
  const trainFeaturesStats = await computeDatasetStatistics(
      await bostonData.trainDataset.map(
          (row: {features: {key: number}, target: {key: number}}) =>
              row.features) as Dataset<TabularRecord>);

  const dataMean =
      tf.tensor1d(Object.values(trainFeaturesStats)
                      .map((row: NumericColumnStatistics) => row.mean));
  const dataStd = tf.tensor1d(
      Object.values(trainFeaturesStats)
          .map((row: NumericColumnStatistics) => Math.sqrt(row.variance)));

  // Materializes data into arrays.
  const trainIter = await bostonData.trainDataset.iterator();
  const trainData = await trainIter.collect();
  const testIter = await bostonData.testDataset.iterator();
  const testData = await testIter.collect();

  // Normalizes features data and covnerts data into tensors.
  tensors.trainFeatures =
      tf.tensor2d(trainData.map((row: {features: number[],
                                       target: number[]}) => row.features))
          .sub(dataMean)
          .div(dataStd);
  tensors.trainTarget = tf.tensor2d(trainData.map(
      (row: {features: number[], target: number[]}) => row.target));

  tensors.testFeatures =
      tf.tensor2d(testData.map((row: {features: number[],
                                      target: number[]}) => row.features))
          .sub(dataMean)
          .div(dataStd);
  tensors.testTarget = tf.tensor2d(testData.map(
      (row: {features: number[], target: number[]}) => row.target));
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
  await model.fit(tensors.trainFeatures, tensors.trainTarget, {
    batchSize: BATCH_SIZE,
    epochs: NUM_EPOCHS,
    validationSplit: 0.2,
    callbacks: {
      onEpochEnd: async (epoch, logs) => {
        await ui.updateStatus(`Epoch ${epoch + 1} of ${NUM_EPOCHS} completed.`);
        trainLoss = logs.loss;
        valLoss = logs.val_loss;
        await ui.plotData(epoch, trainLoss, valLoss);
      }
    }
  });

  await ui.updateStatus('Running on test data...');
  const result = model.evaluate(
                     tensors.testFeatures, tensors.testTarget,
                     {batchSize: BATCH_SIZE}) as Tensor;
  const testLoss = result.dataSync()[0];
  await ui.updateStatus(
      `Final train-set loss: ${trainLoss.toFixed(4)}\n` +
      `Final validation-set loss: ${valLoss.toFixed(4)}\n` +
      `Test-set loss: ${testLoss.toFixed(4)}`);
};

export const computeBaseline = () => {
  const avgPrice = tf.mean(tensors.trainTarget);
  console.log(`Average price: ${avgPrice.dataSync()}`);
  const baseline = tf.mean(tf.pow(tf.sub(tensors.testTarget, avgPrice), 2));
  console.log(`Baseline loss: ${baseline.dataSync()}`);
  const baselineMsg = `Baseline loss (meanSquaredError) is ${
      baseline.dataSync()[0].toFixed(2)}`;
  ui.updateBaselineStatus(baselineMsg);
};

document.addEventListener('DOMContentLoaded', async () => {
  bostonData = await BostonHousingDataset.create();
  ui.updateStatus('Data loaded, converting to tensors');
  await arraysToTensors();
  ui.updateStatus(
      'Data is now available as tensors.\n' +
      'Click a train button to begin.');
  ui.updateBaselineStatus('Estimating baseline loss');
  computeBaseline();
  await ui.setup();
}, false);
