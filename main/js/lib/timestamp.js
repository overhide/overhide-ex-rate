"use strict";

// private attribtues
const ctx = Symbol('context');
const floorCoefficient = Symbol('floorCoefficient');     // timestamps normalized to 1 hour (floor)
const sampleDeltaMillis = Symbol('sampleDeltaMillis');   // number millis between samples
const minMaxWindowMillis = Symbol('minMaxWindowMillis'); // span of lookback window (since timestamp) for min-max sampling

// private functions
const checkInit = Symbol('checkInit');

/**
 * Wires up functionality we use throughout.
 * 
 * Module returns this class as object all wired-up.  Before you can use the methods you must "init" the object 
 * somewhere at process start.
 * 
 * Leverages node's module system for a sort of context & dependency injection, so order of requiring and initializing
 * these sorts of libraries matters.
 */
class Timestamp {
  constructor() {
    this[ctx] = null;
    this[floorCoefficient] = 1000 * 60 * 60; 
    this[sampleDeltaMillis] = 1000 * 60 * 60;
    this[minMaxWindowMillis] = 1000 * 60 * 60 * 3;
  }

  // ensure this is initialized
  [checkInit]() {
    if (! this[ctx]) throw new Error('library not initialized, call "init" when wiring up app first');
  }

  /**
   * Initialize this library: this must be the first method called somewhere from where you're doing context & dependency
   * injection.
   * 
   * @return this
   */
  init() {
    this[ctx] = {};
    return this;
  }

  /**
   * @param {number} epochTime -- epoch time (millis) to normalize
   * @returns {number} normalized epoch times in millis
   */
  normalize(epochTime) {
    return Math.floor(epochTime / this[floorCoefficient]) * this[floorCoefficient];
  }

  /**
   * @param {number} epochTime -- epoch time (millis) to expand into a list of epoch times (millis) that will be sampled for min/max.
   * @returns [{number}] epoch times in window for min/max.
   */
  expandWindowForMinMaxSamples(epochTime) {
    const earliestMillis = epochTime - this[minMaxWindowMillis];
    var addingTimestamp = epochTime;
    var result = new Set();
    while (earliestMillis <= addingTimestamp) {
      result.add(addingTimestamp);
      addingTimestamp -= this[sampleDeltaMillis];
    }
    return [...result];
  }

  /**
   * @param {[number]} timestamps -- list of timestamps to retrieve min/max ratest for
   * @param {[number]:number} ratesByEpoch  -- hash table of currency to USD rates by epoch time (millis): must have epoch keys to cover the whole expanded time window
   * @returns {[{timestamp: <ISO8601 timestamp>, minrate: <float>, maxrate: <float>},..]} whereby `minrate` indicates
   *           the lowest conversion rate between *currency* and USD seen within a time window  until the `timestamp`
   *           and `maxrate` indicates the highest conversion rate within same.
   */
  getMinMaxForEachTimestamp(timestamps, ratesByEpoch) {
    const epochsWithRates = Object.keys(ratesByEpoch).map(k => {return {timestamp: k, rate: ratesByEpoch[k]};});
    const minEpochWithRatesTimestamp = Math.min(...epochsWithRates.map(e => e.timestamp));
    return timestamps.map(t => {
      const minEpoch = this.normalize(t) - this[minMaxWindowMillis];
      if (minEpoch < minEpochWithRatesTimestamp) throw `rates do not cover expanded time window (time window start:${minEpoch})(min known rate:${minEpochWithRatesTimestamp})`;
      const minVal = epochsWithRates.reduce((acc, next) => next.timestamp >= minEpoch && next.timestamp < t && next.rate < acc ? next.rate : acc, Number.MAX_SAFE_INTEGER);
      const maxVal = epochsWithRates.reduce((acc, next) => next.timestamp >= minEpoch && next.timestamp < t && next.rate > acc ? next.rate : acc, 0);
      return {timestamp: t, minrate: minVal, maxrate: maxVal};
    });
  }
}

module.exports = (new Timestamp());