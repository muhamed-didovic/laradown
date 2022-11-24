const fs = require('fs-extra')
const path = require("path");
const sanitize = require('sanitize-filename')
const { range, orderBy, uniqBy, uniq, sortBy } = require('lodash')
const cheerio = require("cheerio");

const ufs = require("url-file-size");
const downOverYoutubeDL = require('./helpers/downOverYoutubeDL')

const req = require('requestretry');
const j = req.jar();
const request = req.defaults({ jar: j, retryDelay: 500, fullResponse: true });

const { PromisePool } = require('@supercharge/promise-pool')
const json2md = require("json2md");

const Spinnies = require('dreidels')
const { formatBytes } = require("./helpers/writeWaitingInfo");
const retry = require("./helpers/retry");
const ms = new Spinnies()

module.exports = class Crawler {

    /**
     * @param inertiaVersion
     */
    constructor(inertiaVersion = 'noop') {
        this._laracastsUrl = "https://laracasts.com"
        this._searchUrl = `${this._laracastsUrl}/search?page=`
        this._inertiaVersion = inertiaVersion
        this._req = request;
    }

    static async getCourses(searchFromLocalFile) {
        if (searchFromLocalFile && await fs.exists(path.resolve(process.cwd(), 'json/search-courses.json'))) {
            console.log('LOAD FROM LOCAL SEARCH FILE');
            return require(path.resolve(process.cwd(), 'json/search-courses.json'))
        }
        ms.add('search', { text: `Collecting data for search` });
        return Promise
            .resolve()
            .then(async () => {
                const { body } = await request(`https://laracasts.com/search?page=1`)
                const $ = cheerio.load(body)
                const json = JSON.parse($('#app').attr('data-page'))

                if (!json?.props?.videos?.data.length) {
                    return {
                        meta: null,
                        json: require('../json/search-courses.json')
                    }
                }
                ms.update('search', { text: `Found ${json?.props?.videos?.data.length} videos` });
                return {
                    meta: json?.props?.videos?.meta,
                    json: json?.props?.videos?.data.map(item => {
                        return {
                            title: item.series.title,
                            value: `https://laracasts.com${item.series.path}`
                        }
                    })
                }

            })
            .then(async ({ meta, json }) => {

                if (!meta) {
                    return json;
                }
                ms.update('search', { text: `Collecting from search page...` });
                const r = range(2, ++meta.last_page);
                let courses = await Promise
                    .map(r, async index => {
                        // console.log('search url:', `https://laracasts.com/search?page=${index}`);
                        ms.update('search', { text: `Collecting from search page https://laracasts.com/search?page=${index}...` });
                        let { body } = await request({ url: `https://laracasts.com/search?page=${index}` })
                        const $ = cheerio.load(body)
                        const json = JSON.parse($('#app').attr('data-page'))
                        return json?.props?.videos?.data.map(item => {
                            return {
                                title: item.series.title,
                                value: `https://laracasts.com${item.series.path}`
                            }
                        });
                    }, {
                        concurrency: 10
                    })
                    .then(c => c.flat())

                courses = orderBy([...json, ...courses], ['title'], ['asc']);
                courses = uniqBy(courses, 'title');
                await fs.writeFile(`./json/search-courses.json`, JSON.stringify(courses, null, 2), 'utf8')
                // console.log('2. courses length', courses.length);
                ms.succeed('search', { text: `Found ${courses.length} courses` });
                return courses;
            })
    }

    /**
     *
     * @returns {bluebird<{cookie: string, sanitizeXsrfToken: string, version: *}>}
     */
    async getTokensForLogin() {
        const { body, headers } = await this._req(this._laracastsUrl)

        const $ = cheerio.load(body)
        // const [, csrfToken] = /"csrfToken": '(.*)'/.exec(body)
        const { version } = JSON.parse($('#app').attr('data-page'))

        let [xsrfToken, session] = headers['set-cookie']
        let cookie = `${xsrfToken.split('%3D;')[0] + '%3D;'} ${session.split('%3D;')[0] + '%3D;'}`
        let sanitizeXsrfToken = (xsrfToken.split('XSRF-TOKEN=')[1]).split('%3D;')[0] + "="

        this._inertiaVersion = version

        return {
            sanitizeXsrfToken,
            cookie,
            version,
            // csrfToken
        };
    };

    /**
     *
     * @param opts
     * @returns {bluebird<Crawler>}
     */
    login = async opts => {
        const { sanitizeXsrfToken, cookie, version } = await this.getTokensForLogin();

        const post = await this._req.post({
            url            : 'https://laracasts.com/sessions?return=/',
            throwHttpErrors: false,
            followRedirect : true,
            headers        : {
                'content-type': 'application/json',
                "x-xsrf-token": sanitizeXsrfToken,
            },
            body           : JSON.stringify({
                email   : opts.email,
                password: opts.password,
                remember: 1
            }),
            verify         : false
        })

        const body = await this._request({ url: `${this._laracastsUrl}/search?page=1` })

        if (!body.props.auth.signedIn) {
            throw new Error('User is not logged')
        }

        return this;
    };

    /**
     * @param {any} opts
     */
    async _request(opts) {

        try {
            /*let response = await this._req({
                url: opts.url,
                // jar: j,
                json   : true,
                headers: {
                    'x-inertia-version': this._inertiaVersion,
                    'x-inertia'        : 'true',
                }
            })*/

            const { body, headers, attempts, statusCode } = await request({
                url: opts.url,
                json        : true,
                maxAttempts : 50,
                // method      : "HEAD",
                fullResponse: true, // (default) To resolve the promise with the full response or just the body
                headers: {
                    'x-inertia-version': this._inertiaVersion,
                    'x-inertia'        : 'true',
                }
            })
            if (statusCode !== 200) {
                console.log('response.statusCode:', opts.url, statusCode, 'attempts:', attempts);
            }

            return body;
        } catch (e) {
            console.error(`ERROR REQUESt url: ${opts.url}`, e);
            return;
        }

    }

    /**
     *
     * @returns {bluebird<*>}
     */
    async getAllCoursesFromBrowseAllAPI(opts) {
        const { ms } = opts;
        ms.add('info', { text: `get courses from ${this._laracastsUrl}/browse/all` });
        return Promise
            .resolve()
            .then(async () => {
                let json = await this._request({ url: `${this._laracastsUrl}/browse/all` })
                return json.props.topics;
            })
            .then(async (topics) => {
                // console.log('topics length', topics.length);
                /*{
                  name: 'Webpack',
                  episode_count: 25,
                  series_count: 2,
                  path: 'https://laracasts.com/topics/webpack',
                  theme: 'two',
                  thumbnail: 'webpack-logo.svg'
                }*/
                return await Promise
                    .map(topics, async (topic) => {
                        let top = await this._request({ url: topic.path })
                        return top.props.topic.series.map(serie => {
                            ms.update('info', { text: `Found course: ${serie.slug}` });
                            return serie.slug;
                        });
                    }, {
                        concurrency: opts.concurrency
                    })
                    .then(c => c.flat())

            })
            .then(async (courses) => {
                let i = 0
                courses = sortBy(uniq(courses))
                return await Promise
                    .map(courses, async (c) => {
                        let seriesResponse = await this._request({ url: `${this._laracastsUrl}/series/${c}` })
                        const e = seriesResponse.props.series.chapters
                            // .flatMap(({ episodes }) => episodes.map(episode => episode))
                            .flatMap(({ episodes }) => episodes.map((course, index, episodes) => this.extractVideos({
                                course,
                                ms,
                                index,
                                total: episodes.length
                            })))

                        /*const e = await Promise
                            .map(seriesResponse.props.series.chapters, async ({ episodes }) => {
                                return await Promise
                                    .map(episodes, async (course, index, episodes) => await this.extractVideos({
                                        course,
                                        ms,
                                        index,
                                        total: episodes.length
                                    }))
                            })
                            .then(c => c.flat())*/
                        console.log(`Extracting ${++i}/${courses.length} course: ${c} has ${e.length} episodes`);
                        // ms.update('info', { text: `Extracting ${++i}/${courses.length} course: ${c} has ${e.length} episodes` });
                        return e;
                    }, {
                        concurrency: opts.concurrency
                    })
                    .then(c => c.flat())
            })
            .then(async (courses) => {
                ms.succeed('info', { text: `Extraction is done for ${courses.length} videos from courses` });
                return courses;
                //await this.makeConcurrentCalls(courses, ms)
            });
    }

    /**
     *
     * @returns {bluebird<*>}
     */
    async getAllCoursesFromSearchAPI(opts) {

        const { ms } = opts;
        ms.add('info', { text: `get courses from SEARCH PAGES:${this._searchUrl}` });
        return Promise
            .resolve()
            .then(async () => {
                let json = await this._request({ url: `${this._searchUrl}1` })
                /*json.props.videos.data.forEach(item => {
                    console.log('item', item.id, item.vimeoId);
                })*/

                return json.props.videos.meta;
            })
            .then(async (meta) => {
                const r = range(1, ++meta.last_page);//2
                // console.log('r', r);
                return await Promise
                    .map(r, async index => {
                        // console.log('`${this.searchUrl}${index}`', `${this.searchUrl}${index}`);
                        ms.update('info', { text: `search url: ${this._searchUrl}${index}` });
                        let json = await this._request({ url: `${this._searchUrl}${index}` })
                        const e = await Promise
                            .map(json?.props?.videos?.data, async (course, index, episodes) => await this.extractVideos({
                                course,
                                ms,
                                index,
                                total: episodes.length
                            }))

                            .then(c => c.flat())

                        ms.update('info', { text: `Extracting ${++index}/${meta.last_page} course: ${this._searchUrl}${index} has ${e.length} episodes` });
                        return e;
                    }, {
                        concurrency: opts.concurrency
                    })
                    .then(c => c.flat())
            })
            // .then(async (courses) => await this.makeConcurrentCalls(courses, ms));
            .then(async (courses) => {
                ms.succeed('info', { text: `Extraction is done for ${courses.length} videos from courses` });
                return courses;
            });
    }

    /**
     *
     * @param url
     * @param concurrency
     * @param ms
     * @returns {bluebird<*>}
     */
    async getSingleCourse({ url, concurrency, ms }) {
        ms.add('info', { text: `Get course: ${this._searchUrl}` });
        return Promise
            .resolve()
            .then(async () => {
                //get the chapters or videos from requests
                let json = await this._request({ url })
                // console.log('json.props', json.props);
                let { chapters } = json.props.series;//.chapters[0].episodes;
                // return chapters;

                const e = await Promise
                    .map(chapters, async ({ episodes }) => {
                        return await Promise
                            .map(episodes, async (course, index, episodes) => await this.extractVideos({
                                course,
                                ms,
                                index,
                                total: episodes.length
                            }))
                    })
                    .then(c => c.flat())

                ms.update('info', { text: `Extracting course: ${url} has ${e.length} episodes` });
                return e;
            })
            .then(async (courses) => {
                ms.succeed('info', { text: `Extraction is done for ${courses.length} videos from courses` });
                return courses;
            });
        /*.then(async courses => {
            //find all videos and flat them
            //return chapters.flatMap(({ episodes }) => episodes.map(episode => episode))
            return await Promise
                .map(courses, async (c) => {
                    let seriesResponse = await this._request({ url: `${this._laracastsUrl}/series/${c}` })
                    const e = seriesResponse.props.series.chapters
                        .flatMap(({ episodes }) => episodes.map(episode => episode))
                }, {
                    concurrency
                })
                .then(c => c.flat())
        })*/
        //.then(async (courses) => await this.makeConcurrentCalls(courses, ms));
    }

    /**
     *
     * @param course
     * @param ms
     * @param index
     * @param total
     * @returns {bluebird<{series: string, downPath: string, position: (*|"start"|"middle"|"end"|ReadPosition|number|LineAndPositionSetting|string), title: string, url: (*|string)}>}
     */
    async extractVideos({ course, ms, index, total }) {

        let url;
        if (!!course.download) {
            url = course.download.includes('https') ? course.download : 'https:' + course.download
        }

        //if (!course.vimeoId) {
        let videoDetails = await this._request({ url: this._laracastsUrl + course.path })
        url = videoDetails?.props?.downloadLink ?? null
        // console.log(`DOWNLOAD LINK FOUND for ${this._laracastsUrl + course.path} url: ${url}`);
        //}

        const series = sanitize(course.series.path.includes('/series/') ? course.series.path.replace('/series/', '') : course.series.path)
        const position = course.position
        const title = sanitize(`${position}. ${course.title}.mp4`)
        const downPath = `${series}`
        const path = `${this._laracastsUrl}${course.series.path}/episodes/${course.position}`
        const vimeoUrl = `https://player.vimeo.com/video/${course.vimeoId}?h=6191c5eb7c&color=328af1&autoplay=1&app_id=122963`
        // ms.update('info', { text: `Extracting: ${index}/${total} series ${series} - episode ${title}` });
        // console.log('series', series, 'episode', title);
        return {
            id           : course.id,
            hasTranscript: course.hasTranscript,
            source_code  : course.source_code,
            body         : course.body,
            series,
            url,
            title,
            position,
            downPath,
            ...(course.vimeoId && { vimeoUrl }),
            //...(course.vimeoId && { vimeoUrl }),
            path
        }

    };

    findVideoUrl(str, url) {
        // const regex = /(?:playerConfig = )(?:\{)(.*(\n.*?)*)(?:"\})(;)/gm;
        const regex = /window.playerConfig = {(.*)}; var/gm
        let res = regex.exec(str);
        let config;
        if (res !== null) {
            if (typeof res[0] !== "undefined") {
                try {
                    // console.log('res', res[1]);
                    // config = res[0].replace('window.playerConfig = ', '');
                    // config = config.replace(/(; var\s*$)/g, '');
                    // config = config.replace(/(;\s*$)/g, '');
                    const configParsed = JSON.parse(`{${res[1]}}`);
                    let progressive = configParsed.request.files.progressive;
                    let video = orderBy(progressive, ['width'], ['desc'])[0];
                    return video.url;
                } catch (err) {
                    console.log('error with findVideoUrl:', url, '-->err:', err);
                    console.log('json config:', config);
                    console.log('res:', res);
                    // await fs.writeFile(path.join(dest, 'markdown', `${course.title}.md`), md, 'utf8')//-${Date.now()}
                    fs.writeFileSync(`./json/test.txt`, res, 'utf8')
                    throw err;
                }

            }
        }
        return null;
        /*const regex = /(?:config = )(?:\{)(.*(\n.*?)*)(?:\"\})/gm;
        let res = regex.exec(str);
        if (res !== null) {
            if (typeof res[0] !== "undefined") {
                let config = res[0].replace('config = ', '');
                config = JSON.parse(config);

                let progressive = config.request.files.progressive;

                //let videoURL = progressive.find(vid => vid.quality === quality + 'p')?.url;

                let video = orderBy(progressive, ['height'], ['desc'])[0];
                //console.log('url', url, video);
                /!*if (!videoURL) {
                    console.log('-----no 1080p video', progressive);
                    //can't find 1080p quality let's see if there is 720p video
                    videoURL = progressive.find(vid => vid.quality === '720p')?.url;
                }*!/
                /!*for (let item of progressive) {
                    videoURL = item.url;
                    if (quality + 'p' === item.quality) {
                        //console.log('item 1440', item);
                        break;
                    } else {
                        //console.log('-----no item', item);
                    }
                }*!/
                // console.log('videoURL', videoURL);
                return video.url;
            }
        }
        return null;*/
    }

    async _vimeoRequest(course) {
        const vimeoUrl = course.vimeoUrl
        try {

            const v = await retry(async () => {//return
                const { body, attempts } = await request({
                    url        : vimeoUrl,
                    maxAttempts: 50,
                    headers    : {
                        'Referer'   : this._laracastsUrl,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/27.0.1453.110 Safari/537.36'
                    }
                })

                return this.findVideoUrl(body, vimeoUrl)
                // console.log('attempts', attempts);
            }, 6, 1e3, true)

            // yt-dlp --referer "https://laracasts.com/" "https://player.vimeo.com/video/722977328?h=9726bc7a98&color=328af1&autoplay=1&app_id=122963"
            const { headers, attempts: a } = await request({
                url         : v,
                json        : true,
                maxAttempts : 50,
                method      : "HEAD",
                fullResponse: true, // (default) To resolve the promise with the full response or just the body
                'headers'   : {
                    'Referer': this._laracastsUrl
                }
            })

            if (course?.url) {
                const response = await request({
                    url        : course.url,
                    maxAttempts: 50,
                    method     : "HEAD",
                })
                // console.log('response.statusCode:', typeof response.statusCode, response.statusCode);
                if (response.statusCode !== 429) {
                    let size = 0;
                    try {
                        size = await ufs(response.request.uri.href)
                    } catch (err) {
                        console.log('URL:', response.request.uri.href, 'ERR with ufs:', err);
                        if (err !== 'Couldn\'t get file size') {
                            throw err;
                        }
                    }

                    if (size > headers['content-length']) {
                        console.log('compare url->viemo', formatBytes(size), formatBytes(headers['content-length']), '----');
                        //console.log('compare: size > headers[\'content-length\']', size, headers['content-length'], response.request.uri.href);
                        return {
                            url: response.request.uri.href,
                            size
                        }
                    }
                }
            }
            return {
                //return here Vimeo url, instead of a particular video('v'), ytdl will get the best one
                url : vimeoUrl,
                // vimeo: vimeoUrl,
                size: headers['content-length']
            };
        } catch (err) {
            console.log('ERR::', err, 'vimeoUrl:', vimeoUrl, 'url:', course?.url);
            /*if (err.message === 'Received invalid status code: 404') {
                return Promise.resolve();
            }*/
            throw err;
        }
    };

    async getLinkAndPrepareResources(course, dest) {

        const [details,] = await Promise.all([
            this._vimeoRequest(course),
            //...(course.hasTranscript ? await fs.writeFile(path.join(dest, `transcript.json`), JSON.stringify(await this._request({ url: `https://laracasts.com/episodes/${course.id}/transcript` }), null, 2), 'utf8') : []),
            (async () => {
                if (course?.hasTranscript) {
                    await fs.ensureDir(path.join(dest, 'transcripts'))
                    //console.log('hasTranscript', course.hasTranscript, course.id, `https://laracasts.com/episodes/${course.id}/transcript`);
                    await fs.writeFile(path.join(dest, 'transcripts', `${course.title} transcript.json`), JSON.stringify(await this._request({ url: `https://laracasts.com/episodes/${course.id}/transcript` }), null, 2), 'utf8')
                }
                if (course?.source_code) {
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
                    await fs.writeFile(path.join(dest, 'markdown', `${course.title}.md`), md, 'utf8')//-${Date.now()}
                }
            })()
        ])
        return details;
    }

    async download({ opts, ms }) {
        const { file, filePath, source } = opts

        let courses = file
            ? require(filePath)
            : (source === 'all'
                    ? await this.getAllCoursesFromBrowseAllAPI({ ...opts, ms })
                    : await this.getAllCoursesFromSearchAPI({ ...opts, ms })
            ) //logger.promise(this.getAllCoursesFromBrowseAllAPI(opts), "Finding all courses from topics..")

        const prefix = 'courses'
        const filename = `${prefix}-${source}-${new Date().toISOString()}.json`
        //await this.d(file, source, courses, opts);
        await this.d(filename, prefix, courses, ms, opts)
    }

    async d(filename, prefix, courses, ms, opts) {
        const { logger, concurrency, file, filePath } = opts

        await Promise.all([
            (async () => {

                /*if (!file) {
                    const date = new Date().toISOString();
                    const destinationFile = path.join(process.cwd(), `json/courses-${source}-${date}.json`);
                    //write into file courses
                    await fs.writeFile(destinationFile, JSON.stringify(courses, null, 2), 'utf8')
                    console.log(`Courses and videos are saved in file: ${destinationFile}`);
                }*/

                if (!file) {
                    logger.info(`${prefix} - Starting writing to a file ...`)
                    await fs.writeFile(`./json/${filename}`, JSON.stringify(courses, null, 2), 'utf8')
                    logger.info(`${prefix} - Ended writing to a file ${filename}...`)
                    return Promise.resolve()
                }
                logger.info(`${prefix} - file is used`)
                return Promise.resolve()

            })(),
            (async () => {
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

                    const details = await this.getLinkAndPrepareResources(course, dest);
                    // console.log('details', details);

                    await downOverYoutubeDL(details, path.join(dest, course.title), {
                        downFolder: dest,
                        index,
                        ms
                    })

                    courses[index].done = true;
                    if (file) {
                        await fs.writeFile(filePath, JSON.stringify(courses, null, 2), 'utf8');
                    }
                    cnt++
                    //logger.info(`Completed download - ${path.join(dest, course.title)}`)
                }, {
                    concurrency//: 8
                })
                ms.stopAll();
                logger.succeed(`Downloaded all videos from ${prefix} api! (total: ${cnt})`)
            })()
        ])
    }

    async makeConcurrentCalls(courses, ms) {

        // extract videos and sanitize
        /*const videos = await Promise
            .map(courses, async (course, index) => await this.extractVideos({
                course,
                ms,
                index,
                length: courses.length
            }), { concurrency: opts.concurrency });*/
        const total = courses.length;
        ms.update('info', { text: `Start extracting  ${total} videos from found courses ` });

        const { results, errors } = await PromisePool
            // .withConcurrency(2)
            .for(courses)
            .handleError(async (error, course, pool) => {
                // if (error instanceof SomethingBadHappenedError) {
                //     return pool.stop()
                // }
                console.error('POOL error::', error);
            })
            .process(async (course, index, pool) => {
                /*if (condition) {
                    return pool.stop()
                }*/
                // console.log('course:', course);

                const videos = await this.extractVideos({
                    course,
                    ms,
                    index,
                    total
                });

                return videos
            })
        ms.succeed('info', { text: `Extraction is done` });

        return results;
    }
}

