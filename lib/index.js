// const getAllBookIds = require('./getAllBookIds')
const path = require('path')
const fs = require('fs-extra')
const createLogger = require('./helpers/createLogger')
const Crawler = require('./Crawler')
const downFile = require('./helpers/downFile')
const Promise = require('bluebird');

exports.laraAll = async (opts = {}) => {
    opts = normalizeOpts(opts)
    const { logger, concurrency } = opts
    // console.log('opts', opts);

    //login
    let crawler = new Crawler();
    crawler = await logger.promise(crawler.login(opts), "Login...")

    //download from '/browse/all' API
    const coursesFromBrowseAll = await logger.promise(crawler.getAllCoursesFromBrowseAllAPI(), "Finding all courses from topics..")

    //write into file courses
    fs.writeFileSync('browse-all-courses.json', JSON.stringify(coursesFromBrowseAll, null, 2), 'utf8');
    let cnt = 0

    logger.info(`Starting download with concurrency: ${concurrency} ...`)
    await Promise.map(coursesFromBrowseAll, async (course) => {
        let dest = path.join(opts.dir, course.downPath)
        fs.ensureDir(path.join(opts.dir, course.downPath))
        await downFile(course.url, path.join(dest, course.title), { logger, concurrency })
        cnt++
        //logger.info(`Completed download - ${path.join(dest, course.title)}`)
    }, {
        concurrency//: 8
    })

    logger.succeed(`Downloaded all videos from /browse/all api! (total: ${cnt})`)

    //get all courses from search page: https://laracasts.com/search
    const coursesFromSearch = await logger.promise(crawler.getAllCoursesFromSearchAPI(), "Finding all courses from search..")

    //write into file courses
    fs.writeFileSync('search-courses.json', JSON.stringify(coursesFromSearch, null, 2), 'utf8');
    cnt = 0

    logger.info(`Starting download with concurrency: ${concurrency} ...`)
    await Promise.map(coursesFromSearch, async (course) => {
        let dest = path.join(opts.dir, course.downPath)
        fs.ensureDir(path.join(opts.dir, course.downPath))
        await downFile(course.url, path.join(dest, course.title), { logger, concurrency })
        cnt++
    }, {
        concurrency//: 8
    })

    logger.succeed(`Downloaded all videos from search api! (total: ${cnt})`)
}

exports.laraOne = async (url, opts = {}) => {
    if (!url) throw new TypeError('`url` is required.')
    if (typeof url !== 'string') throw new TypeError(`Expected "url" to be of type "string", but "${typeof url}".`)

    opts = normalizeOpts(opts)
    // console.log('opts', opts);
    const { logger, concurrency } = opts

    //login
    let crawler = new Crawler();
    crawler = await logger.promise(crawler.login(opts), "Login...")

    //get single course
    const singleCourse = await logger.promise(crawler.getSingleCourse(url), "Finding course videos..")

    //write course into file
    fs.writeFileSync('course.json', JSON.stringify(singleCourse, null, 2), 'utf8');
    let cnt = 0
    logger.info(`Starting download course with concurrency: ${concurrency} ...`)
    await Promise.map(singleCourse, async (course) => {
        let dest = path.join(opts.dir, course.downPath)
        fs.ensureDir(path.join(opts.dir, course.downPath))
        await downFile(course.url, path.join(dest, course.title), { logger, concurrency })
        cnt++
    }, {
        concurrency//: 8
    })
    logger.succeed(`DONE - downloaded video: ${cnt}`)
}

function normalizeOpts(opts) {
    if (!opts.dir) opts.dir = process.cwd()
    if (!opts.logger) opts.logger = require('./helpers/nullLogger')
    if (!opts.logger.isLogger) opts.logger = createLogger(opts.logger)
    if (!opts.concurrency) opts.concurrency = 10
    return opts
}
