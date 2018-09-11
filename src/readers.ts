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
 */
export function csv(
    source: string|string[], header = false, dataTypes?: DataType[],
    delimiter = ','): Array<Promise<CSVDataset>> {
  const sources = (source instanceof Array) ? source : [source];
  return makeCsvDataset(
      sources, header, dataTypes === null ? [] : dataTypes, delimiter);
}

function makeCsvDataset(
    sources: string[], header: boolean, dataTypes: DataType[],
    delimiter: string): Array<Promise<CSVDataset>> {
  return sources.map(async (source) => {
    return CSVDataset.create(
        new URLDataSource(source),
        header ? CsvHeaderConfig.READ_FIRST_LINE : CsvHeaderConfig.NUMBERED);
  });
}
