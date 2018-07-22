
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

// tslint:disable:max-line-length
import {iteratorFromConcatenated, iteratorFromConcatenatedFunction, iteratorFromFunction, iteratorFromIncrementing, iteratorFromItems, OrderedLazyIterator} from './ordered_iterator';
// tslint:enable:max-line-length

export class TestIntegerIterator extends OrderedLazyIterator<number> {
  currentIndex = 0;
  data: number[];

  constructor(protected readonly length = 100) {
    super();
    this.data = Array.from({length}, (v, k) => k);
  }

  async next(): Promise<IteratorResult<number>> {
    if (this.currentIndex >= this.length) {
      return {value: null, done: true};
    }
    const result = this.data[this.currentIndex];
    this.currentIndex++;
    // Sleep for a millisecond every so often.
    // This purposely scrambles the order in which these promises are resolved,
    // to demonstrate that the various methods still process the stream
    // in the correct order.
    if (Math.random() < 0.1) {
      await new Promise(res => setTimeout(res, 1));
    }
    return {value: result, done: false};
  }
}

describe('LazyIterator', () => {
  it('collects all stream elements into an array', done => {
    const readIterator = new TestIntegerIterator();
    readIterator.collect()
        .then(result => {
          expect(result.length).toEqual(100);
        })
        .then(done)
        .catch(done.fail);
  });

  it('reads chunks in order', done => {
    const readIterator = new TestIntegerIterator();
    readIterator.collect()
        .then(result => {
          expect(result.length).toEqual(100);
          for (let i = 0; i < 100; i++) {
            expect(result[i]).toEqual(i);
          }
        })
        .then(done)
        .catch(done.fail);
  });

  it('filters elements', async () => {
    const readIterator = new TestIntegerIterator().filter(x => x % 2 === 0);
    const result = await readIterator.collect();
    expect(result.length).toEqual(50);
    for (let i = 0; i < 50; i++) {
      expect(result[i]).toEqual(2 * i);
    }
  });

  it('maps elements', done => {
    const readIterator = new TestIntegerIterator().map(x => `item ${x}`);
    readIterator.collect()
        .then(result => {
          expect(result.length).toEqual(100);
          for (let i = 0; i < 100; i++) {
            expect(result[i]).toEqual(`item ${i}`);
          }
        })
        .then(done)
        .catch(done.fail);
  });

  it('flatmaps simple elements', done => {
    const readStream = new TestIntegerIterator().flatmap(
        x => [`item ${x} A`, `item ${x} B`, `item ${x} C`]);
    readStream.collect()
        .then(result => {
          expect(result.length).toEqual(300);
          for (let i = 0; i < 100; i++) {
            expect(result[3 * i + 0]).toEqual(`item ${i} A`);
            expect(result[3 * i + 1]).toEqual(`item ${i} B`);
            expect(result[3 * i + 2]).toEqual(`item ${i} C`);
          }
        })
        .then(done)
        .catch(done.fail);
  });

  it('flatmap flattens object elements but not their contents', done => {
    const readStream = new TestIntegerIterator().flatmap(
        x =>
            [{foo: `foo ${x} A`, bar: `bar ${x} A`},
             {foo: `foo ${x} B`, bar: `bar ${x} B`},
             {foo: `foo ${x} C`, bar: `bar ${x} C`},
    ]);
    readStream.collect()
        .then(result => {
          expect(result.length).toEqual(300);
          for (let i = 0; i < 100; i++) {
            expect(result[3 * i + 0])
                .toEqual({foo: `foo ${i} A`, bar: `bar ${i} A`});
            expect(result[3 * i + 1])
                .toEqual({foo: `foo ${i} B`, bar: `bar ${i} B`});
            expect(result[3 * i + 2])
                .toEqual({foo: `foo ${i} C`, bar: `bar ${i} C`});
          }
        })
        .then(done)
        .catch(done.fail);
  });

  it('flatmap flattens array elements but not their contents', done => {
    const readStream = new TestIntegerIterator().flatmap(
        x => [
            [`foo ${x} A`, `bar ${x} A`],
            [`foo ${x} B`, `bar ${x} B`],
            [`foo ${x} C`, `bar ${x} C`],
    ]);
    readStream.collect()
        .then(result => {
          expect(result.length).toEqual(300);
          for (let i = 0; i < 100; i++) {
            expect(result[3 * i + 0]).toEqual([`foo ${i} A`, `bar ${i} A`]);
            expect(result[3 * i + 1]).toEqual([`foo ${i} B`, `bar ${i} B`]);
            expect(result[3 * i + 2]).toEqual([`foo ${i} C`, `bar ${i} C`]);
          }
        })
        .then(done)
        .catch(done.fail);
  });

  it('batches elements', done => {
    const readIterator = new TestIntegerIterator().batch(8);
    readIterator.collect()
        .then(result => {
          expect(result.length).toEqual(13);
          for (let i = 0; i < 12; i++) {
            expect(result[i]).toEqual(
                Array.from({length: 8}, (v, k) => (i * 8) + k));
          }
          expect(result[12]).toEqual([96, 97, 98, 99]);
        })
        .then(done)
        .catch(done.fail);
  });

  it('can be limited to a certain number of elements', done => {
    const readIterator = new TestIntegerIterator().take(8);
    readIterator.collect()
        .then(result => {
          expect(result).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        })
        .then(done)
        .catch(done.fail);
  });

  it('is unaltered by a negative or undefined take() count.', done => {
    const baseIterator = new TestIntegerIterator();
    const readIterator = baseIterator.take(-1);
    readIterator.collect()
        .then(result => {
          expect(result).toEqual(baseIterator.data);
        })
        .then(done)
        .catch(done.fail);
    const baseIterator2 = new TestIntegerIterator();
    const readIterator2 = baseIterator2.take(undefined);
    readIterator2.collect()
        .then(result => {
          expect(result).toEqual(baseIterator2.data);
        })
        .then(done)
        .catch(done.fail);
  });

  it('can skip a certain number of elements', done => {
    const readIterator = new TestIntegerIterator().skip(88).take(8);
    readIterator.collect()
        .then(result => {
          expect(result).toEqual([88, 89, 90, 91, 92, 93, 94, 95]);
        })
        .then(done)
        .catch(done.fail);
  });

  it('is unaltered by a negative or undefined skip() count.', done => {
    const baseIterator = new TestIntegerIterator();
    const readIterator = baseIterator.skip(-1);
    readIterator.collect()
        .then(result => {
          expect(result).toEqual(baseIterator.data);
        })
        .then(done)
        .catch(done.fail);
    const baseIterator2 = new TestIntegerIterator();
    const readIterator2 = baseIterator2.skip(undefined);
    readIterator2.collect()
        .then(result => {
          expect(result).toEqual(baseIterator2.data);
        })
        .then(done)
        .catch(done.fail);
  });

  it('can be created from an array', done => {
    const readIterator = iteratorFromItems([1, 2, 3, 4, 5, 6]);
    readIterator.collect()
        .then(result => {
          expect(result).toEqual([1, 2, 3, 4, 5, 6]);
        })
        .then(done)
        .catch(done.fail);
  });

  it('can be created from a function', done => {
    let i = -1;
    const func = () =>
        ++i < 7 ? {value: i, done: false} : {value: null, done: true};

    const readIterator = iteratorFromFunction(func);
    readIterator.collect()
        .then(result => {
          expect(result).toEqual([0, 1, 2, 3, 4, 5, 6]);
        })
        .then(done)
        .catch(done.fail);
  });

  it('can be created with incrementing integers', done => {
    const readIterator = iteratorFromIncrementing(0).take(7);
    readIterator.collect()
        .then(result => {
          expect(result).toEqual([0, 1, 2, 3, 4, 5, 6]);
        })
        .then(done)
        .catch(done.fail);
  });

  it('can be concatenated', done => {
    const a = iteratorFromItems([1, 2, 3]);
    const b = iteratorFromItems([4, 5, 6]);
    const readIterator = a.concatenate(b);
    readIterator.collect()
        .then(result => {
          expect(result).toEqual([1, 2, 3, 4, 5, 6]);
        })
        .then(done)
        .catch(done.fail);
  });

  it('can be created by concatenating streams', done => {
    const a = new TestIntegerIterator();
    const b = new TestIntegerIterator();
    const readIterator = iteratorFromConcatenated(iteratorFromItems([a, b]));
    readIterator.collect()
        .then(result => {
          expect(result.length).toEqual(200);
        })
        .then(done)
        .catch(done.fail);
  });

  it('can be created by concatenating streams from a function', done => {
    const readIterator = iteratorFromConcatenatedFunction(
        () => ({value: new TestIntegerIterator(), done: false}), 3);
    const expectedResult: number[] = [];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 100; j++) {
        expectedResult[i * 100 + j] = j;
      }
    }

    readIterator.collect()
        .then(result => {
          expect(result).toEqual(expectedResult);
        })
        .then(done)
        .catch(done.fail);
  });
});
