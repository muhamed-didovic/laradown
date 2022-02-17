# Scrape videos (courses) from Laracasts.com for members
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
