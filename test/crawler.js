// @ts-check
const test = require('ava').serial
const Crawler = require('../lib/Crawler')
const sinon = require("sinon");

test('getSingleCourse call', async t => {
    sinon.stub(Crawler.prototype, 'getSingleCourse').callsFake(() => require('./fixtures/course.json'));
    const course = (new Crawler()).getSingleCourse()
    t.true(["Build Mobile Apps With React Native and Expo"].every(s => course.map(item => item.series).includes(s)))
    t.is(18, course.length)
})

test('getAllCoursesFromSearchAPI call', async t => {
    sinon.stub(Crawler.prototype, 'getAllCoursesFromSearchAPI').callsFake(() => require('./fixtures/courses.json'));
    const courses = (new Crawler()).getAllCoursesFromSearchAPI()
    t.true(["Andrew's Larabits", "Build Mobile Apps With React Native and Expo", "GraphQL with Laravel and Vue"].every(s => (new Crawler()).getAllCoursesFromSearchAPI().map(item => item.series).includes(s)))
    t.is(2030, courses.length)
})

test('getAllCoursesFromBrowseAllAPI call', async t => {
    sinon.stub(Crawler.prototype, 'getAllCoursesFromBrowseAllAPI').callsFake(() => require('./fixtures/browse-all-courses.json'));
    const courses = (new Crawler()).getAllCoursesFromBrowseAllAPI()
    t.true(['Modals with the TALL Stack', 'Multitenancy in Practice', 'Billing With Laravel Cashier'].every(s => courses.map(item => item.series).includes(s)))
    t.is(2709, courses.length)
    /*expect(1).to.equals(c.getAllCoursesFromBrowseAllAPI());
    t.is(1, c.getAllCoursesFromBrowseAllAPI());*/
})

test('extractVideos', async t => {
    sinon.stub(Crawler.prototype, 'extractVideos').callsFake(() => require('./fixtures/non-extracted-videos.json'));
    const courses = (new Crawler()).extractVideos()
    const expected = require('./fixtures/extracted-videos.json')

    t.true(expected.every((s, i) => s.series === courses[i].series.title && s.title === `${courses[i].position}. ${courses[i].title}.mp4`))
    t.is(18, courses.length)
})
