// @ts-check
const fileSize = require('./fileSize')
const { formatBytes, writeWaitingInfoDL } = require('./writeWaitingInfo');
const { createLogger, isCompletelyDownloaded } = require("./fileChecker");
const path = require('path')
const fs = require('fs-extra')
const Promise = require('bluebird')
// const youtubedl = require("youtube-dl-wrap")
const logger = require("./logger.js");
const YTDlpWrap = require('yt-dlp-wrap').default;

const pRetry = require('@byungi/p-retry').pRetry
const pDelay = require('@byungi/p-delay').pDelay

const getFilesizeInBytes = filename => {
    return fs.existsSync(filename) ? fs.statSync(filename)["size"] : 0;
};

const download = (url, dest, { localSizeInBytes, remoteSizeInBytes, downFolder, index = 0, ms }) => {
    return new Promise(async (resolve, reject) => {
        const videoLogger = FileChecker.createLogger(downFolder);
        // await fs.remove(dest) // not supports overwrite..
        let name = dest + index;
        ms.update(name, {
            text : `to be processed by yt-dlp... ${ dest.split('/').pop() } Found:${ localSizeInBytes }/${ remoteSizeInBytes }`,
            color: 'blue'
        });
        // logger.log(`to be processed by yt-dlp... ${dest.split('/').pop()} Found:${localSizeInBytes}/${remoteSizeInBytes}`)

        // const youtubeDlWrap = new youtubedl()
        // let youtubeDlEventEmitter = youtubeDlWrap
        const ytDlpWrap = new YTDlpWrap();
        let ytDlpEventEmitter = ytDlpWrap
            .exec([
                url,
                // '--all-subs',

                "--write-subs",
                "--write-auto-sub",

                '--referer', 'https://laracasts.com/',
                "-o", path.resolve(dest),
                '--socket-timeout', '5'
            ])
            /*.on("progress", (progress) => {
                ms.update(name, { text: `${index}. Downloading: ${progress.percent}% of ${progress.totalSize} at ${progress.currentSpeed} in ${progress.eta} | ${dest.split('/').pop()} Found:${localSizeInBytes}/${remoteSizeInBytes}` })
            })*/
            .on('ytDlpEvent', (eventType, eventData) =>
                // logger.log(eventType, eventData)
                //65.0% of   24.60MiB at    6.14MiB/s ETA 00:01
                ms.update(name, { text: `${ eventType }: ${ eventData } | ${ dest.split('/').pop() } Found:${ localSizeInBytes }/${ remoteSizeInBytes }` })
            )
            // .on("youtubeDlEvent", (eventType, eventData) => logger.log(eventType, eventData))
            .on("error", (error) => {
                ms.remove(name, { text: error })
                logger.log('URL:', url, 'dest:', dest, 'error--', error)
                //ms.remove(dest);
                /*fs.unlink(dest, (err) => {
                    reject(error);
                });*/
                reject(error);

            })
            .on("close", () => {
                //ms.succeed(dest, { text: `${index}. End download yt-dlp: ${dest} Found:${localSizeInBytes}/${remoteSizeInBytes} - Size:${formatBytes(getFilesizeInBytes(dest))}` })//.split('/').pop()
                ms.remove(name);
                logger.log(`${ index }. End download yt-dlp: ${ dest } Found:${ localSizeInBytes }/${ remoteSizeInBytes } - Size:${ formatBytes(getFilesizeInBytes(dest)) }`);
                // videoLogger.write(`${dest} Size:${getFilesizeInBytes(dest)}\n`);
                FileChecker.write(downFolder, dest)
                resolve()
            })

    });
};

const downloadVideo = async (url, dest, {
    localSizeInBytes,
    remoteSizeInBytes,
    downFolder,
    index,
    ms
}) => {
    try {
        await pRetry(() => download(url, dest,
            {
                localSizeInBytes,
                remoteSizeInBytes,
                downFolder,
                index,
                ms
            }), {
            retries        : 3,
            onFailedAttempt: error => {
                logger.log(`Attempt ${ error.attemptNumber } failed. There are ${ error.retriesLeft } retries left.`);
                // 1st request => Attempt 1 failed. There are 4 retries left.
                // 2nd request => Attempt 2 failed. There are 3 retries left.
                // …
            }
        })
    } catch (e) {
        logger.log('eeee', e);
        ms.remove(dest, { text: `Issue with downloading` });
        //reject(e)
    }
}


