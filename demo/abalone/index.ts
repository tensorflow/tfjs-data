import '@tensorflow/tfjs-node';

import * as tf from '@tensorflow/tfjs';
import {Tensor} from '@tensorflow/tfjs-core';
import * as fs from 'fs';
import {promisify} from 'util';

import * as tfd from '../../src';

const readFile = promisify(fs.readFile);

function getModel() {
  // build neural network
  const model = tf.sequential();

  model.add(tf.layers.dense({
    inputShape: [8],
    activation: 'sigmoid',
    units: 50,
  }));
  model.add(tf.layers.dense({
    activation: 'sigmoid',
    units: 50,
  }));
  // model.add(tf.layers.dense({
  //   activation: 'sigmoid',
  //   units: 50,
  // }));
  model.add(tf.layers.dense({
    units: 1,
  }));
  model.compile({optimizer: tf.train.adam(0.005), loss: 'meanSquaredError'});
  return model;
}


async function run() {
  const localFileBuffer = await readFile('Abalone.csv');
  const dataset = (await tfd.data.CSVDataset.create(
                       new tfd.data.FileDataSource(localFileBuffer), true, null,
                       {'rings\r': {isLabel: true}}))
                      .shuffle(10);

  const iter = await dataset.iterator();
  const data = await iter.collect();
  const feature = tf.tensor2d(data.map((row: Array<{}>) => {
                                    return row[0];
                                  })
                                  .map((row: {[key: string]: string}) => {
                                    return Object.keys(row).map(key => {
                                      switch (row[key]) {
                                        case 'F':
                                          return 0;
                                        case 'M':
                                          return 1;
                                        case 'I':
                                          return 2;
                                        default:
                                          return Number(row[key]);
                                      }
                                    });
                                  }));

  const target =
      tf.tensor2d(data.map((row: Array<{}>) => {
                        return row[1];
                      })
                      .map((row: {[key: string]: string}) => {
                        return Object.keys(row).map(key => Number(row[key]));
                      }));

  const model = getModel();

  await model.fit(feature, target, {
    epochs: 100,
    validationSplit: 0.2,
    callbacks: {
      onEpochEnd: async (epoch, logs) => {
        // console.log(`Epoch ${epoch + 1} of ${100} completed.`);
      }
    }
  });

  const result = model.evaluate(
                     tf.tensor2d([
                       [1, 0.355, 0.29, 0.09, 0.3275, 0.134, 0.086, 0.09],
                       [0, 0.45, 0.335, 0.105, 0.425, 0.1865, 0.091, 0.115],
                       [0, 0.55, 0.425, 0.135, 0.8515, 0.362, 0.196, 0.27]
                     ]),
                     tf.tensor1d([9, 9, 14])) as Tensor;
  console.log(result.dataSync());

  // 9,9,14
  console.log((model.predict(tf.tensor2d([
                [1, 0.355, 0.29, 0.09, 0.3275, 0.134, 0.086, 0.09],
                [0, 0.45, 0.335, 0.105, 0.425, 0.1865, 0.091, 0.115],
                [0, 0.55, 0.425, 0.135, 0.8515, 0.362, 0.196, 0.27]
              ])) as Tensor)
                  .dataSync());
}

run();
