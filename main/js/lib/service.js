"use strict";

const timestamp = require('./timestamp.js');
const rates = require('./rates.js');
const database = require('./database.js');
const debug = require('./log.js').debug_fn("service");

// private attribtues
const ctx = Symbol('context');

// private functions
const checkInit = Symbol('checkInit');
const validateCurrency = Symbol('validateCurrency');
const getRateParams = Symbol('getTallyParams');
const getTallyParams = Symbol('getTallyParams');
const getRates = Symbol('getRates');
const getBaseCurrency = Symbol('validateCurrency');
const getRateMultiplier = Symbol('getRateMultiplier');

/**
 * Wires up functionality we use throughout.
 * 
 * Module returns this class as object all wired-up.  Before you can use the methods you must "init" the object 
 * somewhere at process start.
 * 
 * Leverages node's module system for a sort of context & dependency injection, so order of requiring and initializing
 * these sorts of libraries matters.
 */
class Service {
  constructor() {
    this[ctx] = null;
  }

  // ensure this is initialized
  [checkInit]() {
    if (! this[ctx]) throw new Error('library not initialized, call "init" when wiring up app first');
  }

  /**
   * @param {*} currency 
   */
  [validateCurrency](currency) {
    if (!currency || typeof currency !== 'string' || !currency.match(/eth|wei|btc|sat/)) throw `invalid currency, only 'eth', 'wei', 'btc', 'sat' supported`;
  }

  /**
   * @param {{params: {currency:.., values:[..]}}} req -- the request
   * @param {string} prefix -- for tracing
   * @returns {[currency, values]} parsed out and vetted params
   * @throws string exceptions on validation error.
   */
  [getTallyParams](req, prefix) {
    var params = req.params;
    var currency = params['currency'];      
    var values = params['values'];
    debug(`GET /${prefix} <= %o`, params);
    this[validateCurrency](currency);
    if (!values || typeof values !== 'string') throw `invalid values, must be a comma separated list of values at ISO8601 strings`;
    values = values.split(',');
    if (values.some(t => !t.match(/[0-9]+(.[0-9]+)?@....-..-..[tT ]..:..:..(\..+)?Z/))) throw `not all values match '<amount>@YYYY-MM-DDThh:mm:ss.mmmZ'`;      
    return [currency, values];
  }

  /**
   * @param {{params: {currency:.., values:[..]}}} req -- the request
   * @returns {[currency, timestamps]} parsed out and vetted params
   * @throws string exceptions on validation error.
   */
  [getRateParams](req) {
    var params = req.params;
    var currency = params['currency'];      
    var timestamps = params['timestamps'];
    debug('GET /rates <= %o', params);
    this[validateCurrency](currency);
    if (!timestamps || typeof timestamps !== 'string') throw `invalid timestamps, must be a comma separated list of ISO8601 strings`;
    timestamps = timestamps.split(',');
    if (timestamps.some(t => !t.match(/....-..-..[tT ]..:..:..(\..+)?Z/))) throw `not all timestamps match 'YYYY-MM-DDThh:mm:ss.mmmZ'`;      
    return [currency, timestamps];
  }
  
  /**
   * @param {string} currency -- to validate
   * @throws if currency invalid
   * @returns {string} base currency, e.g. 'eth' or 'btc' instead of lower denominations
   */
  [getBaseCurrency](currency) {
    if (['eth','wei'].includes(currency)) return 'eth';
    if (['btc','sat'].includes(currency)) return 'btc';
    throw `invalid currency`;
  }

  /**
   * @param {string} currency -- to get rate multiplier for (must be lowercase)
   * @returns {number} rate multiplier from base currency to denomination as per 'currency'
   */
  [getRateMultiplier](currency) {
    switch(currency) {
      case 'wei':
        return 1 / 1000000000000000000;          
      case 'sat':
        return 1 / 100000000;
      default:
        return 1;
    }    
  }

