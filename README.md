[![npm](https://badgen.net/npm/v/laradown)](https://www.npmjs.com/package/laradown)
[![Downloads](https://img.shields.io/npm/dm/laradown.svg?style=flat)](https://www.npmjs.org/package/laradown)
[![Hits](https://hits.seeyoufarm.com/api/count/incr/badge.svg?url=https%3A%2F%2Fgithub.com%2Fmuhamed-didovic%2Flaradown&count_bg=%2379C83D&title_bg=%23555555&icon=&icon_color=%23E7E7E7&title=hits&edge_flat=false)](https://hits.seeyoufarm.com)
[![license](https://flat.badgen.net/github/license/muhamed-didovic/laradown)](https://github.com/muhamed-didovic/laradown/blob/main/LICENSE)

# Downloader and scraper for Laracasts.com for pro members

## Requirement
- Node 18
- yt-dlp (https://github.com/yt-dlp/yt-dlp)

## Install
```sh
npm i -g laradown
```

#### without Install
```sh
npx laradown
```

## CLI
```sh
Usage
    $ laradown [CourseUrl]

Options
    --all, -a           Download everything from browse/all and search APIs.
    --email, -e         Your email.
    --password, -p      Your password.
    --directory, -d     Directory to save.
    --file, -f          Location of the file where are the courses
    --concurrency, -c

Examples
    $ laradown
    $ laradown -a
    $ laradown https://laracasts.com/series/php-testing-jargon -t course
    $ [DEBUG=scraper*] laradown [-e user@gmail.com] [-p password] [-d dirname] [-c number] [-f path-to-file]
```

## Log and debug
This module uses [debug](https://github.com/visionmedia/debug) to log events. To enable logs you should use environment variable `DEBUG`.
Next command will log everything from `scraper`
```bash
export DEBUG=scraper*; laradown
```

Module has different loggers for levels: `scraper:error`, `scraper:warn`, `scraper:info`, `scraper:debug`, `scraper:log`. Please read [debug](https://github.com/visionmedia/debug) documentation to find how to include/exclude specific loggers.

## License
MIT
