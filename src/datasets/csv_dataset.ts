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

import {DType} from '@tensorflow/tfjs-core/dist/types';
import {assert} from '@tensorflow/tfjs-core/dist/util';

import {Dataset} from '../dataset';
import {DataSource} from '../datasource';
import {LazyIterator} from '../iterators/lazy_iterator';
import {ColumnConfig, CSVConfig, DataElement} from '../types';

import {TextLineDataset} from './text_line_dataset';

/**
 * Represents a potentially large collection of delimited text records.
 *
 * The produced `DataElement`s each contain one key-value pair for
 * every column of the table.  When a field is empty in the incoming data, the
 * resulting value is `undefined`, or throw error if it is required.  Values
 * that can be parsed as numbers are emitted as type `number`; otherwise they
 * are left as `string`.
 *
 * The results are not batched.
 */
export class CSVDataset extends Dataset<DataElement> {
  base: TextLineDataset;
  private _hasHeader = true;
  private _headers: string[] = null;
  private _headersValidated = false;
  private _columnConfigs: {[key: string]: ColumnConfig} = null;
  private _configuredColumnsOnly = false;
  private _delimiter = ',';

  async getHeaders() {
    if (!this._headersValidated) {
      await this.setHeaders();
    }
    return this._configuredColumnsOnly ? Object.keys(this._columnConfigs) :
                                         this._headers;
  }

  /* 1) If _headers is provided as string[], use this string[] as output
   * keys in corresponded order, and they must match header line if
   * _hasHeader is true.
   * 2) If _headers is not provided, parse header line as headers if
   * _hasHeader === true, otherwise throw an error.
   * 3) If _columnConfigs is provided, all the keys in _columnConfigs must exist
   * in parsed headers.
   */
  private async setHeaders() {
    const columnNamesFromFile = await this.maybeReadHeaderLine();
    if (!this._headers && !columnNamesFromFile) {
      // Throw an error if _headers is not provided and no header line.
      throw new Error(
          'Column names must be provided if there is no header line.');
    } else if (this._headers && columnNamesFromFile) {
      // Check provided _headers match header line.
      assert(
          columnNamesFromFile.length === this._headers.length,
          'Provided column names does not match header line.');
      for (let i = 0; i < this._headers.length; i++) {
        assert(
            columnNamesFromFile[i] === this._headers[i],
            'Provided column names does not match header line.');
      }
    }
    if (columnNamesFromFile) {
      this._headers = columnNamesFromFile;
    }
    // Check if keys in _columnConfigs match _headers.
    if (this._columnConfigs) {
      for (const key of Object.keys(this._columnConfigs)) {
        const index = this._headers.indexOf(key);
        if (index === -1) {
          throw new Error('Column config does not match column names.');
        }
      }
    }
    this._headersValidated = true;
  }

  private async maybeReadHeaderLine() {
    if (this._hasHeader) {
      const iter = await this.base.iterator();
      const firstElement = await iter.next();
      if (firstElement.done) {
        throw new Error('No data was found for CSV parsing.');
      }
      const firstLine: string = firstElement.value;
      return firstLine.split(this._delimiter);
    } else {
      return null;
    }
  }

