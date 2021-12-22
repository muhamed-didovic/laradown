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
     * @param opts
     * @returns {bluebird<Crawler>}
     */
    login = async opts => {
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

    };

    /**
     *
     * @returns {bluebird<*>}
     */
    getInertiaVersion = async () => {
        const { body } = await this._got('https://laracasts.com')
        const $ = cheerio.load(body)
        const { version } = JSON.parse($('#app').attr('data-page'))
        return version;
    };

    /**
     *
     * @returns {bluebird<string>}
     */
    getCsrfToken = async () => {
        const { body } = await this._got('https://laracasts.com')
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
    getAllCoursesFromBrowseAllAPI = async () => Promise
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
        });

    /**
     *
     * @returns {bluebird<*>}
     */
    getAllCoursesFromSearchAPI = async () => Promise
        .resolve()
        .then(async () => {
            //range(68)
            console.log('`${this._searchUrl}1`', `${this._searchUrl}1`)
            let json = await this._request({ url: `${this._searchUrl}1` })
            console.log('json', json.props.videos.meta);
            return json.props.videos.meta;
        })
        .then(async (meta) => {
            const r = range(++meta.last_page);
            console.log('r',r);
            return await Promise
                .map(r, async index => {
                    // console.log('`${this.searchUrl}${index}`', `${this.searchUrl}${index}`);
                    let json = await this._request({ url: `${this._searchUrl}${index}` })


                    return json?.props?.videos?.data;
                })
                .then(c => c.flat())
            // return courses.flat()
        })
        .then(async (courses) => {
            return await Promise.map(courses, async (course) => await this.extractVideos(course));
        });

    /**
     *
     * @param url
     * @returns {bluebird<*>}
     */
    getSingleCourse = async url => Promise
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

    /**
     *
     * @param course
     * @returns {bluebird<{series: string, downPath: string, position: (*|"start"|"middle"|"end"|ReadPosition|number|LineAndPositionSetting|string), title: string, url: (*|string)}>}
     */
    extractVideos = async course => {
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

    };
}

