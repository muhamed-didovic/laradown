// const fs = require('fs-extra')
const Promise = require('bluebird');
const sanitize = require('sanitize-filename')
const { range } = require('lodash')
const cheerio = require("cheerio");
const { CookieJar } = require('tough-cookie')
const jarGot = require('jar-got')

module.exports = class Crawler {

    /**
     * @param got
     * @param inertiaVersion
     */
    constructor(got = jarGot(), inertiaVersion = 'noop') {
        this._laracastsUrl = "https://laracasts.com"
        this._searchUrl = "https://laracasts.com/search?page="
        this._inertiaVersion = inertiaVersion
        this._got = got
    }

    static restore(saved, inertiaVersion) {
        return new Crawler(jarGot(CookieJar.deserializeSync(saved)), inertiaVersion)
    }

    save() {
        //this._version = version
        return this._got.jar.serializeSync()
    }

    async login(opts) {
        const post = await this._got.post('https://laracasts.com/sessions', {
            throwHttpErrors: false,
            followRedirect : true,
            headers        : {
                'content-type': 'application/json',
                "X-CSRF-TOKEN": await this.getCsrfToken(),
            },
            body           : JSON.stringify({
                email   : opts.email,
                password: opts.password,
                remember: 1
            }),
            verify         : false
        })

        //save cookies
        let saved = this.save();

        //get inertia
        const inertiaVersion = await this.getInertiaVersion();

        //return new instance of crawler with cookies and inertia version
        return Crawler.restore(saved, inertiaVersion);

    }

    async getInertiaVersion() {
        const { body } = await this._got('https://laracasts.com')
        const $ = cheerio.load(body)
        const { version } = JSON.parse($('#app').attr('data-page'))
        return version;
    }

    async getCsrfToken() {
        const { body } = await this._got('https://laracasts.com')
        const [, csrfToken] = /"csrfToken": '(.*)'/.exec(body)
        return csrfToken
    }

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

    //
    async getAllCoursesFromBrowseAllAPI() {
        return Promise
            .resolve()
            .then(async () => {
                let json = await this._request({ url: `https://laracasts.com/browse/all` })
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
                    })
                    .then((data) => data.flat())

            })
            .then(async (courses) => {
                // console.log('courses length', courses.length);
                return await Promise
                    .map(courses, async (course) => {
                        let seriesResponse = await this._request({ url: `https://laracasts.com/series/${course}` })
                        return seriesResponse.props.series.chapters
                            .flatMap(({ episodes }) => {
                                return episodes.map(episode => episode)
                            })
                    })
                    .then(c => c.flat())
            })
            .then(async chapters => {
                // extract videos and sanitize
                return await Promise.map(chapters, async (course) => await this.extractVideos(course));
            })
    }

    async getAllCoursesFromSearchAPI() {
        return Promise
            .resolve(range(68))
            .then(async (range) => {
                return await Promise
                    .map(range, async index => {
                        // console.log('`${this.searchUrl}${index}`', `${this.searchUrl}${index}`);
                        let json = await this._request({ url: `${this._searchUrl}${index}` })

                        /*links: {
                          first: 'https://laracasts.com/search?page=1',
                            last: 'https://laracasts.com/search?page=67',
                            prev: null,
                            next: 'https://laracasts.com/search?page=2'
                        },*/

                        return json?.props?.videos?.data;
                    })
                    .then(c => c.flat())
                // return courses.flat()
            })
            .then(async (courses) => {
                return await Promise.map(courses, async (course) => await this.extractVideos(course));
            })
    }

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
            })

    }

    async extractVideos(course) {
        let url;
        if (course.download) {
            url = course.download.includes('https') ? course.download : 'https:' + course.download
        } else {
            let videoDetails = await this._request({ url: this._laracastsUrl + course.path })
            url = videoDetails.props.downloadLink
        }
        let series = sanitize(course.series.title)
        let position = course.position
        let title = sanitize(`${position}. ${course.title}.mp4`)
        let downPath = `${series}`
        return {
            series,
            url,
            title,
            position,
            downPath
        }

    }
}
