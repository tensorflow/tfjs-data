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
 * that can be parsed as numbers are emitted as type `number`, other values
 * are parsed as `string`.
 *
 * The results are not batched.
 */
export class CSVDataset extends Dataset<DataElement> {
  base: TextLineDataset;
  private hasHeader = true;
  private columnNames: string[] = null;
  private columnNamesValidated = false;
  private columnConfigs: {[key: string]: ColumnConfig} = null;
  private configuredColumnsOnly = false;
  private delimiter = ',';

  async getColumnNames() {
    if (!this.columnNamesValidated) {
      await this.setColumnNames();
    }
    return this.configuredColumnsOnly ? Object.keys(this.columnConfigs) :
                                        this.columnNames;
  }

  /* 1) If columnNames is provided as string[], use this string[] as output
   * keys in corresponded order, and the length must match header line columns
   * length if hasHeader is true.
   * 2) If columnNames is not provided, parse header line as columnNames if
   * hasHeader === true. If hasHeader === false, throw an error.
   * 3) If columnConfigs is provided, all the keys in columnConfigs must exist
   * in parsed columnNames.
   */
  private async setColumnNames() {
    const columnNamesFromFile = await this.maybeReadHeaderLine();
    if (!this.columnNames && !columnNamesFromFile) {
      // Throw an error if columnNames is not provided and no header line.
      throw new Error(
          'Column names must be provided if there is no header line.');
    } else if (this.columnNames && columnNamesFromFile) {
      // Check provided columnNames match header line.
      assert(
          columnNamesFromFile.length === this.columnNames.length,
          `The length of provided columnNames (${
              this.columnNames.length}) does not` +
              ` match the length of the header line read from file (${
                  columnNamesFromFile.length}).`);
    }
    if (!this.columnNames) {
      this.columnNames = columnNamesFromFile;
    }
    // Check if keys in columnConfigs match columnNames.
    if (this.columnConfigs) {
      for (const key of Object.keys(this.columnConfigs)) {
        const index = this.columnNames.indexOf(key);
        if (index === -1) {
          throw new Error(
              `The key ${key} provided in columnConfigs does not` +
              ` match any of the column names (${this.columnNames}).`);
        }
      }
    }
    this.columnNamesValidated = true;
  }

  private async maybeReadHeaderLine() {
    if (this.hasHeader) {
      const iter = await this.base.iterator();
      const firstElement = await iter.next();
      if (firstElement.done) {
        throw new Error('No data was found for CSV parsing.');
      }
      const firstLine: string = firstElement.value;
      return firstLine.split(this.delimiter);
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
   *     not be included in the data. Defaults to `True`.
   *
   *     columnNames: (Optional) A list of strings that corresponds to
   *     the CSV column names, in order. If provided, it ignores the column
   *     names inferred from the header row. If not provided, infers the column
   *     names from the first row of the records. If hasHeader is false and
   *     columnNames not provided, throw an error.
   *
   *     columnConfigs: (Optional) A dictionary whose key is column names, value
   *     is an object stating if this column is required, column's data type,
   *     default value, and if this column is label. If provided, keys must
   *     correspond to names provided in columnNames or inferred from the file
   *     header lines. If isLabel=true is set for any column, returns an array
   *     of two items: the first item is a map of features kay/value pairs, the
   *     second item is a map of labels key/value pairs. If no feature is marked
   *     as label, returns a map of features only.
   *
   *     configuredColumnsOnly (Optional) If true, only columns provided in
   *     columnConfigs will be parsed and provided during iteration.
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
    this.hasHeader = csvConfig.hasHeader === false ? false : true;
    this.columnNames = csvConfig.columnNames;
    this.columnConfigs = csvConfig.columnConfigs;
    this.configuredColumnsOnly = csvConfig.configuredColumnsOnly;
    this.delimiter = csvConfig.delimiter ? csvConfig.delimiter : ',';
  }

  async iterator(): Promise<LazyIterator<DataElement>> {
    if (!this.columnNamesValidated) {
      await this.setColumnNames();
    }
    let lines = await this.base.iterator();
    if (this.hasHeader) {
      // We previously read the first line to get the columnNames.
      // Now that we're providing data, skip it.
      lines = lines.skip(1);
    }
    return lines.map(x => this.makeDataElement(x));
  }

  makeDataElement(line: string): DataElement {
    // TODO(soergel): proper CSV parsing with escaping, quotes, etc.
    const values = line.split(this.delimiter);
    const features: {[key: string]: DataElement} = {};
    const labels: {[key: string]: DataElement} = {};

    for (let i = 0; i < this.columnNames.length; i++) {
      const key = this.columnNames[i];
      const config = this.columnConfigs ? this.columnConfigs[key] : null;
      if (this.configuredColumnsOnly && !config) {
        // This column is not selected.
        continue;
      } else {
        const value = values[i];
        let parsedValue = null;
        if (value === '') {
          // If default value is provided, use it. If default value is not
          // provided, set as undefined.
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
            // The value is a string and this column is declared as boolean
            // in config, parse it as boolean.
            if (config && config.dtype === 'bool') {
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
              case 'float32':
                parsedValue = valueAsNum;
                break;
              case 'int32':
                parsedValue = Math.floor(valueAsNum);
                break;
              case 'bool':
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
    // If label exists, return an array of features and labels, otherwise
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
