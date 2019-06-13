'use strict';

const Code = require('@hapi/code');
const Hoek = require('@hapi/hoek');
const Lab = require('@hapi/lab');
const RequestRetry = require('..');
const Wreck = require('@hapi/wreck');

const { describe, it } = exports.lab = Lab.script();
const expect = Code.expect;

describe('RequestRetry', { timeout: 10000 }, () => {

    it('retries if error is a timeout', async () => {

        let failedAttemptCount = 0;
        const timer = new Hoek.Bench();

        const retry = new RequestRetry();
        retry.events.on('failedAttempt', () => failedAttemptCount++);

        const fn = async () => {

            const options = { timeout: 1000 };
            await Wreck.get('https://httpbin.org/delay/5', options);
        };

        const error = await expect(retry.run(fn)).to.reject(Error);
        expect(error.message).to.equal('Client request timeout');
        expect(error.output.statusCode).to.equal(504);
        expect(failedAttemptCount).to.equal(3);
        expect(timer.elapsed()).to.be.at.least(3000);
    });

    it('retries if error is a ENOTFOUND', async () => {

        let failedAttemptCount = 0;
        const timer = new Hoek.Bench();

        const retry = new RequestRetry();
        retry.events.on('failedAttempt', () => failedAttemptCount++);

        const fn = async () => {

            await Wreck.get('http://thisdomaindoesnotexist.nl/');
        };

        const error = await expect(retry.run(fn)).to.reject(Error);
        expect(error.message).to.equal('Client request error: getaddrinfo ENOTFOUND thisdomaindoesnotexist.nl');
        expect(error.output.statusCode).to.equal(502);
        expect(failedAttemptCount).to.equal(3);
        expect(timer.elapsed()).to.be.at.least(3000);
    });
});
