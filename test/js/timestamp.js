const { expect } = require('chai');
const chai = require('chai');
const assert = chai.assert;

require('../../main/js/lib/log.js').init({app_name:'smoke'});
const timestamp = require('../../main/js/lib/timestamp.js').init();

describe('timestamp tests', () => {

  /**************/
  /* The tests. */
  /**************/

  it('should normalize epoch time to the hour', (done) => {
    const epochTime = 1616580153123;
    const expectedNormalized = 	1616580000000;
    assert.isTrue(timestamp.normalize(epochTime) == expectedNormalized);
    done();
  });

  it('should expandWindowForMinMaxSamples when given an epochTime', (done) => {
    const dateTime = new Date(1616580000000);    
    const expectations = [
      new Date(dateTime),
      new Date(dateTime),
      new Date(dateTime),
      new Date(dateTime)
    ];
    expectations[1].setHours(expectations[1].getHours() - 1);
    expectations[2].setHours(expectations[2].getHours() - 2);
    expectations[3].setHours(expectations[3].getHours() - 3);
    const result = [...timestamp.expandWindowForMinMaxSamples(dateTime.getTime())];
    assert.isTrue(result.length == 4);
    assert.isTrue(result.some(r => r == expectations[0].getTime()));
    assert.isTrue(result.some(r => r == expectations[1].getTime()));
    assert.isTrue(result.some(r => r == expectations[2].getTime()));
    assert.isTrue(result.some(r => r == expectations[3].getTime()));
    done();
  });

  it('should getMinMaxForEachTimestamp to equal for all timestamps when all timestamps fall into the same hour', (done) => {
    const baseTime = Date.parse('2020-10-10T11:11:11.111Z');
    const tenMinutes = 1000 * 60 * 10;

    timestamps = [
      new Date(baseTime - tenMinutes), 
      new Date(baseTime + tenMinutes), 
      new Date(baseTime + tenMinutes * 2)];

    ratesByEpoch = {}
    ratesByEpoch[Date.parse('2020-10-10T07:00:00.000Z')] = 2;
    ratesByEpoch[Date.parse('2020-10-10T08:00:00.000Z')] = 3;
    ratesByEpoch[Date.parse('2020-10-10T09:00:00.000Z')] = 4;
    ratesByEpoch[Date.parse('2020-10-10T10:00:00.000Z')] = 5;
    ratesByEpoch[Date.parse('2020-10-10T11:00:00.000Z')] = 6;
    ratesByEpoch[Date.parse('2020-10-10T12:00:00.000Z')] = 7;

    const result = timestamp.getMinMaxForEachTimestamp(timestamps, ratesByEpoch);

    assert.isTrue(result.length == 3);
    assert.isTrue(result.some(r => r.timestamp == timestamps[0] && r.minrate == 3 && r.maxrate == 6));
    assert.isTrue(result.some(r => r.timestamp == timestamps[1] && r.minrate == 3 && r.maxrate == 6));
    assert.isTrue(result.some(r => r.timestamp == timestamps[2] && r.minrate == 3 && r.maxrate == 6));
    done();
  });

  it('should getMinMaxForEachTimestamp to equal for all timestamps when all timestamps are spread out', (done) => {
    const baseTime = Date.parse('2020-10-10T11:11:11.111Z');
    const tenMinutes = 1000 * 60 * 10;
    const hour = 1000 * 60 * 60;

    timestamps = [
      new Date(baseTime - tenMinutes), 
      new Date(baseTime - tenMinutes * 3), 
      new Date(baseTime - hour - tenMinutes * 2)];

    ratesByEpoch = {}
    ratesByEpoch[Date.parse('2020-10-10T06:00:00.000Z')] = 1;
    ratesByEpoch[Date.parse('2020-10-10T07:00:00.000Z')] = 2;
    ratesByEpoch[Date.parse('2020-10-10T08:00:00.000Z')] = 3;
    ratesByEpoch[Date.parse('2020-10-10T09:00:00.000Z')] = 4;
    ratesByEpoch[Date.parse('2020-10-10T10:00:00.000Z')] = 5;
    ratesByEpoch[Date.parse('2020-10-10T11:00:00.000Z')] = 6;
    ratesByEpoch[Date.parse('2020-10-10T12:00:00.000Z')] = 7;

    const result = timestamp.getMinMaxForEachTimestamp(timestamps, ratesByEpoch);

    assert.isTrue(result.length == 3);
    assert.isTrue(result.some(r => r.timestamp == timestamps[0] && r.minrate == 3 && r.maxrate == 6));
    assert.isTrue(result.some(r => r.timestamp == timestamps[1] && r.minrate == 2 && r.maxrate == 5));
    assert.isTrue(result.some(r => r.timestamp == timestamps[2] && r.minrate == 1 && r.maxrate == 4));
    done();
  });

  it('should throw when getMinMaxForEachTimestamp does not have rates at window minimum', (done) => {
    const baseTime = Date.parse('2020-10-10T11:11:11.111Z');
    const tenMinutes = 1000 * 60 * 10;
    const hour = 1000 * 60 * 60;

    timestamps = [
      new Date(baseTime - tenMinutes), 
      new Date(baseTime - tenMinutes * 3), 
      new Date(baseTime - hour - tenMinutes * 2)];

    ratesByEpoch = {}
    ratesByEpoch[Date.parse('2020-10-10T08:00:00.000Z')] = 3;
    ratesByEpoch[Date.parse('2020-10-10T09:00:00.000Z')] = 4;
    ratesByEpoch[Date.parse('2020-10-10T10:00:00.000Z')] = 5;
    ratesByEpoch[Date.parse('2020-10-10T11:00:00.000Z')] = 6;
    ratesByEpoch[Date.parse('2020-10-10T12:00:00.000Z')] = 7;

    try {
      const result = timestamp.getMinMaxForEachTimestamp(timestamps, ratesByEpoch);
      assert.isTrue(false);
    } catch (e) {

    }

    done();
  });
})

