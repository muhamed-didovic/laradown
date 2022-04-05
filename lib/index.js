const path = require('path')
const fs = require('fs-extra')
const json2md = require("json2md")
// const fileSize = require("./helpers/fileSize");
// const jarGot = require('jar-got')
// const downFile = require('./helpers/downFile')
// const { orderBy, uniqBy } = require("lodash");
const downOverYoutubeDL = require('./helpers/downOverYoutubeDL')
const createLogger = require('./helpers/createLogger')
const Crawler = require('./Crawler')

const Bluebird = require('bluebird')
Bluebird.config({ longStackTraces: true });
global.Promise = Bluebird

const Spinnies = require('dreidels')
const ms = new Spinnies()


const normalizeOpts = opts => {
    if (!opts.dir) opts.dir = process.cwd()
    if (!opts.logger) opts.logger = require('./helpers/nullLogger')
    if (!opts.logger.isLogger) opts.logger = createLogger(opts.logger)
    if (!opts.concurrency) opts.concurrency = 10
    return opts
};

exports.laraAll = async (opts = {}) => {
    opts = normalizeOpts(opts)
    const { logger, file, source } = opts
    //login
    let crawler = new Crawler();
    crawler = await logger.promise(crawler.login(opts), "Login...")

    await crawler.download(opts);
    //source === 'all' && await downloadFromBrowseAll(crawler, opts);
    //source === 'search' && await downloadFromSearchPages(crawler, opts);
}

exports.laraOne = async (url, opts = {}) => {
    if (!url) throw new TypeError('"url" is required.')
    if (typeof url !== 'string') throw new TypeError(`Expected "url" to be of type "string", but "${typeof url}".`)

    opts = normalizeOpts(opts)
    // console.log('opts', opts);
    const { logger, concurrency } = opts

    //login
    let crawler = new Crawler();
    crawler = await logger.promise(crawler.login(opts), "Login...")

    //get single course
    const singleCourse = await crawler.getSingleCourse({ url, concurrency, ms })//await logger.promise(crawler.getSingleCourse({ url, ms }), "Finding course videos..")

    const date = Date.now();
    //write course into file
    await fs.writeFile(`./json/single-course-${date}.json`, JSON.stringify(singleCourse, null, 2), 'utf8')
    console.log(`Courses and videos are saved in file: ${path.join(process.cwd(), `json/single-course-${date}.json`)}`);

    let cnt = 0
    logger.info(`Starting download course with concurrency: ${concurrency} ...`)
    await Promise.map(singleCourse, async (course, index) => {
        if (!course.vimeoUrl) {
            //throw new Error('Vimeo URL is not found')
            console.log(`Vimeo URL is not found for: ${course.title}`);
            return;
        }

        let dest = path.join(opts.dir, course.downPath)
        fs.ensureDir(dest)

        const details = await crawler.getLinkAndPrepareResources(course, dest);
        await downOverYoutubeDL(details, path.join(dest, course.title), {
            downFolder: dest,
            index,
            ms
        })
        cnt++
    }, {
        concurrency//: 8
    })
    ms.stopAll();
    logger.succeed(`DONE - downloaded video: ${cnt}`)
}

