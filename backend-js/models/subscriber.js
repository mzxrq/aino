class Subscriber {
  constructor(lineId, tickers) {
    this.lineId = lineId;
    this.tickers = tickers || [];
  }
}

module.exports = Subscriber;