  /**
   * Create a `CSVDataset`.
   *
   * @param input A `DataSource` providing a chunked, UTF8-encoded byte stream.
   * @param csvConfig (Optional) A CSVConfig object that contains configurations
   *     of reading and decoding from CSV file(s).
   *
   *     hasHeader: (Optional) A boolean value that indicates whether the first
   *     row of provided CSV file is a header line with column names, and should
   *     not be included in the data. Defaults to `False`.
   *
   *     headers: (Optional) A list of strings that corresponds to
   *     the CSV column names, in order. If this is not provided, infers the
   *     column names from the first row of the records if there is header line,
   *     otherwise throw an error.
   *
   *     columnConfigs: (Optional) A dictionary whose key is column names, value
   *     is an object stating if this column is required, column's data type,
   *     default value, and if this column is label. If provided, keys must
   *     correspond to names provided in column_names or inferred from the file
   *     header lines.
   *
   *     configuredColumnsOnly (Optional) A boolean value specifies if only
   *     parsing and returning columns which exist in columnConfigs.
   *
   *     delimiter (Optional) The string used to parse each line of the input
   *     file. Defaults to `,`.
   */
  constructor(protected readonly input: DataSource, csvConfig?: CSVConfig) {
    super();
    this.base = new TextLineDataset(input);
    if (!csvConfig) {
      csvConfig = {};
    }
    this._hasHeader = csvConfig.hasHeader === false ? false : true;
    this._headers = csvConfig.headers;
    this._columnConfigs = csvConfig.columnConfigs;
    this._configuredColumnsOnly = csvConfig.configuredColumnsOnly;
    this._delimiter = csvConfig.delimiter ? csvConfig.delimiter : ',';
  }

  async iterator(): Promise<LazyIterator<DataElement>> {
    if (!this._headersValidated) {
      await this.setHeaders();
    }
    let lines = await this.base.iterator();
    if (this._hasHeader) {
      // We previously read the first line to get the headers.
      // Now that we're providing data, skip it.
      lines = lines.skip(1);
    }
    return lines.map(x => this.makeDataElement(x));
  }

  makeDataElement(line: string): DataElement {
    // TODO(soergel): proper CSV parsing with escaping, quotes, etc.
    const values = line.split(this._delimiter);
    const features: {[key: string]: DataElement} = {};
    const labels: {[key: string]: DataElement} = {};

    for (let i = 0; i < this._headers.length; i++) {
      const key = this._headers[i];
      const config = this._columnConfigs ? this._columnConfigs[key] : null;
      if (this._configuredColumnsOnly && !config) {
        // This column is not selected.
        continue;
      } else {
        const value = values[i];
        let parsedValue = null;
        if (value === '') {
          // Fills default value if provided, otherwise return undefined.
          if (config && config.default !== undefined) {
            parsedValue = config.default;
          } else if (config && (config.required || config.isLabel)) {
            throw new Error(
                `Required column ${key} is empty in this line: ${line}`);
          } else {
            parsedValue = undefined;
          }
        } else {
          // A value is present, so parse it based on type
          const valueAsNum = Number(value);
          if (isNaN(valueAsNum)) {
            // If the value is a string and this column is declared as boolean
            // in config, parse it as boolean, otherwise return string.
            if (config && config.dtype === DType.bool) {
              parsedValue = this.getBoolean(value);
            } else {
              // Set value as string
              parsedValue = value as string;
            }
          } else if (!config || !config.dtype) {
            // If this value is a number and no type config is provided, return
            // it as number.
            parsedValue = valueAsNum;
          } else {
            // If this value is a number and data type is provided, parse it
            // according to provided data type.
            switch (config.dtype) {
              case DType.float32:
                parsedValue = valueAsNum;
                break;
              case DType.int32:
                parsedValue = Math.floor(valueAsNum);
                break;
              case DType.bool:
                parsedValue = this.getBoolean(value);
                break;
              default:
                parsedValue = valueAsNum;
            }
          }
        }
        // Check if this column is label.
        (config && config.isLabel) ? labels[key] = parsedValue :
                                     features[key] = parsedValue;
      }
    }
    // If label is not empty, return an array of features and labels, otherwise
    // return features only.
    if (Object.keys(labels).length === 0) {
      return features;

    } else {
      return [features, labels];
    }
  }

  private getBoolean(value: string): number {
    if (value === '1' || value.toLowerCase() === 'true') {
      return 1;
    } else {
      return 0;
    }
  }
}

// TODO(soergel): add more basic datasets for parity with tf.data
// tf.data.FixedLengthRecordDataset()
// tf.data.TFRecordDataset()
