import { assertObject, assertFunction } from '../util/assertions';

/**
 * Iterates over each enumerable, non-inherited property of the object.
 *
 * @param {Object} obj - The object.
 * @param {eachFn} fn - The function to be called for each iteration.
 *
 * @returns {undefined}
 *
 * @callback eachFn
 *
 *   key  The key of the current entry.
 *   val  The value of the current entry.
 *   obj  A reference to the object.
 *
 * @example
 *
 *   Object.forEach({a:1,b:2}); -> Iterates over each property.
 *
 **/
export default function forEach(obj, fn) {
  assertObject(obj);
  assertFunction(fn);
  for (let [key, val] of Object.entries(obj)) {
    fn(key, val, obj);
  }
}
