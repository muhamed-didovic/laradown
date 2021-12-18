# Scrape videos (courses) from Laracasts.com
[![npm](https://badgen.net/npm/v/laradown)](https://www.npmjs.com/package/laradown)

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
    --all, -a           Get all courses.
    --email, -e         Your email.
    --password, -p      Your password.
    --directory, -d     Directory to save.
    --type, -t  source|course Type of download.

Examples
    $ laradown
    $ laradown -a
    $ laradown https://laracasts.com/series/php-testing-jargon -t course
    $ laradown [-e user@gmail.com] [-p password] [-d dirname] [-t source]
```

## License
MIT
