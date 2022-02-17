// @ts-check
const fs = require('fs')
const fileSize = require('./fileSize')
const progress = require('request-progress');
// const request = require('request');
let request = require('requestretry').defaults({ retryDelay: 500, fullResponse: true })
const { writeWaitingInfo, formatBytes } = require('./writeWaitingInfo');

const getFilesizeInBytes = (filename) => {
    // console.log('stats', stats);
    return fs.existsSync(filename) ? fs.statSync(filename)["size"] : 0;
};

/**
 * @param {string} url
 * @param {*} dest
 * @param {*} ms
 * @param {*} index
 */
const downloadVideo = (url, dest, ms, index) => new Promise(function (resolve, reject) {
    const req = request({
        url,
        json: true,

        // The below parameters are specific to request-retry
        maxAttempts  : 5,   // (default) try 5 times
        retryDelay   : 5000,  // (default) wait for 5s before trying again
        retryStrategy: request.RetryStrategies.HTTPOrNetworkError // (default) retry on 5xx or network errors
    })
    const name = url + index;
    progress(req, { throttle: 2000, delay: 1000 })
        .on('progress', state => {
            writeWaitingInfo(state, dest, ms, name)
        })
        .on('end', () => {
            ms.succeed(name, { text: `End download video ${dest}` });
            resolve()
        })
        .on('error', err => {
            if (err.code === "ECONNRESET") {
                console.error(`Timeout occurs. Details ${err.message}`);
            }
            ms.remove(name, { text: err });
            console.log('ERROR while downloading:', err);
            reject(err);
        })
        .pipe(fs.createWriteStream(dest));
});

/**
 * @param {string} url
 * @param path
 * @param {import("fs").PathLike} dest
 * @param logger
 * @param concurrency
 * @param ms
 * @param index
 */
module.exports = async (url, dest, { logger, concurrency, ms, index } = {}) => {
    // const random = (Math.random() + 1).toString(36).substring(7)
    //url = encodeURI(url)
    const name = url + index
    // console.log('URL to downlad', url);
    ms.add(name, { text: `Checking if video is downloaded: ${dest}` });
    let remoteFileSize;
    try {
        const options = {
            method : 'GET',
            url    : url,
            headers: {
                Referer: 'https://laracasts.com/'
            }
        }
        remoteFileSize = await fileSize(options);

    } catch (e) {
        console.log('e:::', e);
        ms.fail(name, { text: `Cant download video: ${url}` });
        return;
    }

    let localSize = getFilesizeInBytes(`${dest}`)
    let localSizeInBytes = formatBytes(getFilesizeInBytes(`${dest}`))
    if (remoteFileSize === localSize) {
        ms.succeed(name, { text: `Video already downloaded: ${dest}` });
    } else {
        ms.update(name, { text: `${localSizeInBytes}/${formatBytes(remoteFileSize)} - Start download video: ${dest}` });
        return await downloadVideo(url, dest, ms, index)
    }

}
