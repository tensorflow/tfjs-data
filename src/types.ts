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
 *
 * =============================================================================
 */

import {DataType, Tensor1D} from '@tensorflow/tfjs-core';
import {TensorContainer, TensorContainerArray, TensorContainerObject} from '@tensorflow/tfjs-core/dist/tensor_types';
import {TensorLike} from '@tensorflow/tfjs-core/dist/types';
import {Dataset} from './dataset';
import {LazyIterator} from './iterators/lazy_iterator';

/**
 * JSON-like type representing a nested structure of primitives or Tensors.
 */
export type DataElement = TensorContainer;

export type DataElementObject = TensorContainerObject;

export type DataElementArray = TensorContainerArray;

// Maybe this should be called 'NestedContainer'-- that's just a bit unwieldy.
export type Container<T> = ContainerObject<T>|ContainerArray<T>;

export type ContainerOrT<T> = Container<T>|T;

export interface ContainerObject<T> {
  [x: string]: ContainerOrT<T>;
}
export interface ContainerArray<T> extends Array<ContainerOrT<T>> {}

/**
 * A nested structure of Datasets, used as the input to zip().
 */
export type DatasetContainer = Container<Dataset<DataElement>>;

/**
 * A nested structure of LazyIterators, used as the input to zip().
 */
export type IteratorContainer = Container<LazyIterator<DataElement>>;

/**
 * Types supported by FileChunkIterator in both Browser and Node Environment.
 */
export type FileElement = File|Blob|Uint8Array;

/**
 * A dictionary containing column level configurations when reading and decoding
 * CSV file(s) from csv source.
 * Has the following fields:
 * - `required` If value in this column is required. If set to `true`, throw an
 * error when it finds an empty value.
 *
 * - `dtype` Data type of this column. Could be int32, float32, bool, or string.
 *
 * - `default` Default value of this column.
 *
 * - `isLabel` Whether this column is label instead of features. If isLabel is
 * `true` for at least one column, the .csv() API will return an array of two
 * items: the first item is a dict of features key/value pairs, the second item
 * is a dict of labels key/value pairs. If no column is marked as label returns
 * a dict of features only.
 */
export interface ColumnConfig {
  required?: boolean;
  dtype?: DataType;
  default?: DataElement;
  isLabel?: boolean;
}

/**
 * Interface for configuring dataset when reading and decoding from CSV file(s).
 */
export interface CSVConfig {
  /**
   * A boolean value that indicates whether the first row of provided CSV file
   * is a header line with column names, and should not be included in the data.
   */
  hasHeader?: boolean;

  /**
   * A list of strings that corresponds to the CSV column names, in order. If
   * provided, it ignores the column names inferred from the header row. If not
   * provided, infers the column names from the first row of the records. If
   * `hasHeader` is false and `columnNames` is not provided, this method will
   * throw an error.
   */
  columnNames?: string[];

  /**
   * A dictionary whose key is column names, value is an object stating if this
   * column is required, column's data type, default value, and if this column
   * is label. If provided, keys must correspond to names provided in
   * `columnNames` or inferred from the file header lines. If any column is
   * marked as label, the .csv() API will return an array of two items: the
   * first item is a dict of features key/value pairs, the second item is a dict
   * of labels key/value pairs. If no column is marked as label returns a dict
   * of features only.
   *
   * Has the following fields:
   * - `required` If value in this column is required. If set to `true`, throw
   * an error when it finds an empty value.
   *
   * - `dtype` Data type of this column. Could be int32, float32, bool, or
   * string.
   *
   * - `default` Default value of this column.
   *
   * - `isLabel` Whether this column is label instead of features. If isLabel is
   * `true` for at least one column, the element in returned `CSVDataset` will
   * be an object of {xs: features, ys: labels}: xs is a dict of features
   * key/value pairs, ys is a dict of labels key/value pairs. If no column is
   * marked as label, returns a dict of features only.
   */
  columnConfigs?: {[key: string]: ColumnConfig};

  /**
   * If true, only columns provided in `columnConfigs` will be parsed and
   * provided during iteration.
   */
  configuredColumnsOnly?: boolean;

  /**
   * The string used to parse each line of the input file.
   */
  delimiter?: string;
}

/**
 * Interface configuring data from webcam video stream.
 */
export interface WebcamConfig {
  /**
   * A string specifying which camera to use on mobile device. If the value is
   * 'user', it will use front camera. If the value is 'environment', it will
   * use rear camera.
   */
  facingMode?: string;

  /**
   * A string used to request a specific camera. The deviceId can be obtained by
   * calling `mediaDevices.enumerateDevices()`.
   */
  deviceId?: string;

  /**
   * If webcamVideoElement is provided when calling `tf.data.webcam()`, this
   * field is ignored. If webcamVideoElement is not provided, this field will be
   * used as the width of the hidden HTMLVideoElement, which holds the webcam
   * video stream.
   */
  width?: number;

  /**
   * If webcamVideoElement is provided when calling `tf.data.webcam()`, this
   * field is ignored. If webcamVideoElement is not provided, this field will be
   * used as the height of the hidden HTMLVideoElement, which holds the webcam
   * video stream.
   */
  height?: number;

  /**
   * Croping and resizing configuration when reading data from
   * webcam video stream. Please see
   * https://js.tensorflow.org/api/latest/#image.cropAndResize for details.
   */
  cropAndResizeConfig?: CropAndResizeConfig;
}

/**
 * Interface contains croping and resizing configuration when reading data from
 * webcam video stream.
 */
export interface CropAndResizeConfig {
  /**
   * 1d float32 tensor of [y1, x1, y2, x2], where (y1, x1) and (y2, x2) are the
   * normalized coordinates of the box in the image.
   */
  cropBox: Tensor1D|TensorLike;

  /**
   * 1d int32 tensor of 2 elements [cropHeigh, cropWidth] specifying the size to
   * which all crops are resized to.
   */
  cropSize: [number, number];

  /**
   * A string from `'bilinear' | 'nearest'`, defaults to bilinear, which
   * specifies the sampling method for resizing
   */
  cropMethod?: 'bilinear'|'nearest';

  /**
   * A threshold for deciding when to remove boxes based on score. Defaults to
   * 0.
   */
  extrapolationValue?: number;
}
