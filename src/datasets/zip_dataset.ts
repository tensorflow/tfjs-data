// tslint:disable:max-line-length
import {DatasetContainer, iteratorFromZipped, ZipMismatchMode} from '../stateful_iterators/zip_iterator';
import {DataElement} from '../types';
import {deepMapAndAwaitAll, isIterable} from '../util/deep_map';

import {Dataset, datasetFromIteratorFn} from './dataset';
// tslint:enable:max-line-length

/**
 * Create a `Dataset` by zipping together an array, dict, or nested
 * structure of `Dataset`s (and perhaps additional constants).
 * The underlying datasets must provide elements in a consistent order such that
 * they correspond.
 *
 * The number of elements in the resulting dataset is the same as the size of
 * the smallest dataset in `datasets`.
 *
 * The nested structure of the `datasets` argument determines the
 * structure of elements in the resulting iterator.
 *
 * Note this means that, given an array of two datasets that produce dict
 * elements, the result is a dataset that produces elements that are arrays
 * of two dicts:
 *
 * const ds1 : Dataset = ...;  // produces elements like {a: ...}
 * const ds1 : Dataset = ...;  // produces elements like {b: ...}
 * const ds3 = zip([ds1, ds2]);  // produces elements like [{a: ...}, {b: ...}]
 *
 * If the goal is to merge the dicts in order to produce elements like
 * {a: ..., b: ...}, this requires a second step such as:
 *
 * const ds4 = ds3.map(x=>{a: x[0].a, b: x[1].b});
 */
export function zip(datasets: DatasetContainer): Dataset<DataElement> {
  // manually type-check the argument for JS users
  if (!isIterable(datasets)) {
    throw new Error('The argument to zip() must be an object or array.');
  }
  return datasetFromIteratorFn(async () => {
    const streams = await deepMapAndAwaitAll(datasets, d => {
      if (d instanceof Dataset) {
        return {value: d.iterator(), recurse: false};
      } else if (isIterable(d)) {
        return {value: null, recurse: true};
      } else {
        throw new Error(
            'Leaves of the structure passed to zip() must be Datasets, ' +
            'not primitives.');
      }
    });
    return iteratorFromZipped(streams, ZipMismatchMode.SHORTEST);
  });
}
