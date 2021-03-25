"use strict";

const timestamp = require('./timestamp.js');
const rates = require('./rates.js');
const database = require('./database.js');
const debug = require('./log.js').debug_fn("service");

// private attribtues
const ctx = Symbol('context');

// private functions
const checkInit = Symbol('checkInit');
const getTallyParams = Symbol('getTallyParams');
const getRates = Symbol('getRates');

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
    if (!currency || typeof currency !== 'string' || !currency.match(/eth|wei/)) throw `invalid currency, only 'eth' or 'wei' supported`;
    if (!values || typeof values !== 'string') throw `invalid values, must be a comma separated list of values at ISO8601 strings`;
    values = values.split(',');
    if (values.some(t => !t.match(/[0-9]+(.[0-9]+)?@....-..-..[tT ]..:..:..(\..+)?Z/))) throw `not all values match '<amount>@YYYY-MM-DDThh:mm:ss.mmmZ'`;      
    return [currency, values];
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
      var params = req.params;
      var currency = params['currency'];      
      var timestamps = params['timestamps'];
      debug('GET /rates <= %o', params);
      if (!currency || typeof currency !== 'string' || currency != 'eth') throw `invalid currency, only 'eth' supported`;
      if (!timestamps || typeof timestamps !== 'string') throw `invalid timestamps, must be a comma separated list of ISO8601 strings`;
      timestamps = timestamps.split(',');
      if (timestamps.some(t => !t.match(/....-..-..[tT ]..:..:..(\..+)?Z/))) throw `not all timestamps match 'YYYY-MM-DDThh:mm:ss.mmmZ'`;      
      res.status(200).send(await this[getRates](timestamps, currency));   
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
      const [currency, values] = this[getTallyParams](req, `tallyMin`);
      const timestamps = values.map(t => t.match(/[0-9.]+@(.+)/)[1]);
      const ratesByEpoch = {};
      (await this[getRates](timestamps, 'eth')).forEach(r => ratesByEpoch[r.timestamp] = r);
      const ethersRate = currency === 'wei' ? 1 / 1000000000000000000 : 1;
      const result = values.reduce((acc, curr) => {
        const matches = curr.match(/([0-9.]+)@(.+)/);
        const timestamp = Date.parse(matches[2]);
        const value = matches[1];
        const rate = ratesByEpoch[timestamp];
        return acc + (value * ethersRate * rate.minrate);
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
      const [currency, values] = this[getTallyParams](req, `tallyMin`);
      const timestamps = values.map(t => t.match(/[0-9.]+@(.+)/)[1]);
      const ratesByEpoch = {};
      (await this[getRates](timestamps, 'eth')).forEach(r => ratesByEpoch[r.timestamp] = r);
      const ethersRate = currency === 'wei' ? 1 / 1000000000000000000 : 1;
      const result = values.reduce((acc, curr) => {
        const matches = curr.match(/([0-9.]+)@(.+)/);
        const timestamp = Date.parse(matches[2]);
        const value = matches[1];
        const rate = ratesByEpoch[timestamp];
        return acc + (value * ethersRate * rate.maxrate);
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