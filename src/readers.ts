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

import {CSVDataset, CsvHeaderConfig} from './datasets/csv_dataset';
import {URLDataSource} from './sources/url_data_source';

/**
 * Create a `CSVDataset` by reading and decoding CSV file(s) from provided URLs.
 *
 * @param source One or more URLs to read CSV file(s).
 * @param header (Optional) A boolean value indicating whether the CSV files(s)
 *   have header line(s) that should be skipped when parsing. Defaults to
 *   `False`.
 * @param dataTypes (Optional) The types of the columns, in order.
 * @param delimiter (Optional) The string used to parse each line of the input
 *   file. Defaults to `,`.
 * @param selectColumns (Optional) A sorted list of column indices to select
 *   from the input data. If specified, only this subset of columns will be
 *   parsed. Defaults to parsing all columns.
 */
export function csv(
    source: string, header = false, dataTypes?: DataType[], delimiter = ',',
    selectColumns?: string[]): Promise<CSVDataset> {
  return CSVDataset.create(
      new URLDataSource(source), header,
      selectColumns ? CsvHeaderConfig.READ_FIRST_LINE :
                      CsvHeaderConfig.NUMBERED,
      dataTypes, delimiter);
}
