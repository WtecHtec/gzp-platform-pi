export default class TokenEstimator {
  estimate(value: unknown): number {
    return Math.ceil(JSON.stringify(value).length / 3);
  }
}