  /**
   * @param {[date strings]} timestamps -- dates as strings
   * @param {string} currency 
   * @returns {[{timestamp: <number (epoch time millis)>, minrate: <float>, maxrate: <float>},..]} whereby `minrate` indicates
   *           the lowest conversion rate between *currency* and USD seen within a time window  until the `timestamp`
   *           and `maxrate` indicates the highest conversion rate within same.
   */
  async [getRates](timestamps, currency) {
    timestamps = timestamps.map(t => Date.parse(t));
    var epochTimesForQuery = [...(new Set(timestamps.map(t => timestamp.normalize(t))))];
    epochTimesForQuery = [...new Set([...epochTimesForQuery, ...epochTimesForQuery.flatMap(e => timestamp.expandWindowForMinMaxSamples(e))])];
    const timestampsForQuery = epochTimesForQuery.map(e => new Date(e));
    if (!await database.getError()) {
      var ratesFromDb = await database.getRates(currency, timestampsForQuery);
    }
    const unavailableTimestamps = timestampsForQuery.filter(t => !ratesFromDb.some(r => t.getTime() == r.timestamp.getTime()));
    if (unavailableTimestamps.length > 0) {
      var retrievedRates = await rates.get(currency, unavailableTimestamps);
      await database.addRates(currency, retrievedRates);  
    }
    const ratesByEpoch = {}
    ratesFromDb.forEach(r => ratesByEpoch[r.timestamp.getTime()] = r.rate);
    (retrievedRates || []).forEach(r => ratesByEpoch[r.timestamp] = r.rate);
    return timestamp.getMinMaxForEachTimestamp(timestamps, ratesByEpoch);
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
  * Get exchange rates.
  * 
  * @param {} req -- request
   * @param {} res -- response
   * @returns {bool} whether call was successful
   */
  async get(req, res) {
    this[checkInit]();
    try {
      var [currency, timestamps] = this[getRateParams](req)
      const baseCurrency = this[getBaseCurrency](currency);
      var exchangeRates = await this[getRates](timestamps, baseCurrency);
      switch (currency) {
        case 'wei':
          exchangeRates = exchangeRates.map(er => {return {...er, minrate: er.minrate / 1000000000000000000, maxrate: er.maxrate / 1000000000000000000}});
          break;
        case 'sat':
          exchangeRates = exchangeRates.map(er => {return {...er, minrate: er.minrate / 100000000, maxrate: er.maxrate / 100000000}});
          break
      }
      res.status(200).send(exchangeRates);   
      return true;       
    }
    catch (err) {
        debug('GET /rates <= ERROR :: %s', err);
        res.status(400).send(String(err));
        return false;
    } 
  }


 /**
  * Get tally based on minimum rates.
  * 
  * @param {} req -- request
   * @param {} res -- response
   * @returns {bool} whether call was successful
   */
  async tallyMin(req, res) {
    this[checkInit]();
    try {
      var [currency, values] = this[getTallyParams](req, `tallyMin`);
      const timestamps = values.map(t => t.match(/[0-9.]+@(.+)/)[1]);
      const ratesByEpoch = {};
      const baseCurrency = this[getBaseCurrency](currency);
      currency = currency.toLowerCase();
      (await this[getRates](timestamps, baseCurrency)).forEach(r => ratesByEpoch[r.timestamp] = r);
      const rateMultiplier = this[getRateMultiplier](currency);
      const result = values.reduce((acc, curr) => {
        const matches = curr.match(/([0-9.]+)@(.+)/);
        const timestamp = Date.parse(matches[2]);
        const value = matches[1];
        const rate = ratesByEpoch[timestamp];
        return acc + (value * rateMultiplier * rate.minrate);
      }, 0);
      res.status(200).send((Math.round(result * 100) / 100).toFixed(2));   
      return true;       
    }
    catch (err) {
        debug('GET /tallyMin <= ERROR :: %s', err);
        res.status(400).send(String(err));
        return false;
    } 
  }  

 /**
  * Get tally based on minimum rates.
  * 
  * @param {} req -- request
   * @param {} res -- response
   * @returns {bool} whether call was successful
   */
  async tallyMax(req, res) {
    this[checkInit]();
    try {
      var [currency, values] = this[getTallyParams](req, `tallyMin`);
      const timestamps = values.map(t => t.match(/[0-9.]+@(.+)/)[1]);
      const ratesByEpoch = {};
      const baseCurrency = this[getBaseCurrency](currency);
      (await this[getRates](timestamps,baseCurrency)).forEach(r => ratesByEpoch[r.timestamp] = r);
      const rateMultiplier = this[getRateMultiplier](currency);
      const result = values.reduce((acc, curr) => {
        const matches = curr.match(/([0-9.]+)@(.+)/);
        const timestamp = Date.parse(matches[2]);
        const value = matches[1];
        const rate = ratesByEpoch[timestamp];
        return acc + (value * rateMultiplier * rate.maxrate);
      }, 0);
      res.status(200).send((Math.round(result * 100) / 100).toFixed(2));   
      return true;       
    }
    catch (err) {
        debug('GET /tallyMin <= ERROR :: %s', err);
        res.status(400).send(String(err));
        return false;
    } 
  }
}

module.exports = (new Service());