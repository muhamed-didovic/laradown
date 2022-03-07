// const getAllBookIds = require('./getAllBookIds')
const path = require('path')
const fs = require('fs-extra')
const createLogger = require('./helpers/createLogger')
const Crawler = require('./Crawler')
const downFile = require('./helpers/downFile')
const Promise = require('bluebird')
const { orderBy, uniqBy } = require("lodash");
const Spinnies = require('dreidels')
const ms = new Spinnies()

const fileSize = require("./helpers/fileSize");
const jarGot = require('jar-got')
const downOverYoutubeDL = require('./helpers/downOverYoutubeDL')

const normalizeOpts = opts => {
    if (!opts.dir) opts.dir = process.cwd()
    if (!opts.logger) opts.logger = require('./helpers/nullLogger')
    if (!opts.logger.isLogger) opts.logger = createLogger(opts.logger)
    if (!opts.concurrency) opts.concurrency = 10
    return opts
};

async function download(crawler, opts) {
    const { file, filePath, logger, concurrency, source } = opts

    let courses = file
        ? require(filePath)
        : (source === 'all'
                ? await crawler.getAllCoursesFromBrowseAllAPI({ ...opts, ms })
                : await crawler.getAllCoursesFromSearchAPI({ ...opts, ms })
        ) //logger.promise(crawler.getAllCoursesFromBrowseAllAPI(opts), "Finding all courses from topics..")


    if (!file) {
        const date = new Date().toISOString();
        const destinationFile = path.join(process.cwd(), `json/courses-${source}-${date}.json`);
        //write into file courses
        fs.writeFileSync(destinationFile, JSON.stringify(courses, null, 2), 'utf8')
        console.log(`Courses and videos are saved in file: ${destinationFile}`);
    }

    let cnt = 0
    logger.info(`Starting download with concurrency: ${concurrency} ...`)
    await Promise.map(courses, async (course, index) => {
        if (course.done) {
            //console.log('DONE for:', course.title);
            cnt++
            return;
        }
        if (!course.vimeoUrl) {
            throw new Error('Vimeo URL is not found')
        }
        let dest = path.join(opts.dir, course.downPath)
        fs.ensureDir(dest)
        const details = await crawler._vimeoRequest(course.vimeoUrl)
        await downOverYoutubeDL(details, path.join(dest, course.title), {
            downFolder: dest,
            index,
            ms
        })

        courses[index].done = true;
        if (file) {
            fs.writeFileSync(filePath, JSON.stringify(courses, null, 2), 'utf8');
            //fs.writeFileSync('./jsons/platforms-node.json', JSON.stringify(courses, null, 2), 'utf8');
        }
        cnt++
        //logger.info(`Completed download - ${path.join(dest, course.title)}`)
    }, {
        concurrency//: 8
    })
    ms.stopAll();
    logger.succeed(`Downloaded all videos from ${source} api! (total: ${cnt})`)
}

exports.laraAll = async (opts = {}) => {
    opts = normalizeOpts(opts)
    const { logger, file, source } = opts
    //login
    let crawler = new Crawler();
    crawler = await logger.promise(crawler.login(opts), "Login...")

    await download(crawler, opts);
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
    const singleCourse = await crawler.getSingleCourse({ url, ms })//await logger.promise(crawler.getSingleCourse({ url, ms }), "Finding course videos..")

    $date = new Date().toISOString();
    //write course into file
    fs.writeFileSync(`./json/single-cours-${$date}.json`, JSON.stringify(singleCourse, null, 2), 'utf8')
    console.log(`Courses and videos are save in file: ${path.join(process.cwd(), 'json/single-cours-${data}.json')}`);

    let cnt = 0
    logger.info(`Starting download course with concurrency: ${concurrency} ...`)
    await Promise.map(singleCourse, async (course, index) => {
        let dest = path.join(opts.dir, course.downPath)
        fs.ensureDir(dest)
        const details = await crawler._vimeoRequest(course.vimeoUrl)
        //await downFile(url, path.join(dest, course.title), { logger, concurrency, ms, index })
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

