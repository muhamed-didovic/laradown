// const getAllBookIds = require('./getAllBookIds')
const path = require('path')
const fs = require('fs-extra')
const createLogger = require('./helpers/createLogger')
const Crawler = require('./Crawler')
const downFile = require('./helpers/downFile')
const Promise = require('bluebird')
const Spinnies = require('dreidels')
const { orderBy, uniqBy } = require("lodash");
const ms = new Spinnies()

const fileSize = require("./helpers/fileSize");
const jarGot = require('jar-got')

const normalizeOpts = opts => {
    if (!opts.dir) opts.dir = process.cwd()
    if (!opts.logger) opts.logger = require('./helpers/nullLogger')
    if (!opts.logger.isLogger) opts.logger = createLogger(opts.logger)
    if (!opts.concurrency) opts.concurrency = 10
    return opts
};


exports.laraAll = async (opts = {}) => {
    opts = normalizeOpts(opts)
    const { logger, concurrency, file, filePath } = opts

    //login
    let crawler = new Crawler();
    crawler = await logger.promise(crawler.login(opts), "Login...")

    let cnt = 0

    //download from '/browse/all' API
    let courses = file ? require(filePath) : await crawler.getAllCoursesFromBrowseAllAPI(opts) //logger.promise(crawler.getAllCoursesFromBrowseAllAPI(opts), "Finding all courses from topics..")

    //write into file courses
    if (!file) {
        fs.writeFileSync(`./json/courses-all-${new Date().toISOString()}.json`, JSON.stringify(courses, null, 2), 'utf8')
    }

    logger.info(`Starting download with concurrency: ${concurrency} ...`)
    await Promise.map(courses, async (course, index) => {
        let dest = path.join(opts.dir, course.downPath)
        fs.ensureDir(path.join(opts.dir, course.downPath))
        if (course.done) {
            console.log('DONE for:', course.title);
            cnt++
            return;
        }
        const url = await crawler._vimeoRequest(course.vimeoUrl)
        await downFile(url, path.join(dest, course.title), { logger, concurrency, ms, index })
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
    logger.succeed(`Downloaded all videos from /browse/all api! (total: ${cnt})`)

    if (file) {
        console.log('tu smo');
        return;
    }
    //get all courses from search page: https://laracasts.com/search
    const coursesFromSearch = file ? require(filePath) : await crawler.getAllCoursesFromSearchAPI(opts) // logger.promise(crawler.getAllCoursesFromSearchAPI(), "Finding all courses from search..")

    if (!file) {
        // courses = orderBy( courses, [o => new Number(o.downPath.split('-')[0]), 'position'], ['asc', 'asc'] );
        // courses = uniqBy(courses, 'url');

        //write into file courses
        fs.writeFileSync(`./json/courses-search-${new Date().toISOString()}.json`, JSON.stringify(coursesFromSearch, null, 2), 'utf8')
    }
    cnt = 0

    logger.info(`Starting download with concurrency: ${concurrency} ...`)
    await Promise.map(coursesFromSearch, async (course, index) => {
        let dest = path.join(opts.dir, course.downPath)
        fs.ensureDir(path.join(opts.dir, course.downPath))
        if (coursesFromSearch.done) {
            console.log('DONE for:', course.title);
            cnt++
            return;
        }

        const url = await crawler._vimeoRequest(course.vimeoUrl)
        await downFile(url, path.join(dest, course.title), { logger, concurrency, ms, index })
        coursesFromSearch[index].done = true;
        if (file) {
            fs.writeFileSync(filePath, JSON.stringify(coursesFromSearch, null, 2), 'utf8');
            //fs.writeFileSync('./jsons/platforms-node.json', JSON.stringify(courses, null, 2), 'utf8');
        }
        cnt++
    }, {
        concurrency//: 1
    })
    ms.stopAll();
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
    await Promise.map(singleCourse, async (course, index) => {
        let dest = path.join(opts.dir, course.downPath)
        fs.ensureDir(path.join(opts.dir, course.downPath))
        await downFile(course.url, path.join(dest, course.title), { logger, concurrency, ms, index })
        cnt++
    }, {
        concurrency//: 8
    })
    ms.stopAll();
    logger.succeed(`DONE - downloaded video: ${cnt}`)
}

