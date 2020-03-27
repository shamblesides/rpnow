module.exports = function idgen({
  // These must never be changed for the same database
  base=36,
  firstYear=2020,
  supportYear=firstYear+200,
  // Can be decreased any time
  // Should be less than the expected amount of time over which
  //  the server will be stopped and started again! Otherwise we
  //  lose the monotonic increase guarantee
  // MAY be increased, but make sure the server is down for at
  //  least the amount of time that it is increased to!
  maxTimeWindow=100,
  // Can be increased OR decreased any time
  counterSize=1,
} = {}) {
  const t0 = new Date(`${firstYear}-01-01`).getTime();
  const tSpan = new Date(`${supportYear}-01-01`).getTime() - t0;
  const timestampSize = Math.ceil(Math.log(tSpan/maxTimeWindow) / Math.log(base));
  const tsStr = (t) => ((t - t0) / tSpan).toString(base).slice(2,2+timestampSize);

  // TODO could use db record count for counter
  let counter = 0;
  let lastTimeString;
  return function makeId() {
    const timeString = tsStr(Date.now());

    if (counter+1 >= base**counterSize) {
      throw new Error(`Too many ids generated in this ${(tSpan / base**timestampSize).toFixed()} ms timeslot`);
    } else if (lastTimeString === timeString) {
      counter++;
    } else {
      lastTimeString = timeString;
      counter = 0;
    }

    const counterString = (counter).toString(base).padStart(counterSize,'0')

    return timeString + counterString;
  }
}
