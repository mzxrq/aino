class Subscriber {
  constructor(lineID, tickers) {
    this.lineID = lineID;
    this.tickers = tickers || [];
  }
}

module.exports = Subscriber;
