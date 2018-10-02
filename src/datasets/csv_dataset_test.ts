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

import {ENV} from '@tensorflow/tfjs-core';
import {DType} from '@tensorflow/tfjs-core/dist/types';

import {FileDataSource} from '../sources/file_data_source';

import {CSVDataset, CsvHeaderConfig} from './csv_dataset';

const csvString = `ab,cd,ef
ghi,,jkl
,mn,op
1.4,7.8,12
qrs,tu,
v,w,x
y,z`;

const csvStringWithHeaders = `foo,bar,baz
` + csvString;

const csvData =
    ENV.get('IS_BROWSER') ? new Blob([csvString]) : Buffer.from(csvString);

const csvDataWithHeaders = ENV.get('IS_BROWSER') ?
    new Blob([csvStringWithHeaders]) :
    Buffer.from(csvStringWithHeaders);

const csvDataExtra = `A,B,C
1,2,3
2,2,3
3,2,3
4,2,3
5,2,3
6,2,3
7,2,3`;

const csvDataSemicolon = `A;B;C
1;2;3
2;2;3
3;2;3
4;2;3
5;2;3
6;2;3
7;2;3`;

const csvMixedType = `1,True,3
2,False,2
3,True,1
1,False,3
2,True,2
3,False,1
1,True,3
2,False,2`;

const csvDataWithHeadersExtra = ENV.get('IS_BROWSER') ?
    new Blob([csvDataExtra]) :
    Buffer.from(csvDataExtra);
const csvBlobWithSemicolon = ENV.get('IS_BROWSER') ?
    new Blob([csvDataSemicolon]) :
    Buffer.from(csvDataSemicolon);
const csvBlobWithMixedType = ENV.get('IS_BROWSER') ? new Blob([csvMixedType]) :
                                                     Buffer.from(csvMixedType);

