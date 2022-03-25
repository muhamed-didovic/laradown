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
            //throw new Error('Vimeo URL is not found')
            console.log(`Vimeo URL is not found for: ${course.title}`);
            return;
        }
        let dest = path.join(opts.dir, course.downPath)
        fs.ensureDir(dest)
        // const details = await crawler._vimeoRequest(course.vimeoUrl)
        const details = await getLinkAndPrepareResources(crawler, course, dest);
        // console.log('dest', dest);
        await downOverYoutubeDL(details, path.join(dest, course.title), {
            downFolder: dest,
            index,
            ms
        })

        courses[index].done = true;
        if (file) {
            fs.writeFileSync(filePath, JSON.stringify(courses, null, 2), 'utf8');
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

async function getLinkAndPrepareResources(crawler, course, dest) {
    const [details,] = await Promise.all([
        crawler._vimeoRequest(course.vimeoUrl),
        //...(course.hasTranscript ? fs.writeFileSync(path.join(dest, `transcript.json`), JSON.stringify(await crawler._request({ url: `https://laracasts.com/episodes/${course.id}/transcript` }), null, 2), 'utf8') : []),
        (async () => {
            if (course.hasTranscript) {
                await fs.ensureDir(path.join(dest, 'transcripts'))
                //console.log('hasTranscript', course.hasTranscript, course.id, `https://laracasts.com/episodes/${course.id}/transcript`);
                await fs.writeFileSync(path.join(dest, 'transcripts', `${course.title} transcript.json`), JSON.stringify(await crawler._request({ url: `https://laracasts.com/episodes/${course.id}/transcript` }), null, 2), 'utf8')
            }
            if (course.source_code) {

                //console.log('hasTranscript', course.source_code, course.id);
                const md = json2md([
                    { h1: "Resources " },
                    { h2: "Description" },
                    { p: course.body },
                    {
                        link: [
                            {
                                'title' : 'Code',
                                'source': course.source_code
                            },
                        ]
                    }
                ])
                await fs.ensureDir(path.join(dest, 'markdown'))
                await fs.writeFileSync(path.join(dest, 'markdown', `${course.title}.md`), md, 'utf8')//-${Date.now()}

            }
        })()
    ])
    return details;
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
    fs.writeFileSync(`./json/single-course-${date}.json`, JSON.stringify(singleCourse, null, 2), 'utf8')
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

        const details = await getLinkAndPrepareResources(crawler, course, dest);

        // const details = await crawler._vimeoRequest(course.vimeoUrl)
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

