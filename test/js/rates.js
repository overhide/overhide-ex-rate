const { expect } = require('chai');
const chai = require('chai');
const assert = chai.assert;
const mock = require('mock-require');

const baseTime = Date.parse('2010-10-10T11:11:11.111Z');
const tenMinutes = 1000 * 60 * 10;
const hour = 1000 * 60 * 60;

mock('coingecko-api', class MockCoinGecko {
  constructor() {

    const prices = [
      [(new Date(baseTime - hour * 2)).getTime(), 8],
      [(new Date(baseTime - hour * 3)).getTime(), 7],
      [(new Date(baseTime - hour * 5)).getTime(), 5],
      [(new Date(baseTime - hour * 4)).getTime(), 6],
      [(new Date(baseTime + hour * 2)).getTime(), 12],
      [(new Date(baseTime)).getTime(), 10],
      [(new Date(baseTime - hour * 10)).getTime(), 1],
    ];

    this.coins = {
      fetchMarketChartRange: () => {
        return {
          data: {
            prices: prices
          }
        }
      }
    }
  }
});

function roundToHour(epochTime) {
  const hour = 1000 * 60 * 60;
  return Math.floor(epochTime / hour) * hour;
}

require('../../main/js/lib/log.js').init({app_name:'smoke'});
const rates = require('../../main/js/lib/rates.js').init();

describe('rates tests', () => {

  /**************/
  /* The tests. */
  /**************/

  it('should get() smoke', (done) => {
    (async () => {
 
      timestamps = [
        new Date(baseTime - tenMinutes), 
        new Date(baseTime - tenMinutes * 3), 
        new Date(baseTime - hour - tenMinutes * 2)];
  
      resultAsTuples = await rates.get('eth', timestamps);
      result = {};
      resultAsTuples.forEach(r => result[r.timestamp] = r.rate);

      const latestEpoch = roundToHour(timestamps[0].getTime());
      assert.isTrue(Object.keys(result).length == 10);
      assert.isTrue(result[latestEpoch] == 8);
      assert.isTrue(result[latestEpoch - hour] == 8);
      assert.isTrue(result[latestEpoch - hour * 2] == 7);
      assert.isTrue(result[latestEpoch - hour * 3] == 6);
      assert.isTrue(result[latestEpoch - hour * 4] == 5);
      assert.isTrue(result[latestEpoch - hour * 5] == 1);
      assert.isTrue(result[latestEpoch - hour * 6] == 1);
      assert.isTrue(result[latestEpoch - hour * 7] == 1);
      assert.isTrue(result[latestEpoch - hour * 8] == 1);
      assert.isTrue(result[latestEpoch - hour * 9] == 1);
      done();  
    })();
  });
})

