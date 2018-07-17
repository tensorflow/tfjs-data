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

import {FileDataSource} from '../sources/file_data_source';

import {CSVDataset, CsvHeaderConfig} from './csv_dataset';

const csvData = `ab,cd,ef
ghi,,jkl
,mn,op
1.4,7.8,12
qrs,tu,
v,w,x
y,z`;

const csvDataExtra = `A,B,C
1,2,3
2,2,3
3,2,3
4,2,3
5,2,3
6,2,3
7,2,3`;

const csvDataWithHeaders = `foo,bar,baz
` + csvData;

const csvBlob = new Blob([csvData]);

const csvBlobWithHeaders = new Blob([csvDataWithHeaders]);

const csvBlobWithHeadersExtra = new Blob([csvDataExtra]);

describe('CSVDataset', () => {
  it('produces a stream of dicts containing UTF8-decoded csv data', done => {
    const source = new FileDataSource(csvBlob, {chunkSize: 10});
    const datasetPromise = CSVDataset.create(source, ['foo', 'bar', 'baz']);
    datasetPromise.then(dataset => {
      expect(dataset.csvColumnNames).toEqual(['foo', 'bar', 'baz']);
      dataset.iterator()
          .collectRemaining()
          .then(result => {
            expect(result).toEqual([
              {'foo': 'ab', 'bar': 'cd', 'baz': 'ef'},
              {'foo': 'ghi', 'bar': undefined, 'baz': 'jkl'},
              {'foo': undefined, 'bar': 'mn', 'baz': 'op'},
              {'foo': 1.4, 'bar': 7.8, 'baz': 12},
              {'foo': 'qrs', 'bar': 'tu', 'baz': undefined},
              {'foo': 'v', 'bar': 'w', 'baz': 'x'},
              {'foo': 'y', 'bar': 'z', 'baz': undefined},
            ]);
          })
          .then(done)
          .catch(done.fail);
    });
  });
  it('reads CSV column headers when requested', done => {
    const source = new FileDataSource(csvBlobWithHeaders, {chunkSize: 10});
    const datasetPromise =
        CSVDataset.create(source, CsvHeaderConfig.READ_FIRST_LINE);
    datasetPromise.then(dataset => {
      expect(dataset.csvColumnNames).toEqual(['foo', 'bar', 'baz']);
      dataset.iterator()
          .collectRemaining()
          .then(result => {
            expect(result).toEqual([
              {'foo': 'ab', 'bar': 'cd', 'baz': 'ef'},
              {'foo': 'ghi', 'bar': undefined, 'baz': 'jkl'},
              {'foo': undefined, 'bar': 'mn', 'baz': 'op'},
              {'foo': 1.4, 'bar': 7.8, 'baz': 12},
              {'foo': 'qrs', 'bar': 'tu', 'baz': undefined},
              {'foo': 'v', 'bar': 'w', 'baz': 'x'},
              {'foo': 'y', 'bar': 'z', 'baz': undefined},
            ]);
          })
          .then(done)
          .catch(done.fail);
    });
  });
  it('numbers CSV columns by default', done => {
    const source = new FileDataSource(csvBlob, {chunkSize: 10});
    const datasetPromise = CSVDataset.create(source);
    datasetPromise.then(dataset => {
      expect(dataset.csvColumnNames).toEqual(['0', '1', '2']);
      dataset.iterator()
          .collectRemaining()
          .then(result => {
            expect(result).toEqual([
              {'0': 'ab', '1': 'cd', '2': 'ef'},
              {'0': 'ghi', '1': undefined, '2': 'jkl'},
              {'0': undefined, '1': 'mn', '2': 'op'},
              {'0': 1.4, '1': 7.8, '2': 12},
              {'0': 'qrs', '1': 'tu', '2': undefined},
              {'0': 'v', '1': 'w', '2': 'x'},
              {'0': 'y', '1': 'z', '2': undefined},
            ]);
          })
          .then(done)
          .catch(done.fail);
    });
  });

  // it('does map', async () => {
  //   const source = 
  //       new FileDataSource(csvBlobWithHeadersExtra, {chunkSize: 10});
  //   const ds = await
  //       CSVDataset.create(source, CsvHeaderConfig.READ_FIRST_LINE);
  //   expect(ds.csvColumnNames).toEqual(['A', 'B', 'C']);
  //   const csvIterator = ds.iterator();
  //   console.log(await csvIterator.next());
  //   console.log(await csvIterator.next());
  //   console.log(await csvIterator.next());
  //   console.log(await csvIterator.next());
  //   console.log(await csvIterator.next());
  //   console.log(await csvIterator.next());
  //   console.log(await csvIterator.next());

  // });

  it('array of promises', async () => {
    const source = 
        new FileDataSource(csvBlobWithHeadersExtra, {chunkSize: 10});
    const ds = await
        CSVDataset.create(source, CsvHeaderConfig.READ_FIRST_LINE);
    expect(ds.csvColumnNames).toEqual(['A', 'B', 'C']);
    const csvIterator = ds.iterator();
    const promises = [csvIterator.next(), csvIterator.next(),
      csvIterator.next(),csvIterator.next(),csvIterator.next()];
    const elements = await Promise.all(promises);
    elements.forEach(x => console.log(x));

  });
});