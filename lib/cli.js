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
    $ laradown --all [-e user@mail.com] [-p password] [-d path-to-directory] [-c concurrency-number] [-f path-to-file]
    $ laradown https://laracasts.com/series/graphql-with-laravel-and-vue
    $ laradown [-e user@gmail.com] [-p password] [-d dirname] [-c number] [-f path-to-file]`,
    {
        flags: {
            help       : { alias: 'h' },
            version    : { alias: 'v' },
            all        : { type: 'boolean', alias: 'a' },
            email      : { type: 'string', alias: 'e' },
            password   : { type: 'string', alias: 'p' },
            directory  : { type: 'string', alias: 'd', },//default: process.cwd()
            concurrency: { type: 'number', alias: 'c', default: 10 },
            file       : { type: 'boolean', alias: 'f' }
        }
    }
)

const logger = createLogger()
// const errorHandler = err => (console.log('\u001B[1K'), logger.fail(String(err)), process.exit(1))
const errorHandler = err => (console.error('MAIN errorr:', err), process.exit(1))//logger.fail(`HERE IS THE ERROR in string: ${String(err}`))
// const errorHandler = err => console.error('err:', err)

const askOrExit = question => prompts({ name: 'value', ...question }, { onCancel: () => process.exit(0) }).then(r => r.value);

const askOverwriteOrExit = () => askOrExit({
    type: 'confirm', message: 'Do you want to overwrite when the file name is the same?', initial: false
});

const askSaveDirOrExit = () => askOrExit({
    type: 'text', message: 'Enter the directory to save.', initial: process.cwd(), validate: isValidPath
});

const folderContents = async (folder) => {
    const files = await fs.readdir(folder)
    // console.log('files', files);
    if (!files.length) {
        return console.log('No files found');
    } else {
        console.log(`found some files: ${files.length} in folder: ${folder}`);
    }

    return files
        //.filter(file => file.includes('.png'))
        .map(file => {
            return ({
                title: file,
                value: path.join(folder, file)
            })
        });

}

async function commonFlags(flags) {
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
    const dir = flags.directory
        ? path.resolve(flags.directory)
        : path.resolve(await askOrExit({
            type    : 'text',
            message : `Enter a directory to save a file (eg: ${path.resolve(process.cwd())})`,
            initial : path.join(process.cwd(), 'videos'),
            validate: isValidPath
        }))
    /*const dir = flags.directory || path.resolve(await askOrExit({
        type    : 'text',
        message : `Enter a directory to save (eg: ${path.resolve(process.cwd())})`,
        initial : path.join(process.cwd(), 'videos'),
        validate: isValidPath
    }))*/
    const concurrency = flags.concurrency || await askOrExit({
        type   : 'number',
        message: `Enter concurrency`,
        initial: 10
    })
    return { email, password, dir, concurrency };
}

(async () => {
    const { flags, input } = cli
    let fileChoices;
    //const fileChoices = await folderContents(path.resolve(process.cwd(), 'json'))

    if (flags.all || (input.length === 0 && await askOrExit({
        type: 'confirm', message: 'Do you want all courses?', initial: false
    }))) {
        const source = flags.source || await askOrExit({
            type   : 'select',
            name   : 'value',
            message: 'Pick which API should be targeted',
            choices: [
                { title        : 'Browse all api (/browse/all)',
                    description: 'Download all from browse all api',
                    value      : 'all'
                },
                { title        : 'Search pages api (/search/{*})',
                    description: 'Download all courses from search pages',
                    value      : 'search'
                },
            ],
            initial: 0
        })

        const file = flags.file || await askOrExit({
            type   : (fileChoices = await folderContents(path.resolve(__dirname, '../json'))).length ? 'confirm' : null,
            message: 'Do you want download from a file',
            initial: false
        })

        const filePath = flags.file || await askOrExit({
            type   : (file && fileChoices.length) ? 'autocomplete' : null,
            message: `Enter a file path eg: ${path.resolve(__dirname, '../json/*.json')} `,
            choices: fileChoices,
            //validate: isValidPath
        })
        const { email, password, dir, concurrency } = await commonFlags(flags);
        return laraAll({ email, password, logger, dir, concurrency, file, filePath, source }).catch(errorHandler)

    }

    if (input.length === 0) {
        const searchOrDownload = flags.file || await askOrExit({
            type   : 'confirm',
            message: 'Choose "Y" if you want to search for a course otherwise choose "N" if you have a link for download',
            initial: true
        })

        if (searchOrDownload === false) {
            input.push(await askOrExit({
                type    : 'text',
                message : 'Enter url for download.',
                initial : 'https://laracasts.com/series/graphql-with-laravel-and-vue',
                validate: value => value.includes('laracasts.com') ? true : 'Url is not valid'
            }))
        } else {
            let searchCoursesFile = false;
            if (await fs.exists(path.resolve(__dirname, '../json/search-courses.json'))) {
                searchCoursesFile = true;
            }

            const foundSearchCoursesFile = await askOrExit({
                type   : (searchCoursesFile && input.length === 0 && !flags.file) ? 'confirm' : null,
                message: 'Do you want to search for a courses from a local file (which is faster)',
                initial: true
            })

            input.push(await askOrExit({
                type   : 'autocomplete',
                message: 'Search for a course',
                choices: await Crawler.getCourses(foundSearchCoursesFile),
                suggest: (input, choices) => {
                    if (!input) return choices;
                    const fuse = new Fuse(choices, {
                        keys: ['title', 'value']
                    })
                    return fuse.search(input).map(i => i.item);
                },
            }))
        }

    }

    const { email, password, dir, concurrency } = await commonFlags(flags);
    // const dir = await askSaveDirOrExit()
    const courseUrl = input[0]
    laraOne(courseUrl, { email, password, logger, dir, concurrency }).catch(errorHandler)
})()

