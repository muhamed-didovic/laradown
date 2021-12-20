#!/usr/bin/env node
const meow = require('meow')
const prompts = require('prompts')
const createLogger = require('./helpers/createLogger')
const { laraOne, laraAll } = require('.')
const path = require('path')
const isValidPath = require("is-valid-path");

const cli = meow(`
Usage
    $ laradown <?SeriesUrl>

Options
    --all, -a           Download everything from browse/all and search APIs.
    --email, -e         Your email.
    --password, -p      Your password.
    --directory, -d           Directory to save.
    --concurrency, -c

Examples
    $ laradown
    $ laradown --all [-e user@mail.com] [-p password] [-d path-to-directory] [-c concurrency-number]
    $ laradown https://laracasts.com/series/graphql-with-laravel-and-vue

`, {
    flags: {
        help       : { alias: 'h' },
        version    : { alias: 'v' },
        all        : { type: 'boolean', alias: 'a' },
        email      : { type: 'string', alias: 'e' },
        password   : { type: 'string', alias: 'p' },
        directory  : { type: 'string', alias: 'd', default: process.cwd() },
        concurrency: { type: 'number', alias: 'c', default: 10 }
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

(async () => {
    const { flags, input } = cli

    if (flags.all || (input.length === 0 && await askOrExit({
        type: 'confirm', message: 'Do you want all courses?', initial: true
    }))) {
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
        laraAll({ email, password, logger, dir }).catch(errorHandler)
        return
    }

    if (input.length === 0) {
        input.push(await askOrExit({
            type    : 'text',
            message : 'Enter url for download.',
            initial : 'https://laracasts.com/series/graphql-with-laravel-and-vue',
            validate: value => value.includes('laracasts.com') ? true : 'Url is not valid'
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
    // const dir = await askSaveDirOrExit()
    const courseUrl = input[0]
    laraOne(courseUrl, { email, password, logger, dir }).catch(errorHandler)
})()

