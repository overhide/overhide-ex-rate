"use strict";

const Pool = require('pg').Pool;
const log = require('./log.js').fn("database");
const event = require('./log.js').fn("database-event");
const debug = require('./log.js').debug_fn("database");

// private attribtues
const ctx = Symbol('context');

// private functions
const checkInit = Symbol('checkInit');
const logEvent = Symbol('logEvent');

/**
 * Wires up functionality we use throughout.
 * 
 * Module returns this class as object all wired-up.  Before you can use the methods you must "init" the object 
 * somewhere at process start.
 * 
 * Leverages node's module system for a sort of context & dependency injection, so order of requiring and initializing
 * these sorts of libraries matters.
 */
class Database {
  constructor() {
    this[ctx] = null;
  }

  // ensure this is initialized
  [checkInit]() {
    if (! this[ctx]) throw new Error('library not initialized, call "init" when wiring up app first');
  }

  // use logging as DB event log (backup of sorts)
  //
  // @param {String} query -- to log
  // @param {*} params -- to log
  [logEvent](query, params = []) {   
    for (var i = 0; i < params.length; i++) {
      var param = params[i];
      query = query.replace(`$${i+1}`,`'${param}'`);
    }
    event(query);
  }

  /**
   * Initialize this library: this must be the first method called somewhere from where you're doing context & dependency
   * injection.
   * 
   * @param {string} pghost
   * @param {number} phport
   * @param {string} pgdatabase
   * @param {string} pguse
   * @param {string} pgpassword
   * @param {string} pgssl - true or false
   * @returns {Database} this
   */
  init({pghost,pgport,pgdatabase,pguser,pgpassword, pgssl} = {}) {
    if (pghost == null) throw new Error("POSTGRES_HOST must be specified.");
    if (pgport == null) throw new Error("POSTGRES_PORT must be specified.");
    if (pgdatabase == null) throw new Error("POSTGRES_DB must be specified.");
    if (pguser == null) throw new Error("POSTGRES_USER must be specified.");
    if (pgpassword == null) throw new Error("POSTGRES_PASSWORD must be specified.");

    const db = new Pool({
      host: pghost,
      port: pgport,
      database: pgdatabase,
      user: pguser,
      password: pgpassword,
      ssl: pgssl
    });

    this[ctx] = {
      db: db
    };
    
    return this;
  }

  /**
   * Add rates
   * 
   * @param {string} currency -- specifies source currency the exchange is "from"
   * @param {[{timestamp: number, rate: float},..]} rates -- list of exchange rates from currency specified by `currency` to USD, keyed by timestamp floored to the minute.
   */
  async addRates(currency, rates) {
    this[checkInit]();
    try {
      var values = rates.map(v => `('${currency}', '${(new Date(v.timestamp)).toISOString()}', ${v.rate})`);
      values = values.join(',');
      const query = `INSERT INTO exrate (currency, timestamp, rate) VALUES ${values} ON CONFLICT (currency, timestamp) DO NOTHING;`;
      await this[ctx].db.query(query);
    } catch (err) {
      throw `insertion error :: ${String(err)}`;
    }
  }

  /**
   * Get rates
   * 
   * @param {string} currency -- specifies source currency the exchange is "from"
   * @param {[Date]} timestamps -- list of timestamps to retrieve rates for.
   * @returns {[Date]: float} the resultant rates
   */
   async getRates(currency, timestamps) {
    this[checkInit]();
    try {
      var values = timestamps.map(t => `'${t.toISOString()}'`);
      values = values.join(',');
      const query = `SELECT * FROM exrate WHERE currency = '${currency}' AND timestamp in (${values})`;
      debug('%s', query);
      let result = await this[ctx].db.query(query);
      if (result.rowCount == 0) {
        return [];
      }
      debug('%s <= %o', query, result.rows);
      result = result.rows.map(row => {
        return {
          currency: row.currency,
          timestamp: row.timestamp,
          rate: row.rate
        };     
      });
      return result;
    } catch (err) {
      throw `insertion error :: ${String(err)}`;
    }
  }

  /**
   * Call when process is exiting.
   */
  async terminate() {
    this[checkInit]();
    debug(`terminating`);
    await this[ctx].db.end();
  }

  /**
   * @returns {string} null if no error else error string if problem using DB from connection pool.
   */
  async getError() {
    this[checkInit]();
    try {
      var client = await this[ctx].db.connect();
      const res = await client.query('SELECT NOW()');
      return null;
    } catch (err) {
      log(`not healthy: ${String(err)}`);
      return String(err);
    } finally {
      if (client) client.release()
    }    
  }
}

module.exports = (new Database());