const newDownload = async (url, dest, {
    file,
    localSizeInBytes,
    remoteSizeInBytes,
    downFolder,
    index = 0,
    ms
}) => {
    return new Promise(async (resolve, reject) => {
        // logger.log('file', file);
        // const { skipVimeoDownload, vimeoUrl } = file;

        const videoLogger = createLogger(downFolder);
        // await fs.remove(dest) // not supports overwrite..
        ms.update(dest, {
            text : `to be processed by yt-dlp... ${ dest.split('/').pop() } Found:${ localSizeInBytes }/${ remoteSizeInBytes }`,
            color: 'blue'
        });
        // logger.log(`to be processed by youtube-dl... ${dest.split('/').pop()} Found:${localSizeInBytes}/${remoteSizeInBytes} - ${url}`)
        // return Promise.resolve()
        // https://player.vimeo.com/texttrack/17477597.vtt?token=6321c441_0x383403d52f6fdaa619c98c88b50efbb63b6d0096
        const ytDlpWrap = new YTDlpWrap();
        let ytDlpEventEmitter = ytDlpWrap
            .exec([
                url,

                "--write-subs",
                "--write-auto-sub",
                //"--sub-lang", "en.*",

                '--referer', 'https://laracasts.com/',
                "-o", path.resolve(dest),
                '--socket-timeout', '5',

                '--retries', 'infinite',
                '--fragment-retries', 'infinite'

                // "-o", path.toNamespacedPath(dest),
                // '--socket-timeout', '5',
                //...(skipVimeoDownload ? ['--skip-download'] : []),
            ])
            .on('ytDlpEvent', (eventType, eventData) =>
                // logger.log(eventType, eventData)
                //65.0% of   24.60MiB at    6.14MiB/s ETA 00:01
                ms.update(dest, { text: `${ eventType }: ${ eventData } | ${ dest.split('/').pop() } Found:${ localSizeInBytes }/${ remoteSizeInBytes }` })
            )
            // .on("youtubeDlEvent", (eventType, eventData) => logger.log(eventType, eventData))
            .on("error", (error) => {
                // ms.remove(dest)//, { text: error }
                //if (!error.message.includes('Unable to extract info section')) {
                logger.log('URL:', url, 'dest:', dest, 'error--', error)
                //}

                // logger.log('------> tu smo');
                /*fs.unlink(dest, (err) => {
                    reject(error);
                });*/
                //return Promise.reject(error)
                //if (!error.message.includes('Unable to download video subtitles')) {
                reject(error);
                //}
            })
            .on("close", async () => {
                //ms.succeed(dest, { text: `${index}. End download yt-dlp: ${dest} Found:${localSizeInBytes}/${remoteSizeInBytes} - Size:${formatBytes(getFilesizeInBytes(dest))}` })//.split('/').pop()
                // ms.remove(dest);
                logger.log(`${ index }. End download yt-dlp: ${ dest } Found:${ localSizeInBytes }/${ remoteSizeInBytes } - Size:${ formatBytes(getFilesizeInBytes(dest)) }`);
                // videoLogger.write(`${dest} Size:${getFilesizeInBytes(dest)}\n`);
                //FileChecker.write(downFolder, dest)


                /*try {
                    let stdout = await ytDlpWrap.execPromise([
                        url,

                        "--write-subs",
                        "--write-auto-sub",
                        //"--sub-lang", "en.*",

                        '--referer', 'https://laracasts.com/',
                        "-o", path.resolve(dest),
                        // '--socket-timeout', '5',

                        // '--retries', 'infinite',
                        // '--fragment-retries', 'infinite',
                        '--skip-download'

                        // "-o", path.toNamespacedPath(dest),
                    ]);
                    // logger.log('stdout',stdout);
                    videoLogger.write(`${dest} Size:${getFilesizeInBytes(dest)}\n`);
                    logger.log(`End download subtitle`);
                    resolve()
                } catch (error) {
                    // logger.log('eeeeeeee:', error.message);
                    if (!error.message.includes('Unable to extract info section')) {
                        logger.log('Error with subtitle download URL:', url, 'dest:', dest, 'error--', error)
                    }
                    if (error.message.includes('Unable to download video subtitles')) {
                        resolve()
                    } else {
                        reject(error)
                    }
                }*/
                videoLogger.write(`${ dest } Size:${ getFilesizeInBytes(dest) }\n`);
                resolve()
            })
    })
}

