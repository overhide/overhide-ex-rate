"use strict";

const timestamp = require('./timestamp.js');
const rates = require('./rates.js');
const database = require('./database.js');
const debug = require('./log.js').debug_fn("service");

// private attribtues
const ctx = Symbol('context');

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
class Service {
  constructor() {
    this[ctx] = null;
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
      const result = timestamp.getMinMaxForEachTimestamp(timestamps, ratesByEpoch);
      res.status(200).send(result);   
      return true;       
    }
    catch (err) {
        debug('GET /rates <= ERROR :: %s', err);
        res.status(400).send(String(err));
        return false;
    } 
  }
}

module.exports = (new Service());