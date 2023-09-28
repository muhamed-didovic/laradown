// const createLogger = require('./helpers/createLogger')
const Crawler = require('./Crawler')
const logger = require("./helpers/logger.js");
const Bluebird = require('bluebird')
Bluebird.config({ longStackTraces: true });
global.Promise = Bluebird

const Spinnies = require('dreidels')
const ms = new Spinnies()

const normalizeOpts = opts => {
    if (!opts.dir) opts.dir = process.cwd()
    // if (!opts.logger) opts.logger = require('./helpers/nullLogger')
    // if (!opts.logger.isLogger) opts.logger = createLogger(opts.logger)
    if (!opts.concurrency) opts.concurrency = 10
    return opts
};

exports.laraAll = async (opts = {}) => {
    opts = normalizeOpts(opts)
    console.log('opts', opts);
    const { oraLogger } = opts
    //login
    let crawler = new Crawler();
    crawler = await oraLogger.promise(crawler.login(opts), "Login...")
    await crawler.download({opts, ms});
}

exports.laraOne = async (url, opts = {}) => {
    if (!url) throw new TypeError('"url" is required.')
    if (typeof url !== 'string') throw new TypeError(`Expected "url" to be of type "string", but "${typeof url}".`)

    opts = normalizeOpts(opts)
    console.log('opts', opts, url);
    const { oraLogger, concurrency } = opts

    //login
    let crawler = new Crawler();
    crawler = await oraLogger.promise(crawler.login(opts), "Login...")

    //get single course
    const courses = await crawler.getSingleCourse({ url, concurrency, ms })

    const prefix = 'single-course'
    const filename = `${prefix}-${new Date().toISOString()}.json`//Date.now()
    await crawler.d(filename, prefix, courses, ms, opts);
}

