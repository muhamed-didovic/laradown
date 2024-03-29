const path = require("path");
const fs = require("fs-extra");
const logger = require("./logger.js");
/**
 * Retries the given function until it succeeds given a number of retries and an interval between them. They are set
 * by default to retry 5 times with 1sec in between. There's also a flag to make the cooldown time exponential
 * @param {Function} fn - Returns a promise
 * @param {Number} retriesLeft - Number of retries. If -1 will keep retrying
 * @param {Number} interval - Millis between retries. If exponential set to true will be doubled each retry
 @param {Boolean} exponential - Flag for exponential back-off mode
 * @return {Promise<*>}
 */
const retry = async (fn, retriesLeft = 5, interval = 1000, exponential = false) => {
    try {
        const val = await fn()
        return val
    } catch (error) {
        if (retriesLeft) {
            logger.warn('.... retrying left (' + retriesLeft + ')')
            // console.log('retrying err', error)
            await new Promise(r => setTimeout(r, interval))
            return retry(fn, retriesLeft - 1, exponential ? interval * 2 : interval, exponential)//page,
        } else {
            logger.error('Max retries reached')
            logger.error('Error in retry:', error)
            throw error
        }
    }
}

module.exports = retry;
