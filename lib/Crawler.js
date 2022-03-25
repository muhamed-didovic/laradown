const fs = require('fs-extra')
const Promise = require('bluebird');
const sanitize = require('sanitize-filename')
const { range, orderBy, uniqBy, uniq, sortBy } = require('lodash')
const cheerio = require("cheerio");
// const { CookieJar } = require('tough-cookie')
const jarGot = require('jar-got')
// const urlRegexSafe = require('url-regex-safe')
const fileSize = require('promisify-remote-file-size')
// const request = require('request').defaults({ retryDelay: 500, fullResponse: true, jar:true })
// const request = require('requestretry').defaults({ retryDelay: 500, fullResponse: true, jar:true})

const req = require('requestretry');
const { formatBytes } = require("./helpers/writeWaitingInfo");
const j = req.jar();
const request = req.defaults({ jar: j, retryDelay: 500, fullResponse: true });
const { PromisePool } = require('@supercharge/promise-pool')

module.exports = class Crawler {

    /**
     * @param got
     * @param inertiaVersion
     */
    constructor(inertiaVersion = 'noop') {
        this._laracastsUrl = "https://laracasts.com"
        this._searchUrl = `${this._laracastsUrl}/search?page=`
        this._inertiaVersion = inertiaVersion
        //this._got = got
        this._req = request;
    }

    static async getCourses(opts) {
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
                // console.log('1. courses length', json?.props?.videos?.data.length);
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

                const r = range(2, ++meta.last_page);
                let courses = await Promise
                    .map(r, async index => {
                        // console.log('search url:', `https://laracasts.com/search?page=${index}`);
                        let { body } = await request({ url: `https://laracasts.com/search?page=${index}` })
                        const $ = cheerio.load(body)
                        const json = JSON.parse($('#app').attr('data-page'))
                        return json?.props?.videos?.data.map(item => {
                            return {
                                title: item.series.title,
                                value: `https://laracasts.com${item.series.path}`
                            }
                        });
                    }, /*{
                        concurrency: 10
                    }*/)
                    .then(c => c.flat())

                courses = orderBy([...json, ...courses], ['title'], ['asc']);
                courses = uniqBy(courses, 'title');
                fs.writeFileSync(`./json/search-courses.json`, JSON.stringify(courses, null, 2), 'utf8')
                // console.log('2. courses length', courses.length);
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
        const [, csrfToken] = /"csrfToken": '(.*)'/.exec(body)
        const { version } = JSON.parse($('#app').attr('data-page'))

        let [xsrfToken, session] = headers['set-cookie']
        let cookie = `${xsrfToken.split('%3D;')[0] + '%3D;'} ${session.split('%3D;')[0] + '%3D;'}`
        let sanitizeXsrfToken = (xsrfToken.split('XSRF-TOKEN=')[1]).split('%3D;')[0] + "="

        this._inertiaVersion = version

        return {
            sanitizeXsrfToken,
            cookie,
            version,
            csrfToken
        };
    };

    /**
     *
     * @param opts
     * @returns {bluebird<Crawler>}
     */
    login = async opts => {
        const { sanitizeXsrfToken, cookie, version, csrfToken } = await this.getTokensForLogin();

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
            let { body } = await this._req({
                url: opts.url,
                // jar: j,
                json   : true,
                headers: {
                    'x-inertia-version': this._inertiaVersion,
                    'x-inertia'        : 'true',
                }
            })

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

                        ms.update('info', { text: `Extracting ${++i}/${courses.length} course: ${c} has ${e.length} episodes` });
                        // ms.update('info', { text: `Course: ${c} has ${e.length} episodes` });
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

                        // return json?.props?.videos?.data;

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
                // console.log('1111', courses);
                ms.succeed('info', { text: `Extraction is done for ${courses.length} videos from courses` });
                return courses;
                //await this.makeConcurrentCalls(courses, ms)
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
                // console.log('1111', courses);
                ms.succeed('info', { text: `Extraction is done for ${courses.length} videos from courses` });
                return courses;
                //await this.makeConcurrentCalls(courses, ms)
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

    /**
     *
     * @param course
     * @param ms
     * @param index
     * @param total
     * @returns {bluebird<{series: string, downPath: string, position: (*|"start"|"middle"|"end"|ReadPosition|number|LineAndPositionSetting|string), title: string, url: (*|string)}>}
     */
    extractVideos({ course, ms, index, total }) {

        let url;
        if (!!course.download) {
            url = course.download.includes('https') ? course.download : 'https:' + course.download
        }

        /*if (!course.vimeoId) {
            let videoDetails = await this._request({ url: this._laracastsUrl + course.path })
            url = videoDetails?.props?.downloadLink ?? null
            console.log(`NO DOWNLOAD LINK FOUND for ${this._laracastsUrl + course.path} url: ${url}`);
        }*/

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
            path
        }

    };

    findVideoUrl(str, quality) {
        const regex = /(?:config = )(?:\{)(.*(\n.*?)*)(?:\"\})/gm;
        let res = regex.exec(str);
        if (res !== null) {
            if (typeof res[0] !== "undefined") {
                let config = res[0].replace('config = ', '');
                config = JSON.parse(config);
                let progressive = config.request.files.progressive, videoURL;
                for (let item of progressive) {
                    videoURL = item.url;
                    if (quality + 'p' === item.quality)
                        break;
                }
                return videoURL;
            }
        }
        return null;
    }

    async _vimeoRequest(url) {
        try {
            let { body } = await jarGot()(url, {
                headers: {
                    'Referer': this._laracastsUrl
                }
            })
            /*var options = {
                'method': 'GET',
                'url': url,
                'headers': {
                    'Referer': 'https://laracasts.com'
                }
            };
            request(options, function (error, response) {
                if (error) throw new Error(error);
                console.log(response.body);
            });*/

            // console.log('url', url);
            // return;

            /*const body = await this._request({
                url: url,

                json       : false,
                maxAttempts: 50,
                method     : "GET",

                fullResponse: false, // (default) To resolve the promise with the full response or just the body

                'hostname': 'player.vimeo.com',
                //'path': '/video/689808234?h=6191c5eb7c&color=328af1&autoplay=1&app_id=122963&=null',

                headers: {
                    'Referer': this._laracastsUrl
                }
            })
            console.log('body', body);*/
            // console.log('1, best', this.findVideoUrl(body, '1080p'));
            const v = this.findVideoUrl(body, '1080p')

            const { headers } = await request({
                url         : v,
                json        : true,
                maxAttempts : 50,
                method      : "HEAD",
                fullResponse: true, // (default) To resolve the promise with the full response or just the body
                'headers'   : {
                    'Referer': this._laracastsUrl
                }
            })
            // const size = await  fileSize({
            //     'method' : 'GET',
            //     'url'    : v,
            //     'headers': {
            //         'Referer': this._laracastsUrl
            //     }
            // })

            // console.log('Size', url, headers['content-length']);
            return {
                url : v,
                size: headers['content-length']
            };
        } catch (err) {
            if (err.message === 'Received invalid status code: 404') {
                return Promise.resolve();
            }
            throw err;
        }


        //scrape for a video
        /*let videos = body
            .match(urlRegexSafe())
            .filter(url => url.includes('https://vod-progressive.akamaized.net'))

        //find the biggest videos
        return await Promise
            .map(videos, async url => {
                let size = await fileSize({
                    'method' : 'GET',
                    'url'    : url,
                    'headers': {
                        'Referer': this._laracastsUrl
                    }
                })
                // console.log('Size', url, size);
                return {
                    url,
                    size
                };
            })
            .then(this.findBestVideo)
            .catch(err => {
                console.log('ERROR WITH VIMEO REQUEST', url, err);
                throw err;
            })*/
    };

    /**
     *
     * @param videosArray
     * @returns {*}
     */
    findBestVideo(videosArray) {
        let max = Math.max(...videosArray.map(v => v.size))
        //console.log('2 best', (videosArray.find(o => o.size === max)));
        return (videosArray.find(o => o.size === max))
    }
}

