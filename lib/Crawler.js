// const fs = require('fs-extra')
const Promise = require('bluebird');
const sanitize = require('sanitize-filename')
const { range } = require('lodash')
const cheerio = require("cheerio");
const { CookieJar } = require('tough-cookie')
const jarGot = require('jar-got')
const urlRegexSafe = require('url-regex-safe')
const fileSize = require("./helpers/fileSize")
// const request = require('request').defaults({ retryDelay: 500, fullResponse: true, jar:true })
// const request = require('requestretry').defaults({ retryDelay: 500, fullResponse: true, jar:true})

/*let request = require('requestretry');
const j = request.jar();
request = request.defaults({ jar: j, retryDelay: 500, fullResponse: true });*/
// const fileSize = require("./helpers/fileSize");

module.exports = class Crawler {

    /**
     * @param got
     * @param inertiaVersion
     */
    constructor(got = jarGot(), inertiaVersion = 'noop') {
        this._laracastsUrl = "https://laracasts.com"
        this._searchUrl = `${this._laracastsUrl}/search?page=`
        this._inertiaVersion = inertiaVersion
        this._got = got
        // this._req = request;
    }

    /**
     *
     * @param saved
     * @param inertiaVersion
     * @returns {Crawler}
     */
    static restore = (saved, inertiaVersion) => new Crawler(jarGot(CookieJar.deserializeSync(saved)), inertiaVersion);

    /**
     *
     * @returns {*}
     */
    save = () => this._got.jar.serializeSync();

    /**
     *
     * @returns {bluebird<{cookie: string, sanitizeXsrfToken: string, version: *}>}
     */
    async getTokensForLogin() {
        const { body, headers } = await this._got(this._laracastsUrl)

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

        const post = await this._got.post(`${this._laracastsUrl}/sessions?return=/`, {
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

        //save cookies
//        let saved = this.save();

        const body = await this._request({ url: `${this._laracastsUrl}/search?page=1` })

        if (!body.props.auth.signedIn) {
            throw new Error('User is not logged')
        }

        //return new instance of crawler with cookies and inertia version
        //return Crawler.restore(saved, this._inertiaVersion);
        return this;
    };

    /**
     *
     * @returns {bluebird<*>}
     */
    getInertiaVersion = async () => {
        const { body, headers } = await this._got(this._laracastsUrl)
        const $ = cheerio.load(body)
        const { version } = JSON.parse($('#app').attr('data-page'))
        return version;
    };

    /**
     *
     * @returns {bluebird<string>}
     */
    getCsrfToken = async () => {
        const { body } = await this._got(this._laracastsUrl)
        const [, csrfToken] = /"csrfToken": '(.*)'/.exec(body)
        return csrfToken
    };

    /**
     * @param {any} opts
     */
    async _request(opts) {
        let { body } = await this._got(opts.url, {
            json   : true,
            headers: {
                'x-inertia-version': this._inertiaVersion,
                'x-inertia'        : 'true',
            }
        })
        return body;
    }

    /**
     *
     * @returns {bluebird<*>}
     */
    async getAllCoursesFromBrowseAllAPI(opts) {
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
                            return serie.slug;
                        });
                    }, {
                        concurrency: opts.concurrency
                    })
                    .then((data) => data.flat())

            })
            .then(async (courses) => {
                return await Promise
                    .map(courses, async (course) => {
                        let seriesResponse = await this._request({ url: `${this._laracastsUrl}/series/${course}` })
                        const e = seriesResponse.props.series.chapters
                            .flatMap(({ episodes }) => episodes.map(episode => episode))
                        //console.log('EPISODES', e.length);
                        return e;
                    }, {
                        concurrency: opts.concurrency
                    })
                    .then(c => c.flat())
            })
            .then(async chapters => {
                // extract videos and sanitize
                return await Promise.map(chapters, async (course) => await this.extractVideos(course), {
                    concurrency: opts.concurrency
                });
            });
    }

    /**
     *
     * @returns {bluebird<*>}
     */
    async getAllCoursesFromSearchAPI(opts) {
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
                        let json = await this._request({ url: `${this._searchUrl}${index}` })

                        return json?.props?.videos?.data;
                    }, {
                        concurrency: opts.concurrency
                    })
                    .then(c => c.flat())
                // return courses.flat()
            })
            .then(async (courses) => {
                return await Promise.map(courses, async (course) => await this.extractVideos(course), {
                    concurrency: opts.concurrency
                });
            });
    }

    /**
     *
     * @param url
     * @returns {bluebird<*>}
     */
    async getSingleCourse(url) {
        return Promise
            .resolve()
            .then(async () => {
                //get the chapters or videos from requests
                let json = await this._request({ url })
                let { chapters } = json.props.series;//.chapters[0].episodes;
                return chapters;
            })
            .then(chapters => {
                //find all videos and flat them
                return chapters.flatMap(({ episodes }) => episodes.map(episode => episode))
            })
            .then(async chapters => {
                // extract videos and sanitize
                return await Promise.map(chapters, async (course) => await this.extractVideos(course));
            });
    }

    /**
     *
     * @param course
     * @returns {bluebird<{series: string, downPath: string, position: (*|"start"|"middle"|"end"|ReadPosition|number|LineAndPositionSetting|string), title: string, url: (*|string)}>}
     */
    async extractVideos(course) {

        let url;
        if (!!course.download) {
            url = course.download.includes('https') ? course.download : 'https:' + course.download
        } else {
            let videoDetails = await this._request({ url: this._laracastsUrl + course.path })
            url = videoDetails.props.downloadLink
        }
        const series = sanitize(course.series.path.includes('/series/') ?  course.series.path.replace('/series/', '') : course.series.path)
        const position = course.position
        const title = sanitize(`${position}. ${course.title}.mp4`)
        const downPath = `${series}`
        const path = `${this._laracastsUrl}${course.series.path}/episodes/${course.position}`
        const vimeoUrl = `https://player.vimeo.com/video/${course.vimeoId}?h=6191c5eb7c&amp;color=328af1&amp;autoplay=1&amp;app_id=122963`
        console.log('series', series, 'episode', title);
        return {
            series,
            url,
            title,
            position,
            downPath,
            ...(course.vimeoId && { vimeoUrl }),
            path
        }

    };

    async _vimeoRequest(url) {
        let { body } = await this._got(`${url}`, {
            headers: {
                'Referer': this._laracastsUrl
            }
        })

        //scrape for a video
        let videos = body
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
    };

    /**
     *
     * @param videosArray
     * @returns {*}
     */
    findBestVideo(videosArray) {
        let max = Math.max(...videosArray.map(v => v.size))
        return (videosArray.find(o => o.size === max))['url']
    }
}

