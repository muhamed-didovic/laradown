// @ts-check
const test = require('ava').serial
const Crawler = require('../lib/Crawler')
const sinon = require("sinon");
const Promise = require("bluebird");
const expected = require("./fixtures/extracted-videos.json");
const chapters = require('./fixtures/non-extracted-videos.json')

test('getSingleCourse call', async t => {
    sinon.stub(Crawler.prototype, 'getSingleCourse').callsFake(() => require('./fixtures/course.json'));
    const course = (new Crawler()).getSingleCourse()
    t.true(["Build Mobile Apps With React Native and Expo"].every(s => course.map(item => item.series).includes(s)))
    t.is(course.length, 18)
})

test('getAllCoursesFromSearchAPI call', async t => {
    sinon.stub(Crawler.prototype, 'getAllCoursesFromSearchAPI').callsFake(() => require('./fixtures/courses.json'));
    const courses = (new Crawler()).getAllCoursesFromSearchAPI()
    t.true(["Andrew's Larabits", "Build Mobile Apps With React Native and Expo", "GraphQL with Laravel and Vue"].every(s => (new Crawler()).getAllCoursesFromSearchAPI().map(item => item.series).includes(s)))
    t.is(courses.length, 2030)
})

test('getAllCoursesFromBrowseAllAPI call', async t => {
    sinon.stub(Crawler.prototype, 'getAllCoursesFromBrowseAllAPI').callsFake(() => require('./fixtures/browse-all-courses.json'));
    const courses = (new Crawler()).getAllCoursesFromBrowseAllAPI()
    t.true(['Modals with the TALL Stack', 'Multitenancy in Practice', 'Billing With Laravel Cashier'].every(s => courses.map(item => item.series).includes(s)))
    t.is(courses.length, 2709)
})

test('extractVideos', async t => {
    const courses = await Promise.map(chapters, async (course) => await (new Crawler()).extractVideos(course));
    // const expected = require('./fixtures/extracted-videos.json')
    t.true(expected.every((s, i) => s.series === courses[i].series && s.title === courses[i].title))
    t.is(courses.length, 18)
})
