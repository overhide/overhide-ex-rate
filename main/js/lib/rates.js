"use strict";

const log = require('./log.js').fn("rates");

const CoinGecko = require('coingecko-api');
const CoinGeckoClient = new CoinGecko();

// private attribtues
const ctx = Symbol('context');
const lookbackMillis = Symbol('lookbackMillis');
const floorCoefficient = Symbol('floorCoefficient');
const period = Symbol('period');


// private functions
const checkInit = Symbol('checkInit');
const mapCurrencyToCoinGecko = Symbol('mapCurrencyToCoinGecko');
const roundToPeriod = Symbol('roundToPeriod');

/**
 * Wires up functionality we use throughout.
 * 
 * Module returns this class as object all wired-up.  Before you can use the methods you must "init" the object 
 * somewhere at process start.
 * 
 * Leverages node's module system for a sort of context & dependency injection, so order of requiring and initializing
 * these sorts of libraries matters.
 */
class Normalize {
  constructor() {
    this[ctx] = null;
    this[lookbackMillis] = 1000 * 60 * 60 * 24 * 89; // 89 days
    this[period] = 1000 * 60 * 60; // 1 hour

  }

  // ensure this is initialized
  [checkInit]() {
    if (! this[ctx]) throw new Error('library not initialized, call "init" when wiring up app first');
  }

  // map currency code from API to CoinGecko
  [mapCurrencyToCoinGecko](currency) {
    switch(currency) {
      case 'eth':
        return 'ethereum';
      default:
        throw new `unsupported currency ${currency}`;
    }
  }

  /**
   * @param {number} epochTime -- epoch time (millis) to normalize
   * @returns {number} rounded down epoch times in millis
   */
   [roundToPeriod](epochTime) {
    return Math.floor(epochTime / this[period]) * this[period];
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
   * @param {string} currency -- the "from" currency to retrieve rates for; to US dollars.
   * @param {[Date, ..]} timestamps -- list of dates to fetch data for
   * @returns {[{timestamp: number, rate: float},..]} list of timestamp+rate objects: could be for more timestamps than passed in.
   */
  async get(currency, timestamps) {
    currency = this[mapCurrencyToCoinGecko](currency);
    const orderedEpochsRecentToAncient = timestamps
      .map(t => t.getTime())
      .map(t => this[roundToPeriod](t))
      .sort((a,b) => b - a);
    const rates = {};
    for (const epoch of orderedEpochsRecentToAncient) {
      if (epoch in rates) continue;
      var fromEpoch = epoch - this[lookbackMillis];
      log(`processing data for ${currency} from ${(new Date(fromEpoch)).toISOString()} to ${(new Date(epoch)).toISOString()}`);
      const data = (await CoinGeckoClient.coins.fetchMarketChartRange(currency, {from: fromEpoch / 1000, to: epoch / 1000, vs_currency: 'usd'})).data;
      if (! ('prices' in data)) break;
      if (! Array.isArray(data.prices) || data.prices.length === 0) break;
      const pricesInMillis = data.prices;
      var pricesInDescendingEpochOrder = pricesInMillis.sort((a, b) => b[0] - a[0]);
      let currentEpoch = epoch;
      while (currentEpoch >= fromEpoch) {
        while (pricesInDescendingEpochOrder.length > 0) {
          if (pricesInDescendingEpochOrder[0][0] > currentEpoch) {
            pricesInDescendingEpochOrder = pricesInDescendingEpochOrder.slice(1);
          } else {
            rates[currentEpoch] = pricesInDescendingEpochOrder[0][1];
            break;
          }
        }
        if (pricesInDescendingEpochOrder.length === 0 ) break;
        currentEpoch -= this[period];
      }
    }    
    return Object.keys(rates).map(k => {return {timestamp: +k, rate: rates[k]};});
  }

  /**
   * @returns {string} null if no error else error string if problem using DB from connection pool.
   */
   async getError() {
    this[checkInit]();
    try {
      await CoinGecko.ping();
      return null;
    } catch (err) {
      log(`not healthy: ${String(err)}`);
      return String(err);
    } 
  }  
}

module.exports = (new Normalize());