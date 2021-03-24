/**
 * Database evolution script for overhide-ledger.
 */

const POSTGRES_HOST = process.env.POSTGRES_HOST || process.env.npm_config_POSTGRES_HOST || process.env.npm_package_config_POSTGRES_HOST || 'localhost'
const POSTGRES_PORT = process.env.POSTGRES_PORT || process.env.npm_config_POSTGRES_PORT || process.env.npm_package_config_POSTGRES_PORT || 5432
const POSTGRES_DB = process.env.POSTGRES_DB || process.env.npm_config_POSTGRES_DB || process.env.npm_package_config_POSTGRES_DB;
const POSTGRES_USER = process.env.POSTGRES_USER || process.env.npm_config_POSTGRES_USER || process.env.npm_package_config_POSTGRES_USER;
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || process.env.npm_config_POSTGRES_PASSWORD || process.env.npm_package_config_POSTGRES_PASSWORD;
const POSTGRES_SSL = process.env.POSTGRES_SSL || process.env.npm_config_POSTGRES_SSL || process.env.npm_package_config_POSTGRES_SSL;

let conn_details = {
  host: POSTGRES_HOST,
  port: POSTGRES_PORT,
  database: POSTGRES_DB,
  user: POSTGRES_USER,
  password: POSTGRES_PASSWORD,
  ssl: POSTGRES_SSL
};

console.log(JSON.stringify(conn_details,null,2));

const db = new (require('pg').Client)(conn_details);

db.connect();

async function seed() {
  require('../../main/js/lib/log.js').init({app_name:'db_evolve'});  
  const database = require('../../main/js/lib/database.js').init({
    pghost: POSTGRES_HOST,
    pgport: POSTGRES_PORT,
    pgdatabase: POSTGRES_DB,
    pguser: POSTGRES_USER,
    pgpassword: POSTGRES_PASSWORD,
    pgssl: POSTGRES_SSL
  });
  const timestamp = require('../../main/js/lib/timestamp.js').init();  
  const rates = require('../../main/js/lib/rates.js').init();
  const hour = 1000 * 60 * 60;

  const time = new Date();
  const startOfEthereum = (new Date('2015-07-30T00:00:00.000Z')).getTime();
  timestamps = [];
  while (time.getTime() > startOfEthereum) {
    timestamps.push(new Date(time));
    time.setTime(time.getTime() - hour);
  }

  const results = await rates.get('eth', timestamps);
  console.log(`adding ${results.length} records`);
  await database.addRates('eth', results);
}

(async () =>  {
  let result = null;

  result = await db.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'exrate'`);
  if (result.rowCount == 0) {
    await db.query(`CREATE TABLE exrate (id SERIAL PRIMARY KEY,
                                         currency varchar(32) NOT NULL,
                                         timestamp timestamptz NOT NULL,
                                         rate double precision NOT NULL)`);
    console.log(`created 'exrate' table.`);
  }
  await db.query('CREATE UNIQUE INDEX ON exrate (currency, timestamp);');
  
  await seed();

  process.exit(0);

})().catch((err) => {
  console.log(`ERROR: ${err}`);
  console.log(`ERROR: ${JSON.stringify(err,null,2)}`);
});

