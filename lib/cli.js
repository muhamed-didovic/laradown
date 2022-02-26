#!/usr/bin/env node
const meow = require('meow')
const prompts = require('prompts')
const createLogger = require('./helpers/createLogger')
const { laraOne, laraAll } = require('.')
const path = require('path')
const isValidPath = require("is-valid-path")
const fs = require('fs-extra')
const Crawler = require("./Crawler")
const Fuse = require('fuse.js')

const cli = meow(`
Usage
    $ laradown <?SeriesUrl>

Options
    --all, -a           Download everything from browse/all and search APIs.
    --email, -e         Your email.
    --password, -p      Your password.
    --directory, -d     Directory to save.
    --file, -f          Location of the file where are the courses
    --concurrency, -c

Examples
    $ laradown
    $ laradown --all [-e user@mail.com] [-p password] [-d path-to-directory] [-c concurrency-number] [-f path-to-file]
    $ laradown https://laracasts.com/series/graphql-with-laravel-and-vue

`, {
    flags: {
        help       : { alias: 'h' },
        version    : { alias: 'v' },
        all        : { type: 'boolean', alias: 'a' },
        email      : { type: 'string', alias: 'e' },
        password   : { type: 'string', alias: 'p' },
        directory  : { type: 'string', alias: 'd', default: process.cwd() },
        concurrency: { type: 'number', alias: 'c', default: 10},
        file       : { type: 'boolean', alias: 'f' }
    }
})

const logger = createLogger()
// const errorHandler = err => (console.log('\u001B[1K'), logger.fail(String(err)), process.exit(1))
const errorHandler = err => (console.error(err), logger.fail(String(err)), process.exit(1))

const askOrExit = question => prompts({ name: 'value', ...question }, { onCancel: () => process.exit(0) }).then(r => r.value);

const askOverwriteOrExit = () => askOrExit({
    type: 'confirm', message: 'Do you want to overwrite when the file name is the same?', initial: false
});

const askSaveDirOrExit = () => askOrExit({
    type: 'text', message: 'Enter the directory to save.', initial: process.cwd(), validate: isValidPath
});

const folderContents = async (folder) => {
    const options = [];
    await fs.readdir(folder, function (err, files) {
        //handling error
        if (err) {
            return console.log('Unable to scan directory: ' + err);
        }
        //listing all files using forEach
        files.forEach(function (file) {
            options.push({
                title: file,
                value: path.join(folder, file)
            });
        });
    });
    return options;
}

(async () => {
    const { flags, input } = cli
    const fileChoices = await folderContents(path.resolve(process.cwd(), 'json'))

    if (flags.all || (input.length === 0 && await askOrExit({
        type: 'confirm', message: 'Do you want all courses?', initial: false
    }))) {
        const file = flags.file || await askOrExit({
            type   : 'confirm',
            message: 'Do you want download from a file',
            initial: false
        })

        const filePath = flags.file || await askOrExit({
            type    : file ? 'autocomplete' : null,
            message : `Enter a file path eg: ${path.resolve(process.cwd(), 'json/*.json')} `,
            choices : fileChoices,
            validate: isValidPath
        })

        const email = flags.email || await askOrExit({
            type    : 'text',
            message : 'Enter email',
            validate: value => value.length < 5 ? `Sorry, enter correct email` : true
        })
        const password = flags.password || await askOrExit({
            type    : 'text',
            message : 'Enter password',
            validate: value => value.length < 5 ? `Sorry, password must be longer` : true
        })
        //const dir = await askSaveDirOrExit()
        const dir = flags.directory || path.resolve(await askOrExit({
            type    : 'text',
            message : `Enter a directory to save (eg: ${path.resolve(process.cwd())})`,
            initial : path.resolve(process.cwd(), 'videos/'),
            validate: isValidPath
        }))
        const concurrency = flags.concurrency || await askOrExit({
            type    : 'number',
            message : `Enter concurrency`,
            initial : 10
        })
        laraAll({ email, password, logger, dir, concurrency, file, filePath }).catch(errorHandler)
        return
    }

    const searchOrDownload = flags.file || await askOrExit({
        type   : 'confirm',
        message: 'Choose "Y" if you want to search for a course otherwise choose "N" if you have a link for download',
        initial: true
    })

    if (input.length === 0 && searchOrDownload === false) {
        input.push(await askOrExit({
            type    : 'text',
            message : 'Enter url for download.',
            initial : 'https://laracasts.com/series/graphql-with-laravel-and-vue',
            validate: value => value.includes('laracasts.com') ? true : 'Url is not valid'
        }))
    } else {
        input.push(await askOrExit({
            type    : 'autocomplete',
            message : 'Search for a course',
            choices   : await Crawler.getCourses({ 'ALL_COURSES_URL': 'https://egghead.io/courses' }),
            suggest   : (input, choices) => {
                if (!input) return choices;
                const fuse = new Fuse(choices, {
                    keys: ['title', 'value']
                })
                return fuse.search(input).map(i => i.item);
            },
        }))
    }

    const email = flags.email || await askOrExit({
        type: 'text', message: 'Enter email', validate: value => value.length < 5 ? `Sorry, enter correct email` : true
    })
    const password = flags.password || await askOrExit({
        type    : 'text',
        message : 'Enter password',
        validate: value => value.length < 5 ? `Sorry, password must be longer` : true
    })
    const dir = flags.directory || path.resolve(await askOrExit({
        type    : 'text',
        message : `Enter a directory to save (eg: ${path.resolve(process.cwd())})`,
        initial : path.resolve(process.cwd(), 'videos/'),
        validate: isValidPath
    }))

    const concurrency = flags.concurrency || await askOrExit({
        type    : 'number',
        message : `Enter concurrency`,
        initial : 10
    })
    // const dir = await askSaveDirOrExit()
    const courseUrl = input[0]
    laraOne(courseUrl, { email, password, logger, dir, concurrency }).catch(errorHandler)
})()