describe('CSVDataset', () => {
  it('produces a stream of dicts containing UTF8-decoded csv data',
     async () => {
       const source = new FileDataSource(csvData, {chunkSize: 10});
       const dataset =
           await CSVDataset.create(source, false, ['foo', 'bar', 'baz']);

       expect(dataset.csvColumnNames).toEqual(['foo', 'bar', 'baz']);

       const iter = await dataset.iterator();
       const result = await iter.collect();

       expect(result).toEqual([
         {'foo': 'ab', 'bar': 'cd', 'baz': 'ef'},
         {'foo': 'ghi', 'bar': undefined, 'baz': 'jkl'},
         {'foo': undefined, 'bar': 'mn', 'baz': 'op'},
         {'foo': 1.4, 'bar': 7.8, 'baz': 12},
         {'foo': 'qrs', 'bar': 'tu', 'baz': undefined},
         {'foo': 'v', 'bar': 'w', 'baz': 'x'},
         {'foo': 'y', 'bar': 'z', 'baz': undefined},
       ]);
     });

  it('reads CSV column headers when requested', async () => {
    const source = new FileDataSource(csvDataWithHeaders, {chunkSize: 10});
    const dataset =
        await CSVDataset.create(source, true, CsvHeaderConfig.READ_FIRST_LINE);

    expect(dataset.csvColumnNames).toEqual(['foo', 'bar', 'baz']);
    const iter = await dataset.iterator();
    const result = await iter.collect();

    expect(result).toEqual([
      {'foo': 'ab', 'bar': 'cd', 'baz': 'ef'},
      {'foo': 'ghi', 'bar': undefined, 'baz': 'jkl'},
      {'foo': undefined, 'bar': 'mn', 'baz': 'op'},
      {'foo': 1.4, 'bar': 7.8, 'baz': 12},
      {'foo': 'qrs', 'bar': 'tu', 'baz': undefined},
      {'foo': 'v', 'bar': 'w', 'baz': 'x'},
      {'foo': 'y', 'bar': 'z', 'baz': undefined},
    ]);
  });

  it('numbers CSV columns by default', async () => {
    const source = new FileDataSource(csvData, {chunkSize: 10});
    const dataset = await CSVDataset.create(source);
    expect(dataset.csvColumnNames).toEqual(['0', '1', '2']);
    const iter = await dataset.iterator();
    const result = await iter.collect();

    expect(result).toEqual([
      {'0': 'ab', '1': 'cd', '2': 'ef'},
      {'0': 'ghi', '1': undefined, '2': 'jkl'},
      {'0': undefined, '1': 'mn', '2': 'op'},
      {'0': 1.4, '1': 7.8, '2': 12},
      {'0': 'qrs', '1': 'tu', '2': undefined},
      {'0': 'v', '1': 'w', '2': 'x'},
      {'0': 'y', '1': 'z', '2': undefined},
    ]);
  });

  it('emits rows in order despite async requests', async () => {
    const source = new FileDataSource(csvDataWithHeadersExtra, {chunkSize: 10});
    const ds =
        await CSVDataset.create(source, true, CsvHeaderConfig.READ_FIRST_LINE);
    expect(ds.csvColumnNames).toEqual(['A', 'B', 'C']);
    const csvIterator = await ds.iterator();
    const promises = [
      csvIterator.next(), csvIterator.next(), csvIterator.next(),
      csvIterator.next(), csvIterator.next()
    ];
    const elements = await Promise.all(promises);
    expect(elements[0].value).toEqual({A: 1, B: 2, C: 3});
    expect(elements[1].value).toEqual({A: 2, B: 2, C: 3});
    expect(elements[2].value).toEqual({A: 3, B: 2, C: 3});
    expect(elements[3].value).toEqual({A: 4, B: 2, C: 3});
    expect(elements[4].value).toEqual({A: 5, B: 2, C: 3});
  });

  it('provide delimiter through parameter', async () => {
    const source = new FileDataSource(csvBlobWithSemicolon, {chunkSize: 10});
    const dataset = await CSVDataset.create(
        source, true, CsvHeaderConfig.READ_FIRST_LINE, undefined, ';');
    expect(dataset.csvColumnNames).toEqual(['A', 'B', 'C']);
    const iter = await dataset.iterator();
    const result = await iter.collect();

    expect(result[0]).toEqual({A: 1, B: 2, C: 3});
    expect(result[1]).toEqual({A: 2, B: 2, C: 3});
    expect(result[2]).toEqual({A: 3, B: 2, C: 3});
    expect(result[3]).toEqual({A: 4, B: 2, C: 3});
    expect(result[4]).toEqual({A: 5, B: 2, C: 3});
  });

  it('provide datatype through parameter to parse different types',
     async () => {
       const source = new FileDataSource(csvBlobWithMixedType, {chunkSize: 10});
       const dataset = await CSVDataset.create(
           source, false, undefined, [DType.int32, DType.bool, DType.int32]);
       expect(dataset.csvColumnNames).toEqual(['0', '1', '2']);
       const iter = await dataset.iterator();
       const result = await iter.collect();

       expect(result).toEqual([
         {'0': 1, '1': 1, '2': 3},
         {'0': 2, '1': 0, '2': 2},
         {'0': 3, '1': 1, '2': 1},
         {'0': 1, '1': 0, '2': 3},
         {'0': 2, '1': 1, '2': 2},
         {'0': 3, '1': 0, '2': 1},
         {'0': 1, '1': 1, '2': 3},
         {'0': 2, '1': 0, '2': 2},
       ]);
     });

  it('reads CSV with selected column in order', async () => {
    const source = new FileDataSource(csvDataWithHeaders, {chunkSize: 10});
    const dataset = await CSVDataset.create(source, true, ['bar', 'foo']);

    expect(dataset.csvColumnNames).toEqual(['bar', 'foo']);
    const iter = await dataset.iterator();
    const result = await iter.collect();

    expect(result).toEqual([
      {'bar': 'cd', 'foo': 'ab'},
      {'bar': undefined, 'foo': 'ghi'},
      {'bar': 'mn', 'foo': undefined},
      {'bar': 7.8, 'foo': 1.4},
      {'bar': 'tu', 'foo': 'qrs'},
      {'bar': 'w', 'foo': 'v'},
      {'bar': 'z', 'foo': 'y'},
    ]);
  });

  it('reads CSV with wrong column', async done => {
    try {
      const source = new FileDataSource(csvDataWithHeaders, {chunkSize: 10});
      await CSVDataset.create(source, true, ['bar', 'foooooooo']);
      done.fail();
    } catch (e) {
      expect(e.message).toEqual(
          'Provided column names does not match header line.');
      done();
    }
  });
});
