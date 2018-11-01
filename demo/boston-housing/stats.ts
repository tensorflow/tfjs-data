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
import * as tf from '@tensorflow/tfjs-core';
import {Dataset} from '@tensorflow/tfjs-data/dist/src';

// TODO(kangyizhang): Remove this file once we have statistics API public.

type ElementArray = number|number[]|tf.Tensor|string;

type TabularRecord = {
  [key: string]: ElementArray
};

interface NumericColumnStatistics {
  min: number;
  max: number;
  mean: number;
  variance: number;
  stddev: number;
  length: number;
}

export interface DatasetStatistics {
  [key: string]: NumericColumnStatistics;
}

export async function computeDatasetStatistics(
    dataset: Dataset<TabularRecord>) {
  const result: DatasetStatistics = {};

  await dataset.forEach(e => {
    for (const key of Object.keys(e)) {
      const value = e[key];
      if (typeof (value) === 'string') {
      } else {
        let previousMean = 0;
        let previousLength = 0;
        let previousVariance = 0;
        let columnStats: NumericColumnStatistics = result[key];
        if (columnStats == null) {
          columnStats = {
            min: Number.POSITIVE_INFINITY,
            max: Number.NEGATIVE_INFINITY,
            mean: 0,
            variance: 0,
            stddev: 0,
            length: 0
          };
          result[key] = columnStats;
        } else {
          previousMean = columnStats.mean;
          previousLength = columnStats.length;
          previousVariance = columnStats.variance;
        }
        let recordMin: number;
        let recordMax: number;

        // Calculate accumulated mean and variance following tf.Transform
        // implementation
        let valueLength = 0;
        let valueMean = 0;
        let valueVariance = 0;
        let combinedLength = 0;
        let combinedMean = 0;
        let combinedVariance = 0;

        if (value instanceof tf.Tensor) {
          recordMin = value.min().dataSync()[0];
          recordMax = value.max().dataSync()[0];
          const valueMoment = tf.moments(value);
          valueMean = valueMoment.mean.get();
          valueVariance = valueMoment.variance.get();
          valueLength = value.size;

        } else if (value instanceof Array) {
          recordMin = value.reduce((a, b) => Math.min(a, b));
          recordMax = value.reduce((a, b) => Math.max(a, b));
          const valueMoment = tf.moments(value);
          valueMean = valueMoment.mean.get();
          valueVariance = valueMoment.variance.get();
          valueLength = value.length;

        } else if (!isNaN(value) && isFinite(value)) {
          recordMin = value;
          recordMax = value;
          valueMean = value;
          valueVariance = 0;
          valueLength = 1;

        } else {
          columnStats = null;
          continue;
        }
        combinedLength = previousLength + valueLength;
        combinedMean = previousMean +
            (valueLength / combinedLength) * (valueMean - previousMean);
        combinedVariance = previousVariance +
            (valueLength / combinedLength) *
                (valueVariance +
                 ((valueMean - combinedMean) * (valueMean - previousMean)) -
                 previousVariance);

        columnStats.min = Math.min(columnStats.min, recordMin);
        columnStats.max = Math.max(columnStats.max, recordMax);
        columnStats.length = combinedLength;
        columnStats.mean = combinedMean;
        columnStats.variance = combinedVariance;
        columnStats.stddev = Math.sqrt(combinedVariance);
      }
    }
  });
  return result;
}
