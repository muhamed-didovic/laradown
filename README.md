# Downloader and scraper for Laracasts.com for pro members

[![npm](https://badgen.net/npm/v/laradown)](https://www.npmjs.com/package/laradown)
[![Hits](https://hits.seeyoufarm.com/api/count/incr/badge.svg?url=https%3A%2F%2Fgithub.com%2Fmuhamed-didovic%2Flaradown&count_bg=%2379C83D&title_bg=%23555555&icon=&icon_color=%23E7E7E7&title=hits&edge_flat=false)](https://hits.seeyoufarm.com)
[![license](https://flat.badgen.net/github/license/muhamed-didovic/laradown)](https://github.com/muhamed-didovic/laradown/blob/master/LICENSE)

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
    $ laradown [-e user@gmail.com] [-p password] [-d dirname] [-c number] [-f path-to-file]
```

## License
MIT
