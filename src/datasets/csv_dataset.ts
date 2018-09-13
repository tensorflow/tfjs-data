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

import {DataType} from '@tensorflow/tfjs-core';
import {DType} from '@tensorflow/tfjs-core/dist/types';

import {Dataset} from '../dataset';
import {DataSource} from '../datasource';
import {LazyIterator} from '../iterators/lazy_iterator';
import {DataElement, ElementArray} from '../types';

import {TextLineDataset} from './text_line_dataset';

export enum CsvHeaderConfig {
  READ_FIRST_LINE,
  NUMBERED
  // PROVIDED // This is just represented as string[]
}

/**
 * Represents a potentially large collection of delimited text records.
 *
 * The produced `DataElement`s each contain one key-value pair for
 * every column of the table.  When a field is empty in the incoming data, the
 * resulting value is `undefined`.  Values that can be parsed as numbers are
 * emitted as type `number`; otherwise they are left as `string`.
 *
 * The results are not batched.
 */
export class CSVDataset extends Dataset<DataElement> {
  base: TextLineDataset;
  private _hasHeaderLine = false;
  private _csvColumnNames: string[] = null;
  private _dataTypes: DataType[] = null;
  private _delimiter: string = null;
  private _selectColumnIndexes: number[] = null;

  /**
   * Create a `CSVDataset`.  Note this CSVDataset cannot be used until
   * setCsvColumnNames() is called; that is an async method and so cannot be
   * incorporated into the constructor.  The static async create() method
   * solves this issue.
   *
   * @param input A `DataSource` providing a chunked, UTF8-encoded byte stream.
   */
  private constructor(protected readonly input: DataSource) {
    super();
    this.base = new TextLineDataset(input);
  }

  private setHasHeaderLine(hasHeaderLine: boolean) {
    this._hasHeaderLine = hasHeaderLine;
  }

  private setDelimiter(delimiter: string) {
    this._delimiter = delimiter;
  }

  private setDatatypes(dataTypes: DataType[]) {
    this._dataTypes = dataTypes;
  }

  get csvColumnNames(): string[] {
    return this._csvColumnNames;
  }

  /* 1) If csvColumnNames is provided as string[], use this string[] as output
   * keys in corresponded order, and each key must exist in header line if
   * hasHeaderLine is true.
   * 2) Otherwise parse header line as result keys if hasHeaderLine, or use
   * numbers.
   */
  private async setCsvColumnNames(csvColumnNames: CsvHeaderConfig|string[]) {
    if (Array.isArray(csvColumnNames)) {
      this._csvColumnNames = csvColumnNames;
      if (this._hasHeaderLine) {
        const iter = await this.base.iterator();
        const firstElement = await iter.next();
        if (firstElement.done) {
          throw new Error('No data was found for CSV parsing.');
        }
        const firstLine: string = firstElement.value;
        const columnNames = firstLine.split(this._delimiter);

        // Generate an array(this._selectColumnIndexes) which holds the
        // selected column indexes in order.
        for (let i = 0; i < csvColumnNames.length; i++) {
          const index = columnNames.indexOf(csvColumnNames[i]);
          if (index === -1) {
            throw new Error(
                'Provided column names does not match header line.');
          } else {
            this._selectColumnIndexes === null ?
                this._selectColumnIndexes = [index] :
                this._selectColumnIndexes.push(index);
          }
        }
      }
    } else {
      const iter = await this.base.iterator();
      const firstElement = await iter.next();
      if (firstElement.done) {
        throw new Error('No data was found for CSV parsing.');
      }
      const firstLine: string = firstElement.value;
      if (this._hasHeaderLine ||
          csvColumnNames === CsvHeaderConfig.READ_FIRST_LINE) {
        this._csvColumnNames = firstLine.split(this._delimiter);
      } else {
        this._csvColumnNames =
            (Array.from(
                 new Array(firstLine.split(this._delimiter).length).keys()))
                .map(x => x.toString());
      }
    }
  }

  /**
   * Create a `CSVDataset`.
   *
   * @param input A `DataSource` providing a chunked, UTF8-encoded byte stream.
   * @param header (Optional) A boolean value indicating whether the CSV
   *   files(s) have header line(s) that should be skipped when parsing.
   *   Defaults to `False`.
   * @param csvColumnNames The keys to use for the columns, in order. If this
   *   argument is provided and header is false, it is assumed that the input
   *   file does not have a header line providing the column names and use the
   *   elements in this argument as column names. If this argument is provided
   *   and header is true, only parse columns in this argument in corresponded
   *   order and column names in this argument must exist in the header line. If
   *   this argument is not provided (or is null or undefined), then the column
   *   names are read from the first line of the input.
   * @param dataTypes The types of the columns, in order. If this argument is
   *   provided, it is assumed that the values of input columns match the
   *   provided types. If this argument is not provided, the values will be
   *   converted to number, or string if NaN.
   * @param delimiter The string used to parse each line of the input file. If
   *   this argument is not provided, use default delimiter `,`.
   */
  static async create(
      input: DataSource, header = false,
      csvColumnNames: CsvHeaderConfig|string[] = CsvHeaderConfig.NUMBERED,
      dataTypes?: DataType[], delimiter = ',') {
    const result = new CSVDataset(input);
    result.setHasHeaderLine(header);
    result.setDelimiter(delimiter);
    if (dataTypes !== undefined && dataTypes.length !== 0) {
      result.setDatatypes(dataTypes);
    }
    await result.setCsvColumnNames(csvColumnNames);
    return result;
  }

  async iterator(): Promise<LazyIterator<DataElement>> {
    let lines = await this.base.iterator();
    if (this._hasHeaderLine) {
      // We previously read the first line to get the headers.
      // Now that we're providing data, skip it.
      lines = lines.skip(1);
    }
    return lines.map(x => this.makeDataElement(x));
  }

  makeDataElement(line: string): DataElement {
    // TODO(soergel): proper CSV parsing with escaping, quotes, etc.
    // TODO(soergel): alternate separators, e.g. for TSV
    const values = line.split(this._delimiter);
    const result: {[key: string]: ElementArray} = {};
    let datatypeIter = 0;

    for (let i = 0; i < this._csvColumnNames.length; i++) {
      const value =
          values[this._selectColumnIndexes === null ? i : this._selectColumnIndexes[i]];
      if (value === '') {
        result[this._csvColumnNames[i]] = undefined;
      } else {
        const valueAsNum = Number(value);
        if (isNaN(valueAsNum)) {
          if (this._dataTypes !== null &&
              this._dataTypes[datatypeIter] === DType.bool) {
            result[this._csvColumnNames[i]] = this.getBoolean(value);
          } else {
            // Set value as string
            result[this._csvColumnNames[i]] = value;
          }
          datatypeIter++;
        } else if (this._dataTypes === null) {
          result[this._csvColumnNames[i]] = valueAsNum;
        } else {
          switch (this._dataTypes[datatypeIter]) {
            case DType.float32:
              result[this._csvColumnNames[i]] = valueAsNum;
              break;
            case DType.int32:
              result[this._csvColumnNames[i]] = Math.floor(valueAsNum);
              break;
            case DType.bool:
              result[this._csvColumnNames[i]] = this.getBoolean(value);
              break;
            default:
              result[this._csvColumnNames[i]] = valueAsNum;
          }
          datatypeIter++;
        }
      }
    }
    return result;
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
