class Subscriber {
  constructor(id, tickers) {
    this.id = id;
    this.tickers = tickers || [];
  }
}

module.exports = Subscriber;