const slowForever = async runner => {
    // options:
    // retries - Number of retries. Default is 1.
    // interval - Delay before retry. Default is 0.
    const [res] = await Promise.all([pRetry(runner, { retries: 5, interval: 3000 }), pDelay(2000)])//{retries: Infinity, interval: 30000}
    return res
}

/**
 * @param file
 * @param {import("fs").PathLike} dest
 * @param downFolder
 * @param index
 * @param ms
 */
module.exports = async (file, dest, { downFolder, index, ms } = {}) => {
    //const dest = path.join(downloadFolder, course.title)
    // logger.log('url', url);
    const url = file.url;
    let remoteFileSize = file.size;
    const name = dest// + index;
    ms.add(name, { text: `Checking if video is downloaded: ${ dest.split('/').pop() }` });
    // logger.log(`Checking if video is downloaded: ${dest.split('/').pop()}`);

    //check if mpd is returned instead of mp4, so we need to check if we have video in videos.txt
    let isDownloaded = false;
    let localSize = getFilesizeInBytes(`${ dest }`)
    let localSizeInBytes = formatBytes(getFilesizeInBytes(`${ dest }`))
    //logger.log(`Checking ${formatBytes(remoteFileSize)}/${formatBytes(remoteFileSize)} isCompletelyDownloaded: ${isDownloaded} for ${dest}`);
    //if (remoteFileSize < 2000) {
    //videos/AngularJS/lessons/005-angularjs-defining-a-method-on-the-scope.mp4 Size:12841002
    isDownloaded = isCompletelyDownloaded(downFolder, dest, remoteFileSize)
    // logger.log(`Checking ${localSizeInBytes}/${formatBytes(remoteFileSize)} isCompletelyDownloaded: ${isDownloaded} for ${dest}`);
    ms.update(name, { text: `Checking size over file: ${ formatBytes(remoteFileSize) } isCompletelyDownloaded: ${ isDownloaded } for ${ dest }` });
    //}

    // fs.writeFileSync(`${dest}.json`, JSON.stringify(info, null, 2), 'utf8');
    // logger.log(`-----`, remoteFileSize,  localSize, isDownloaded);
    if (remoteFileSize === localSize || isDownloaded) {
        //ms.succeed(name, { text: `${index}. Video already downloaded: ${dest.split('/').pop()} - ${localSizeInBytes}/${formatBytes(remoteFileSize)}` });
        ms.remove(name);
        logger.log(`${ index }. Video already downloaded: ${ dest.split('/').pop() } - ${ localSizeInBytes }/${ formatBytes(remoteFileSize) }`);
        // logger.log(`${index}. Video already downloaded: ${dest.split('/').pop()} - ${localSizeInBytes}/${formatBytes(remoteFileSize)}`.blue);
        // downloadBars.create(100, 100, { eta: 0, filename: dest })
        return;
    } else {
        ms.update(name, { text: `${ index } Start download video: ${ dest.split('/').pop() } - ${ localSizeInBytes }/${ formatBytes(remoteFileSize) } ` });
        //ms.remove(name)
        // logger.log(`${index} Start ytdl download: ${dest.split('/').pop()} - ${localSizeInBytes}/${formatBytes(remoteFileSize)} `);
        await slowForever(async () => await newDownload(url, dest, {
                file,
                localSizeInBytes,
                remoteSizeInBytes: formatBytes(remoteFileSize),
                downFolder,
                index,
                ms
            })
        )
        ms.remove(dest)
        //return;
    }
}

